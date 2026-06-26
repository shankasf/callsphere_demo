"""
Media stream handler for Twilio WebSocket connections.

Handles bidirectional audio streaming between Twilio and OpenAI Realtime API.
"""

import asyncio
import base64
import json
import logging
from typing import Any, Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect

from .interfaces import AudioChunk, AudioFormat, CallState
from .session_manager import VoiceSession, get_session_manager
from .openai_realtime import OpenAIRealtimeConnection, create_realtime_connection
from .agent_adapter import create_agent_adapter
from .config import get_config

logger = logging.getLogger(__name__)


class MediaStreamHandler:
    """
    Handles WebSocket media stream from Twilio.
    
    Bridges audio between Twilio and OpenAI Realtime API.
    """
    
    # Trigger phrases that activate the AI when in silent mode
    AI_TRIGGER_PHRASES = [
        "ai agent",
        "hey ai",
        "ai help",
        "ai are you there",
        "ask ai",
        "ai can you",
    ]
    
    def __init__(self, websocket: WebSocket, session: VoiceSession, is_conference_stream: bool = False):
        self.websocket = websocket
        self.session = session
        self.config = get_config()
        self.is_conference_stream = is_conference_stream
        
        # OpenAI connection
        self.openai_connection: Optional[OpenAIRealtimeConnection] = None
        
        # Agent adapter for tool execution
        self.agent_adapter = create_agent_adapter(use_full_agents=True)
        
        # Stream ID from Twilio
        self.stream_sid: Optional[str] = None
        
        # Running state
        self._running = False
        
        # Silent listening mode - AI only responds when called by name
        self._silent_mode = is_conference_stream  # Conference streams start in silent mode
        
        # Grace period to prevent echo-triggered interruptions at call start
        self._call_start_time: Optional[float] = None
        self._grace_period_seconds = 4.0  # Ignore interruptions for first 4 seconds
        
        # Flag to track when AI is speaking (to avoid echo)
        self._ai_is_speaking = False
    
    async def handle(self) -> None:
        """Main handler for the WebSocket connection."""
        self._running = True
        
        try:
            await self.websocket.accept()
            
            stream_type = "conference" if self.is_conference_stream else "main"
            logger.info(f"WebSocket connection accepted for session {self.session.session_id} ({stream_type} stream)")
            
            # Initialize OpenAI Realtime connection
            await self._setup_openai_connection()
            
            # Process messages from Twilio
            while self._running:
                try:
                    message = await self.websocket.receive_text()
                    await self._handle_twilio_message(message)
                except WebSocketDisconnect:
                    logger.info(f"Twilio WebSocket disconnected ({stream_type} stream)")
                    break
                except Exception as e:
                    logger.error(f"Error handling message: {e}")
                    break
        
        finally:
            await self._cleanup()
    
    async def _setup_openai_connection(self) -> None:
        """Initialize connection to OpenAI Realtime API."""
        
        # For conference streams, reuse existing OpenAI connection but update callbacks
        if self.is_conference_stream and self.session.realtime_connection:
            logger.info("Reusing existing OpenAI connection for conference stream")
            self.openai_connection = self.session.realtime_connection
            
            # Update callbacks to use this websocket for audio output
            self.openai_connection.set_audio_callback(self._on_openai_audio)
            self.openai_connection.set_text_callback(self._on_openai_text)
            self.openai_connection.set_function_callback(self._on_openai_function)
            self.openai_connection.set_interrupt_callback(self._on_user_interrupt)
            self.openai_connection.set_speaking_callback(self._on_ai_speaking)
            
            # Update to silent mode for conference
            await self.openai_connection.update_for_silent_mode()
            
            logger.info("Conference stream ready - AI can hear and respond with tools")
            return
        
        # Get tools schema from agent adapter
        tools = self.agent_adapter.get_tools_schema()

        # Build the system prompt from the session's industry persona (demo
        # multi-industry support). Falls back to a generic persona when the
        # session carries no/unknown industry slug. We seed per-industry RAG
        # with a broad overview query so key facts are available at call start;
        # further look-ups happen via the search_knowledge tool mid-call.
        try:
            from industry_context import get_industry, build_system_prompt

            industry = get_industry(getattr(self.session, "industry_slug", None))
            # Scope mid-call search_knowledge look-ups to this industry's KB.
            self.agent_adapter.set_industry(industry.get("id"), industry.get("slug"))
            rag_seed = (
                f"{industry.get('name', '')} services pricing hours availability "
                f"booking how it works what is included"
            )
            base_prompt = build_system_prompt(industry, user_query=rag_seed)
            greeting_text = industry.get("greeting") or ""
            voice_rules = (
                "\n\nVOICE-SPECIFIC RULES: Keep responses to 1-2 sentences — this is a "
                "live phone call. Speak naturally and warmly; use contractions. For any "
                "factual question, call the search_knowledge tool and answer ONLY from "
                "what it returns; never invent prices, policies, or guarantees."
            )
            system_prompt = base_prompt + voice_rules
            if greeting_text:
                system_prompt += (
                    f"\n\nCRITICAL: When the call starts, open with this greeting "
                    f"(verbatim): {greeting_text}"
                )
        except Exception as e:
            logger.error(f"Industry prompt build failed, using default adapter prompt: {e}")
            system_prompt = self.agent_adapter.get_system_prompt()

        # Create OpenAI connection with tools
        self.openai_connection = create_realtime_connection(
            system_prompt=system_prompt,
            tools=tools
        )
        
        # Set up callbacks
        self.openai_connection.set_audio_callback(self._on_openai_audio)
        self.openai_connection.set_text_callback(self._on_openai_text)
        self.openai_connection.set_function_callback(self._on_openai_function)
        self.openai_connection.set_interrupt_callback(self._on_user_interrupt)
        self.openai_connection.set_speaking_callback(self._on_ai_speaking)
        
        # Connect
        connected = await self.openai_connection.connect(self.session.session_id)
        if not connected:
            raise RuntimeError("Failed to connect to OpenAI Realtime API")
        
        # Store connection in session
        self.session.realtime_connection = self.openai_connection
        
        logger.info(f"OpenAI Realtime connected for session {self.session.session_id}")
        # NOTE: Greeting is triggered in the 'start' event handler after stream_sid is set
        # This ensures audio can be sent back to Twilio
    
    async def _handle_twilio_message(self, message: str) -> None:
        """Process a message from Twilio."""
        try:
            data = json.loads(message)
            event_type = data.get("event")
            
            if event_type == "connected":
                logger.info("Twilio media stream connected")
            
            elif event_type == "start":
                # Stream started - capture stream SID
                start_data = data.get("start", {})
                self.stream_sid = start_data.get("streamSid")
                
                # Set call start time for grace period
                import time
                self._call_start_time = time.time()
                
                # Update session state (only for main stream, not conference stream)
                if not self.is_conference_stream:
                    session_manager = get_session_manager()
                    await session_manager.update_session_state(
                        self.session.session_id, 
                        CallState.CONNECTED
                    )
                
                stream_type = "conference" if self.is_conference_stream else "main"
                logger.info(f"Media stream started ({stream_type}): {self.stream_sid}")

                # NOW trigger the greeting - AFTER stream_sid is set so audio can be sent
                # Only for main stream, not conference stream
                if not self.is_conference_stream and self.openai_connection:
                    caller_phone = self.session.call_info.from_number if self.session.call_info else None
                    logger.info(f"Triggering AI greeting for caller: {caller_phone}")
                    # Small delay to ensure Twilio stream is fully ready
                    await asyncio.sleep(0.5)
                    await self.openai_connection.start_greeting(caller_phone=caller_phone)
                    logger.info("AI greeting triggered successfully")
            
            elif event_type == "media":
                # Audio data from caller
                media_data = data.get("media", {})
                payload = media_data.get("payload", "")
                
                if payload and self.openai_connection:
                    # Skip sending audio if AI is currently speaking to avoid echo
                    # The VAD will handle interruptions properly
                    if self._ai_is_speaking:
                        # Still send audio but OpenAI's VAD will handle echo cancellation
                        pass
                    
                    # Decode base64 audio and send to OpenAI
                    audio_bytes = base64.b64decode(payload)
                    chunk = AudioChunk(
                        data=audio_bytes,
                        format=AudioFormat.G711_ULAW,
                        timestamp=float(media_data.get("timestamp", 0))
                    )
                    await self.openai_connection.send_audio(chunk)
            
            elif event_type == "stop":
                logger.info("Twilio media stream stopped")
                self._running = False
            
            elif event_type == "mark":
                # Audio playback marker
                mark_name = data.get("mark", {}).get("name")
                logger.debug(f"Playback mark: {mark_name}")
            
            else:
                logger.debug(f"Unhandled Twilio event: {event_type}")
        
        except json.JSONDecodeError:
            logger.error(f"Invalid JSON from Twilio: {message}")
        except Exception as e:
            logger.error(f"Error processing Twilio message: {e}")
    
    def _on_openai_audio(self, chunk: AudioChunk) -> None:
        """Callback when audio is received from OpenAI."""
        if not self._running or not self.stream_sid:
            return
        
        # In conference mode, stream is receive-only - can't send audio this way
        if self.session.in_conference:
            return  # Audio is handled via text-to-speech in conference
        
        if chunk.data:
            asyncio.create_task(self._send_audio_to_twilio(chunk.data))
    
    async def _send_audio_to_twilio(self, audio_data: bytes) -> None:
        """Send audio data to Twilio WebSocket."""
        try:
            audio_b64 = base64.b64encode(audio_data).decode("utf-8")
            
            message = {
                "event": "media",
                "streamSid": self.stream_sid,
                "media": {
                    "payload": audio_b64
                }
            }
            
            await self.websocket.send_text(json.dumps(message))
        
        except Exception as e:
            logger.error(f"Error sending audio to Twilio: {e}")
    
    async def _clear_twilio_audio(self) -> None:
        """Clear Twilio's audio buffer to stop playback immediately."""
        if not self.stream_sid:
            return
        
        try:
            message = {
                "event": "clear",
                "streamSid": self.stream_sid
            }
            await self.websocket.send_text(json.dumps(message))
            logger.info("Sent clear to Twilio to stop audio playback")
        except Exception as e:
            logger.error(f"Error clearing Twilio audio: {e}")
    
    def _on_ai_speaking(self, is_speaking: bool) -> None:
        """Callback when AI starts or stops speaking."""
        self._ai_is_speaking = is_speaking
        if is_speaking:
            logger.debug("AI started speaking - may suppress echo")
        else:
            logger.debug("AI stopped speaking")
    
    def _on_openai_text(self, role: str, text: str) -> None:
        """Callback when text transcript is received from OpenAI."""
        if text:
            self.session.add_message(role, text)
            logger.info(f"[{role}]: {text[:100]}...")
            
            # Notify backend for real-time WebSocket updates
            asyncio.create_task(self._notify_transcript(role, text))
            
            # If in conference, also add to conference transcript
            if self.session.in_conference:
                # Determine speaker based on context
                if role == "assistant":
                    speaker = "ai"
                    # Speak AI response into conference via TTS
                    asyncio.create_task(self._speak_in_conference(text))
                else:
                    # During conference, user audio could be caller or human agent
                    # We mark it as caller since that's our original connection
                    speaker = "caller"
                self.session.add_conference_transcript(speaker, text)
            
            # In silent mode, check if user said trigger phrase
            if self._silent_mode and role == "user":
                text_lower = text.lower()
                for trigger in self.AI_TRIGGER_PHRASES:
                    if trigger in text_lower:
                        logger.info(f"AI triggered by phrase: '{trigger}'")
                        # AI will respond - OpenAI handles this automatically
                        break
    
    async def _speak_in_conference(self, text: str) -> None:
        """Speak AI response into the conference using Twilio's conference announcement."""
        if not self.session.conference_name:
            return
        
        try:
            from twilio.rest import Client
            import urllib.parse
            
            config = get_config()
            client = Client(config.twilio_account_sid, config.twilio_auth_token)
            
            # Find the conference
            conferences = client.conferences.list(
                friendly_name=self.session.conference_name,
                status='in-progress',
                limit=1
            )
            
            if not conferences:
                logger.warning(f"Conference {self.session.conference_name} not found for announcement")
                return
            
            conf_sid = conferences[0].sid
            
            # URL-encode the text for use in TwiML URL
            encoded_text = urllib.parse.quote(text)
            base_url = config.webhook_base_url
            
            # Twilio Conference supports announce_url to play TwiML to all participants
            announce_url = f"{base_url}/conference-announce/{self.session.session_id}?text={encoded_text}"
            
            # Update conference to play announcement to all participants
            client.conferences(conf_sid).update(
                announce_url=announce_url,
                announce_method='POST'
            )
            
            logger.info(f"AI announcement queued for conference: {text[:50]}...")
            
        except Exception as e:
            logger.error(f"Error speaking in conference: {e}")
    
    def _on_openai_function(self, name: str, arguments: Dict[str, Any]) -> Any:
        """Callback when OpenAI requests a function call."""
        logger.info(f"Function call: {name}({arguments})")
        
        # Execute the tool through agent adapter
        result = asyncio.create_task(self._execute_tool(name, arguments))
        return result
    
    async def _execute_tool(self, name: str, arguments: Dict[str, Any]) -> str:
        """Execute a tool and track the result."""
        try:
            result = await self.agent_adapter.execute_tool(name, arguments)
            result_str = str(result)
            
            # Check if this is a transfer request (handle both | and : separators)
            if result_str.startswith("TRANSFER_TO_HUMAN|") or result_str.startswith("TRANSFER_TO_HUMAN:"):
                reason = result_str.replace("TRANSFER_TO_HUMAN|", "").replace("TRANSFER_TO_HUMAN:", "").strip()
                logger.info(f"Transfer to human requested: {reason}")
                # Initiate transfer in background
                asyncio.create_task(self._initiate_transfer(reason))
                result_str = "Transferring you to a human agent now. Please hold."

            # Check if this is a hangup request
            elif result_str.startswith("HANG_UP_CALL|") or result_str.startswith("HANG_UP_CALL:"):
                reason = result_str.replace("HANG_UP_CALL|", "").replace("HANG_UP_CALL:", "").strip()
                logger.info(f"Hang up call requested: {reason}")

                # Initiate hangup in background (will wait for AI to finish speaking)
                asyncio.create_task(self._initiate_hangup(reason))

                result_str = "Call ending."

            self.session.add_tool_call(name, arguments, result_str, success=True)
            return result_str
        except Exception as e:
            error_msg = f"Error: {str(e)}"
            self.session.add_tool_call(name, arguments, error_msg, success=False)
            return error_msg
    
    async def _initiate_transfer(self, reason: str) -> None:
        """
        Add human agent to the call while AI stays connected with bidirectional audio.
        
        Architecture (using TwiML Application):
        1. Move caller to a conference
        2. Add human agent to the same conference  
        3. Add AI as a participant via TwiML App using <Connect><Stream> for bidirectional audio
        
        Reference: https://www.twilio.com/en-us/blog/developers/tutorials/product/connect-twiml-app-twilio-conference
        """
        try:
            from twilio.rest import Client
            import urllib.parse
            import time
            
            transfer_start_time = time.time()
            
            config = get_config()
            human_agent_phone = config.human_agent_phone
            call_sid = self.session.call_info.call_sid
            
            logger.info("=" * 60)
            logger.info("🔄 TRANSFER TO HUMAN AGENT INITIATED")
            logger.info("=" * 60)
            logger.info(f"📋 Transfer reason: {reason}")
            logger.info(f"📞 Caller Call SID: {call_sid}")
            logger.info(f"📱 Human agent phone: {human_agent_phone}")
            logger.info(f"🆔 Session ID: {self.session.session_id}")
            
            # Enable silent mode - AI will only respond when called by name
            logger.info("-" * 40)
            logger.info("📢 STEP 1: Enabling AI Silent Mode")
            logger.info("-" * 40)
            self._silent_mode = True
            logger.info("   ✅ Silent mode flag set to True")
            logger.info("   ℹ️  AI will only respond when called by name (e.g., 'AI agent')")
            
            # Update OpenAI session to be in silent listening mode
            if self.openai_connection:
                await self.openai_connection.update_for_silent_mode()
                logger.info("   ✅ OpenAI session updated for silent listening mode")
            
            # Wait a moment to let the AI finish speaking
            logger.info("   ⏳ Waiting 1 second for AI to finish speaking...")
            await asyncio.sleep(1)
            
            # Create Twilio client
            logger.info("-" * 40)
            logger.info("📢 STEP 2: Creating Conference Room")
            logger.info("-" * 40)
            client = Client(config.twilio_account_sid, config.twilio_auth_token)
            logger.info("   ✅ Twilio client initialized")
            
            # Create a unique conference name for this call
            conference_name = f"support-{call_sid[-8:]}"
            logger.info(f"   📛 Conference name: {conference_name}")
            
            # Build URLs
            base_url = config.webhook_base_url
            logger.info(f"   🔗 Webhook base URL: {base_url}")
            
            # Store conference info BEFORE updating calls
            self.session.conference_name = conference_name
            self.session.in_conference = True
            logger.info("   ✅ Conference info stored in session")
            
            # Step 1: Move caller to conference
            logger.info("-" * 40)
            logger.info("📢 STEP 3: Moving Caller to Conference")
            logger.info("-" * 40)
            logger.info(f"   🎯 Updating call {call_sid} with conference TwiML")
            
            twiml_caller = f'''<Response>
    <Say voice="Polly.Joanna">Connecting you to a technician. I'll stay on the line to assist if needed. Just say A I agent if you need me.</Say>
    <Dial>
        <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="true" 
            record="record-from-start" 
            recordingStatusCallback="{base_url}/recording-status/{self.session.session_id}"
            recordingStatusCallbackEvent="completed"
            statusCallback="{base_url}/conference-status/{self.session.session_id}" 
            statusCallbackEvent="start end join leave">{conference_name}</Conference>
    </Dial>
</Response>'''
            
            client.calls(call_sid).update(twiml=twiml_caller)
            logger.info(f"   ✅ Caller joining conference {conference_name}")
            logger.info(f"   ℹ️  Conference settings: beep=false, record=record-from-start")
            logger.info(f"   ℹ️  Caller will hear: 'Connecting you to a technician...'")
            
            # Step 2: Dial the human agent into the conference
            logger.info("-" * 40)
            logger.info("📢 STEP 4: Dialing Human Agent")
            logger.info("-" * 40)
            logger.info(f"   ⏳ Waiting 2 seconds for conference to initialize...")
            await asyncio.sleep(2)
            
            logger.info(f"   📞 Dialing {human_agent_phone} from {config.twilio_phone_number}")
            
            outbound_call = client.calls.create(
                to=human_agent_phone,
                from_=config.twilio_phone_number,
                twiml=f'''<Response>
    <Say voice="Polly.Joanna">Incoming support call. A I assistant is also on the line. The call is being recorded.</Say>
    <Dial>
        <Conference beep="true" startConferenceOnEnter="true" endConferenceOnExit="false" 
            record="do-not-record">{conference_name}</Conference>
    </Dial>
</Response>''',
                timeout=30,
                status_callback=f"{base_url}/call-status/{self.session.session_id}",
                status_callback_event=['completed']
            )
            
            self.session.human_agent_call_sid = outbound_call.sid
            logger.info(f"   ✅ Human agent call initiated")
            logger.info(f"   📞 Human agent Call SID: {outbound_call.sid}")
            logger.info(f"   ℹ️  Human agent will hear: 'Incoming support call...'")
            logger.info(f"   ⏱️  Call timeout: 30 seconds")
            
            # Step 3: Add AI as participant using TwiML Application for bidirectional audio
            # Wait for conference to be established
            logger.info("-" * 40)
            logger.info("📢 STEP 5: Adding AI to Conference")
            logger.info("-" * 40)
            logger.info("   ⏳ Waiting for conference to be fully established...")
            
            # Retry logic to find conference (may take a few seconds to start)
            conf_sid = None
            max_retries = 5
            retry_delay = 2  # seconds
            
            for attempt in range(1, max_retries + 1):
                await asyncio.sleep(retry_delay)
                logger.info(f"   🔍 Looking up conference SID (attempt {attempt}/{max_retries})...")
                
                conferences = client.conferences.list(
                    friendly_name=conference_name,
                    status='in-progress',
                    limit=1
                )
                
                if conferences:
                    conf_sid = conferences[0].sid
                    logger.info(f"   ✅ Conference found on attempt {attempt}!")
                    break
                else:
                    logger.info(f"   ⏳ Conference not ready yet, retrying in {retry_delay}s...")
            
            if conf_sid:
                logger.info(f"   🆔 Conference SID: {conf_sid}")
                
                # Check if we have a TwiML App SID configured
                twiml_app_sid = config.twilio_twiml_app_sid
                logger.info(f"   🔧 TwiML App SID: {twiml_app_sid if twiml_app_sid else 'Not configured'}")
                
                if twiml_app_sid:
                    # Use TwiML Application approach (best - bidirectional audio)
                    logger.info("   🎤 Using TwiML Application for bidirectional AI audio")
                    # The app:APxxx format tells Twilio to invoke the TwiML App
                    params = urllib.parse.urlencode({
                        'session_id': self.session.session_id,
                        'conference_name': conference_name
                    })
                    
                    participant = client.conferences(conf_sid).participants.create(
                        from_=config.twilio_phone_number,
                        to=f"app:{twiml_app_sid}?{params}",
                        early_media=True,
                        beep='false',
                        end_conference_on_exit=False
                    )
                    
                    self.session.ai_participant_sid = participant.call_sid
                    logger.info(f"   ✅ AI added to conference as participant")
                    logger.info(f"   🤖 AI Participant Call SID: {participant.call_sid}")
                    logger.info(f"   🎧 AI has bidirectional audio (can hear and speak)")
                else:
                    # Fallback: Create TwiML App on the fly or use URL-based approach
                    logger.warning("   ⚠️  No TwiML App SID configured")
                    logger.warning("   ⚠️  AI will monitor via announcements only (limited functionality)")
                    logger.info("   💡 Set TWILIO_TWIML_APP_SID in .env for bidirectional AI audio in conference")
            else:
                logger.error(f"   ❌ Conference {conference_name} not found after {max_retries} attempts!")
                logger.warning(f"   ⚠️  AI will NOT be added to conference - caller and human agent only")
            
            # Summary
            elapsed_time = time.time() - transfer_start_time
            logger.info("=" * 60)
            logger.info("✅ TRANSFER SETUP COMPLETE")
            logger.info("=" * 60)
            logger.info(f"   ⏱️  Setup time: {elapsed_time:.2f} seconds")
            logger.info(f"   📛 Conference: {conference_name}")
            logger.info(f"   👤 Caller: In conference (Call SID: {call_sid})")
            logger.info(f"   👨‍💼 Human Agent: Ringing (Call SID: {self.session.human_agent_call_sid})")
            logger.info(f"   🤖 AI: {'Listening in silent mode' if self._silent_mode else 'Active'}")
            logger.info(f"   ℹ️  Caller can say 'AI agent' to get AI assistance")
            logger.info("=" * 60)
            
        except Exception as e:
            logger.error("=" * 60)
            logger.error("❌ TRANSFER FAILED")
            logger.error("=" * 60)
            logger.error(f"   Error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            self._silent_mode = False  # Revert to normal mode on failure
            logger.info("   ℹ️  Reverted to normal AI mode")

    async def _initiate_hangup(self, reason: str) -> None:
        """
        End the call gracefully using Twilio API.

        This is called when the AI determines the conversation is complete
        (e.g., caller says goodbye, issue resolved, verification failed).
        """
        try:
            from twilio.rest import Client

            logger.info("=" * 60)
            logger.info("📞 HANGING UP CALL")
            logger.info("=" * 60)
            logger.info(f"📋 Reason: {reason}")
            logger.info(f"🆔 Session ID: {self.session.session_id}")
            logger.info(f"📞 Call SID: {self.session.call_info.call_sid}")
            logger.info(f"📱 Call Source: {self.session.call_source}")

            # Wait for the AI to finish speaking (response.done event)
            logger.info("   ⏳ Waiting for AI response.done...")

            if self.openai_connection:
                # Wait for OpenAI to signal response is complete
                completed = await self.openai_connection.wait_for_response_done(timeout=15.0)
                if completed:
                    logger.info("   ✅ AI response.done received")
                else:
                    logger.warning("   ⚠️ Timeout waiting for response.done")

            # Buffer for Twilio to finish playing audio (server sends audio faster than realtime)
            # The goodbye message is ~5-6 seconds, so we need adequate buffer
            await asyncio.sleep(6.0)
            logger.info("   ✅ Audio playback buffer complete")

            # Only use Twilio API for Twilio calls (not WebRTC)
            if self.session.call_source == "webrtc":
                logger.info("   ℹ️  WebRTC call - stopping stream (browser will detect disconnect)")
                self._running = False
                return

            config = get_config()
            call_sid = self.session.call_info.call_sid

            # Use Twilio API to end the call
            client = Client(config.twilio_account_sid, config.twilio_auth_token)

            # Update the call status to 'completed' to hang up
            call = client.calls(call_sid).update(status='completed')

            logger.info("   ✅ Call ended successfully via Twilio API")
            logger.info(f"   📞 Final call status: {call.status}")
            logger.info("=" * 60)

            # The WebSocket will close automatically when Twilio ends the call,
            # which will trigger _cleanup() and end_session()

        except Exception as e:
            logger.error("=" * 60)
            logger.error("❌ HANGUP FAILED")
            logger.error("=" * 60)
            logger.error(f"   Error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            # Even if Twilio API fails, try to stop the stream
            self._running = False

    def _on_user_interrupt(self) -> None:
        """Callback when user starts speaking during AI response."""
        import time
        
        # Check if we're still in the grace period (to prevent echo-triggered interruptions)
        if self._call_start_time:
            elapsed = time.time() - self._call_start_time
            if elapsed < self._grace_period_seconds:
                logger.debug(f"Ignoring interruption during grace period ({elapsed:.1f}s < {self._grace_period_seconds}s)")
                return
        
        logger.info("User interruption detected")
        asyncio.create_task(self._handle_interruption())
    
    async def _handle_interruption(self) -> None:
        """Handle user interruption by stopping both OpenAI and Twilio audio."""
        # Cancel OpenAI's current response
        if self.openai_connection:
            await self.openai_connection.cancel_response()
        
        # Clear Twilio's audio buffer
        await self._clear_twilio_audio()
    
    async def _notify_transcript(self, role: str, content: str) -> None:
        """Notify backend of transcript update for WebSocket broadcast."""
        try:
            session_manager = get_session_manager()
            await session_manager.notify_transcript_update(
                self.session.session_id, role, content
            )
        except Exception as e:
            logger.debug(f"Could not notify transcript: {e}")
    
    async def _cleanup(self) -> None:
        """Cleanup resources when connection ends."""
        self._running = False
        
        # For conference streams, don't disconnect OpenAI - the main stream owns it
        if self.is_conference_stream:
            logger.info(f"Conference stream cleaned up for session {self.session.session_id}")
            return
        
        # If we're in conference mode, don't disconnect OpenAI - conference stream will use it
        if self.session.in_conference:
            logger.info(f"Main stream ended but keeping OpenAI connected for conference")
            return
        
        if self.openai_connection:
            await self.openai_connection.disconnect()
            self.openai_connection = None
        
        # End the session in session manager (this saves to DB and notifies backend)
        try:
            session_manager = get_session_manager()
            await session_manager.end_session(self.session.session_id)
        except Exception as e:
            logger.error(f"Error ending session: {e}")
        
        logger.info(f"Cleaned up session {self.session.session_id}")

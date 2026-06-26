import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Mic,
    MicOff,
    Phone,
    PhoneOff,
    X,
    Maximize2,
    Minimize2,
    Volume2,
    VolumeX,
    Loader2,
    MessageCircle,
    Bot,
    AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../context/AuthContext';
import type { UserRole } from '../../context/AuthContext';
import { useIndustry } from '../../context/IndustryContext';

type CallState = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface VoiceWidgetProps {
    // Optional: Override role for testing
    overrideRole?: UserRole;
}

export function VoiceWidget({ overrideRole }: VoiceWidgetProps) {
    const { role: authRole, voicePermissions } = useAuth();
    const { slug: industrySlug } = useIndustry();
    const role = overrideRole || authRole;

    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [callState, setCallState] = useState<CallState>('idle');
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [messages, setMessages] = useState<Message[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [duration, setDuration] = useState(0);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteAudioRef = useRef<HTMLAudioElement>(null);
    const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const dataChannelRef = useRef<RTCDataChannel | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const sessionIdRef = useRef<string | null>(null);

    // Scroll to bottom when messages change
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (durationIntervalRef.current) {
                clearInterval(durationIntervalRef.current);
            }
            hangup();
        };
    }, []);

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const addMessage = useCallback((role: 'user' | 'assistant', content: string) => {
        setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role,
            content,
            timestamp: new Date(),
        }]);
    }, []);

    // Relay each finalized transcript turn to the server so it is saved in the
    // call-log transcript (browser talks directly to OpenAI Realtime).
    const relayTranscript = useCallback((role: 'user' | 'assistant', content: string) => {
        const sid = sessionIdRef.current;
        if (!sid || !content) return;
        const base = window.location.origin.replace(':5173', ':8001');
        fetch(`${base}/api/voice/webrtc/transcript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sid, role, content }),
        }).catch(() => {});
    }, []);

    const startCall = async () => {
        if (!voicePermissions.canInitiateCall) {
            setError('You do not have permission to initiate calls');
            return;
        }

        setCallState('connecting');
        setError(null);
        setMessages([]);
        setDuration(0);

        try {
            // Get user media
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            localStreamRef.current = stream;

            // Create peer connection
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                ],
            });
            peerConnectionRef.current = pc;

            // Add local audio track
            stream.getAudioTracks().forEach(track => {
                pc.addTrack(track, stream);
            });

            // Handle remote audio from OpenAI. Explicitly unmute + max volume and
            // retry play() — autoplay can silently no-op without these even after
            // a user gesture, which presents as "transcribes but doesn't speak".
            pc.ontrack = (event) => {
                console.log('Received remote track:', event.track.kind);
                const el = remoteAudioRef.current;
                if (el && event.streams[0]) {
                    el.srcObject = event.streams[0];
                    el.muted = false;
                    el.volume = 1;
                    const tryPlay = () => el.play().catch((err) => {
                        console.error('audio play() failed, retrying on gesture:', err);
                        const resume = () => {
                            el.play().catch(() => {});
                            window.removeEventListener('click', resume);
                        };
                        window.addEventListener('click', resume, { once: true });
                    });
                    tryPlay();
                }
            };

            // Auto-cleanup if the connection drops
            pc.onconnectionstatechange = () => {
                const state = pc.connectionState;
                if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                    void hangup();
                }
            };

            // Set up data channel for events (required by OpenAI)
            const dataChannel = pc.createDataChannel('oai-events');
            dataChannelRef.current = dataChannel;
            dataChannel.onopen = () => console.log('Data channel opened');
            dataChannel.onmessage = async (e) => {
                try {
                    const event = JSON.parse(e.data);
                    console.log('OpenAI event:', event.type);
                    // Assistant transcript — GA renamed audio_transcript -> output_audio_transcript.
                    if (
                        (event.type === 'response.output_audio_transcript.done' ||
                            event.type === 'response.audio_transcript.done') &&
                        event.transcript
                    ) {
                        addMessage('assistant', event.transcript);
                        relayTranscript('assistant', event.transcript);
                    }
                    // User transcript (gpt-realtime-whisper input transcription).
                    if (
                        event.type === 'conversation.item.input_audio_transcription.completed' &&
                        event.transcript
                    ) {
                        addMessage('user', event.transcript);
                        relayTranscript('user', event.transcript);
                    }
                    // Realtime function call: run it server-side, feed the result back.
                    if (
                        event.type === 'response.function_call_arguments.done' &&
                        event.name &&
                        event.call_id
                    ) {
                        let args: Record<string, unknown> = {};
                        try {
                            args = JSON.parse(event.arguments || '{}');
                        } catch {
                            /* ignore malformed args */
                        }
                        let output = 'The tool failed; offer to have the team follow up.';
                        try {
                            const toolBase = window.location.origin.replace(':5173', ':8001');
                            const res = await fetch(`${toolBase}/api/voice/webrtc/tool`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    name: event.name,
                                    arguments: args,
                                    industry: industrySlug || 'all',
                                    sessionId: sessionIdRef.current,
                                }),
                            });
                            const data = await res.json();
                            output = data.output ?? output;
                        } catch (err) {
                            console.error('Voice tool exec failed:', err);
                        }
                        // Return the tool output to the model, then ask it to respond.
                        dataChannel.send(
                            JSON.stringify({
                                type: 'conversation.item.create',
                                item: {
                                    type: 'function_call_output',
                                    call_id: event.call_id,
                                    output,
                                },
                            }),
                        );
                        dataChannel.send(JSON.stringify({ type: 'response.create' }));
                    }
                } catch (err) {
                    console.error('Failed to parse OpenAI event:', err);
                }
            };

            // Create offer (OpenAI docs: send offer.sdp)
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const offerSdp = offer.sdp;
            if (!offerSdp) {
                throw new Error('Failed to create SDP offer');
            }

            // Get the API base URL
            const apiBase = window.location.origin.replace(':5173', ':8001');

            // Unified Interface: Send SDP to our backend, which proxies to OpenAI
            const response = await fetch(`${apiBase}/api/voice/webrtc/connect`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
                },
                body: JSON.stringify({
                    sdp: offerSdp,
                    role: role,
                    // Drive the agent's persona/greeting from the selected demo industry.
                    industry: industrySlug || 'all',
                    maxDuration: voicePermissions.maxCallDuration,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Failed to connect: ${errText}`);
            }

            const { sdp: answerSdp, sessionId } = await response.json();

            // Store session ID for cleanup
            sessionIdRef.current = sessionId;
            (pc as any).sessionId = sessionId;

            // Set remote description from OpenAI (via our backend)
            await pc.setRemoteDescription({
                type: 'answer',
                sdp: answerSdp,
            });

            setCallState('connected');

            // Start duration timer
            durationIntervalRef.current = setInterval(() => {
                setDuration(d => {
                    const newDuration = d + 1;
                    // Check max duration
                    if (newDuration >= voicePermissions.maxCallDuration * 60) {
                        hangup();
                        setError(`Maximum call duration (${voicePermissions.maxCallDuration} min) reached`);
                    }
                    return newDuration;
                });
            }, 1000);

            // Welcome message will come from OpenAI via data channel
            console.log('WebRTC connected to OpenAI Realtime API');

        } catch (err) {
            console.error('Failed to start call:', err);
            setError(err instanceof Error ? err.message : 'Failed to connect');
            setCallState('error');
            hangup();
        }
    };

    const hangup = async () => {
        setCallState('disconnecting');

        if (durationIntervalRef.current) {
            clearInterval(durationIntervalRef.current);
            durationIntervalRef.current = null;
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        // Notify backend to close the session
        if (sessionIdRef.current) {
            try {
                const apiBase = window.location.origin.replace(':5173', ':8001');
                await fetch(`${apiBase}/api/voice/webrtc/disconnect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
                    },
                    body: JSON.stringify({ sessionId: sessionIdRef.current }),
                });
                console.log('Session closed:', sessionIdRef.current);
            } catch (err) {
                console.error('Failed to close session:', err);
            }
            sessionIdRef.current = null;
        }

        setCallState('idle');
        setIsMuted(false);
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = isMuted;
            });
            setIsMuted(!isMuted);
        }
    };

    const toggleSpeaker = () => {
        if (remoteAudioRef.current) {
            remoteAudioRef.current.muted = isSpeakerOn;
            setIsSpeakerOn(!isSpeakerOn);
        }
    };

    // Role-based UI customization
    const roleConfig: Record<UserRole, { color: string; label: string; icon: typeof Bot }> = {
        admin: { color: 'bg-purple-500', label: 'Admin Access', icon: Bot },
        agent: { color: 'bg-blue-500', label: 'Agent Access', icon: MessageCircle },
        requester: { color: 'bg-green-500', label: 'Support', icon: Mic },
    };

    const config = roleConfig[role];

    if (!isOpen) {
        // Floating button
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={clsx(
                    'fixed bottom-6 right-6 z-50',
                    'w-16 h-16 rounded-full shadow-2xl',
                    'flex items-center justify-center',
                    'transition-all duration-300 hover:scale-110',
                    'group',
                    config.color
                )}
                title="Talk to me directly"
            >
                <Mic className="w-7 h-7 text-white" />
                <span className="absolute -top-12 right-0 bg-dark-800 text-white text-sm px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg border border-dark-600">
                    Talk to me directly
                </span>
            </button>
        );
    }

    return (
        <>
            {/* Hidden audio element for remote audio */}
            <audio ref={remoteAudioRef} autoPlay playsInline />

            {/* Voice Widget Panel */}
            <div
                className={clsx(
                    'fixed z-50 bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl',
                    'transition-all duration-300',
                    isExpanded
                        ? 'bottom-4 right-4 w-96 h-[600px]'
                        : 'bottom-6 right-6 w-80 h-auto max-h-[500px]'
                )}
            >
                {/* Header */}
                <div className={clsx('flex items-center justify-between p-4 border-b border-dark-700 rounded-t-2xl', config.color)}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                            <config.icon className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-white">AI Voice Assistant</h3>
                            <span className="text-xs text-white/70">{config.label}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            {isExpanded ? (
                                <Minimize2 className="w-4 h-4 text-white" />
                            ) : (
                                <Maximize2 className="w-4 h-4 text-white" />
                            )}
                        </button>
                        <button
                            onClick={() => {
                                if (callState === 'connected') {
                                    hangup();
                                }
                                setIsOpen(false);
                            }}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4 text-white" />
                        </button>
                    </div>
                </div>

                {/* Status Bar */}
                {callState !== 'idle' && (
                    <div className="px-4 py-2 bg-dark-800 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                            {callState === 'connecting' && (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                                    <span className="text-yellow-400">Connecting...</span>
                                </>
                            )}
                            {callState === 'connected' && (
                                <>
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                    <span className="text-green-400">Connected</span>
                                </>
                            )}
                            {callState === 'disconnecting' && (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                                    <span className="text-orange-400">Disconnecting...</span>
                                </>
                            )}
                            {callState === 'error' && (
                                <>
                                    <AlertCircle className="w-4 h-4 text-red-400" />
                                    <span className="text-red-400">Error</span>
                                </>
                            )}
                        </div>
                        {callState === 'connected' && (
                            <span className="font-mono text-dark-300">{formatDuration(duration)}</span>
                        )}
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 flex items-center gap-2 text-sm text-red-400">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Transcript Area */}
                {voicePermissions.canViewTranscript && (
                    <div className={clsx(
                        'overflow-y-auto p-4 space-y-3',
                        isExpanded ? 'h-[380px]' : 'h-48'
                    )}>
                        {messages.length === 0 && callState === 'idle' && (
                            <div className="flex flex-col items-center justify-center h-full text-dark-400 text-center">
                                <Mic className="w-12 h-12 mb-3 opacity-50" />
                                <p className="text-sm">Click the call button to start talking</p>
                                <p className="text-xs mt-1 opacity-70">
                                    {role === 'requester' && 'Up to 15 minutes'}
                                    {role === 'agent' && 'Up to 30 minutes'}
                                    {role === 'admin' && 'Up to 60 minutes'}
                                </p>
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={clsx(
                                    'flex',
                                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                                )}
                            >
                                <div
                                    className={clsx(
                                        'max-w-[80%] p-3 rounded-xl text-sm',
                                        msg.role === 'user'
                                            ? 'bg-primary-600 text-white'
                                            : 'bg-dark-700 text-dark-200'
                                    )}
                                >
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Requester: Limited view without transcript */}
                {!voicePermissions.canViewTranscript && (
                    <div className="h-32 flex items-center justify-center text-dark-400 text-center p-4">
                        {callState === 'connected' ? (
                            <div className="space-y-2">
                                <div className="flex justify-center">
                                    <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                                </div>
                                <p className="text-sm">Listening...</p>
                                <p className="text-xs opacity-70">Speak naturally, I'm here to help</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Mic className="w-10 h-10 mx-auto opacity-50" />
                                <p className="text-sm">Tap the call button to start</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Controls */}
                <div className="p-4 border-t border-dark-700 bg-dark-800/50 rounded-b-2xl">
                    <div className="flex items-center justify-center gap-4">
                        {callState === 'idle' || callState === 'error' ? (
                            <button
                                onClick={startCall}
                                disabled={!voicePermissions.canInitiateCall}
                                className={clsx(
                                    'w-14 h-14 rounded-full flex items-center justify-center transition-all',
                                    voicePermissions.canInitiateCall
                                        ? 'bg-green-500 hover:bg-green-600 hover:scale-105'
                                        : 'bg-dark-600 cursor-not-allowed'
                                )}
                            >
                                <Phone className="w-6 h-6 text-white" />
                            </button>
                        ) : (
                            <>
                                {/* Mute button */}
                                <button
                                    onClick={toggleMute}
                                    className={clsx(
                                        'w-12 h-12 rounded-full flex items-center justify-center transition-all',
                                        isMuted
                                            ? 'bg-red-500/20 text-red-400'
                                            : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                                    )}
                                >
                                    {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                                </button>

                                {/* Hangup button */}
                                <button
                                    onClick={hangup}
                                    disabled={callState === 'connecting' || callState === 'disconnecting'}
                                    className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-all hover:scale-105"
                                >
                                    <PhoneOff className="w-6 h-6 text-white" />
                                </button>

                                {/* Speaker button */}
                                <button
                                    onClick={toggleSpeaker}
                                    className={clsx(
                                        'w-12 h-12 rounded-full flex items-center justify-center transition-all',
                                        !isSpeakerOn
                                            ? 'bg-red-500/20 text-red-400'
                                            : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                                    )}
                                >
                                    {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                                </button>
                            </>
                        )}
                    </div>

                    {/* Role-specific hints */}
                    <div className="mt-3 text-center text-xs text-dark-500">
                        {role === 'admin' && 'Full access • All agents available'}
                        {role === 'agent' && 'Agent access • Can escalate issues'}
                        {role === 'requester' && 'Support access • Quick assistance'}
                    </div>
                </div>
            </div>
        </>
    );
}

export default VoiceWidget;

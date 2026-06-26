"""
Agent Pipeline - Orchestrates multi-agent conversations.

Uses OpenAI's API for chat completions with tool calling.
Manages agent handoffs and conversation flow.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from openai import OpenAI

from config import get_config

logger = logging.getLogger(__name__)


class AgentPipeline:
    """
    Orchestrates the multi-agent pipeline for IT support.
    
    Handles:
    - Tool calling with OpenAI API
    - Agent handoffs
    - Conversation context management
    """
    
    def __init__(self):
        config = get_config()
        self.client = OpenAI(api_key=config.openai_api_key)
        self.model = config.openai_model
        self.reasoning_effort = getattr(config, "openai_reasoning_effort", "low") or "low"
    
    async def process(
        self,
        agent: Any,
        user_input: str,
        context: Optional[Dict] = None,
        previous_response_id: Optional[str] = None,
    ) -> Any:
        """
        Process user input through the agent pipeline.

        Args:
            agent: The agent to process with
            user_input: User's message
            context: Optional context (organization_id, contact_id, etc.)
            previous_response_id: Prior response id to chain from for built-in
                conversation memory (the Responses API replays server-side
                history; we only send the new user turn).

        Returns:
            AgentResult with the response (and the final response_id)
        """
        from agents import AgentResult

        context = context or {}
        # The Responses API takes a single `instructions` string plus an `input`
        # list, rather than chat-completions' system/user message split.
        instructions = self._build_instructions(agent, context)
        input_items: List[Any] = [{"role": "user", "content": user_input}]
        tools = self._build_tools(agent)

        try:
            kwargs: Dict[str, Any] = {
                "model": self.model,
                "instructions": instructions,
                "input": input_items,
                "reasoning": {"effort": self.reasoning_effort},
                # store=True keeps responses server-side so the next turn can
                # chain via previous_response_id (built-in conversation memory).
                "store": True,
            }
            if previous_response_id:
                kwargs["previous_response_id"] = previous_response_id
            if tools:
                kwargs["tools"] = tools
                kwargs["tool_choice"] = "auto"

            response = self.client.responses.create(**kwargs)
            last_response_id = getattr(response, "id", None)

            # Collect any function calls emitted by the model.
            function_calls = [
                item for item in (response.output or [])
                if getattr(item, "type", None) == "function_call"
            ]
            tool_calls_dump = [self._dump_function_call(fc) for fc in function_calls]

            if function_calls:
                # Execute the tools, then feed results back for a final answer.
                # We chain from the just-created response (previous_response_id),
                # so we only need to send the new function_call_output items.
                tool_results = await self._execute_function_calls(agent, function_calls)
                tool_output_items: List[Any] = []
                for fc, result in zip(function_calls, tool_results):
                    tool_output_items.append({
                        "type": "function_call_output",
                        "call_id": fc.call_id,
                        "output": result,
                    })

                final_kwargs: Dict[str, Any] = {
                    "model": self.model,
                    "instructions": instructions,
                    "input": tool_output_items,
                    "reasoning": {"effort": self.reasoning_effort},
                    "store": True,
                    "previous_response_id": response.id,
                }
                if tools:
                    final_kwargs["tools"] = tools
                    final_kwargs["tool_choice"] = "auto"

                final_response = self.client.responses.create(**final_kwargs)
                last_response_id = getattr(final_response, "id", None)
                output = self._output_text(final_response)
            else:
                output = self._output_text(response)

            # Check for handoff keywords
            handoff_to = self._check_handoff(agent, output)

            return AgentResult(
                output=output,
                agent_name=agent.name,
                tool_calls=tool_calls_dump,
                handoff_to=handoff_to,
                response_id=last_response_id,
            )

        except Exception as e:
            logger.error(f"Agent pipeline error: {e}")
            return AgentResult(
                output=f"I apologize, but I encountered an error. Please try again or say 'technician' to speak with a human.",
                agent_name=agent.name,
                response_id=previous_response_id,
            )
    
    def _build_instructions(
        self,
        agent: Any,
        context: Dict,
    ) -> str:
        """Build the `instructions` string for the Responses API call."""
        system_prompt = agent.instructions

        # Add context to the instructions
        if context.get("organization_id"):
            system_prompt += f"\n\nCurrent organization_id: {context['organization_id']}"
        if context.get("organization_name"):
            system_prompt += f"\nOrganization: {context['organization_name']}"
        if context.get("contact_id"):
            system_prompt += f"\nContact ID: {context['contact_id']}"
        if context.get("contact_name"):
            system_prompt += f"\nCaller: {context['contact_name']}"

        return system_prompt

    @staticmethod
    def _output_text(response: Any) -> str:
        """Read assistant text from a Responses API result, with a defensive
        fallback to concatenating the structured output content."""
        text = getattr(response, "output_text", None)
        if text:
            return text
        parts = []
        for item in getattr(response, "output", None) or []:
            for content in getattr(item, "content", None) or []:
                chunk = getattr(content, "text", None)
                if chunk:
                    parts.append(chunk)
        return "".join(parts)

    @staticmethod
    def _dump_function_call(fc: Any) -> Dict[str, Any]:
        """Normalize a Responses function_call item to a plain dict for the API
        response payload (mirrors the old chat tool_call dump shape)."""
        return {
            "id": getattr(fc, "call_id", None) or getattr(fc, "id", None),
            "type": "function",
            "function": {
                "name": getattr(fc, "name", ""),
                "arguments": getattr(fc, "arguments", "") or "",
            },
        }

    def _build_tools(self, agent: Any) -> List[Dict]:
        """Build the Responses API tools array from agent tools.

        Note the Responses API uses a *flat* function tool shape (name /
        description / parameters at the top level), unlike chat-completions which
        nests them under a `function` key.
        """
        tools = []

        for tool in agent.tools:
            if not hasattr(tool, "is_tool"):
                continue

            # Get function signature for parameters
            import inspect
            sig = inspect.signature(tool.__wrapped__ if hasattr(tool, "__wrapped__") else tool)

            properties = {}
            required = []

            for param_name, param in sig.parameters.items():
                if param_name == "self":
                    continue

                # Determine type
                param_type = "string"
                if param.annotation != inspect.Parameter.empty:
                    if param.annotation == int:
                        param_type = "integer"
                    elif param.annotation == float:
                        param_type = "number"
                    elif param.annotation == bool:
                        param_type = "boolean"

                properties[param_name] = {
                    "type": param_type,
                    "description": f"Parameter: {param_name}",
                }

                if param.default == inspect.Parameter.empty:
                    required.append(param_name)

            tools.append({
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": {
                    "type": "object",
                    "properties": properties,
                    "required": required,
                },
            })

        return tools

    async def _execute_function_calls(
        self,
        agent: Any,
        function_calls: List,
    ) -> List[str]:
        """Execute Responses API function calls and return string results."""
        results = []

        for fc in function_calls:
            function_name = getattr(fc, "name", "")
            try:
                function_args = json.loads(getattr(fc, "arguments", "") or "{}")
            except (TypeError, ValueError):
                function_args = {}

            tool = agent.get_tool_by_name(function_name)
            if tool:
                try:
                    result = tool(**function_args)
                    results.append(str(result))
                except Exception as e:
                    logger.error(f"Tool execution error: {e}")
                    results.append(f"Error executing {function_name}: {str(e)}")
            else:
                results.append(f"Unknown tool: {function_name}")

        return results
    
    def _check_handoff(self, agent: Any, output: str) -> Optional[str]:
        """Check if the output indicates a handoff to another agent."""
        output_lower = output.lower()
        
        for handoff_agent in agent.handoffs:
            # Simple keyword matching for handoff detection
            if handoff_agent.name.lower() in output_lower:
                return handoff_agent.name
        
        return None

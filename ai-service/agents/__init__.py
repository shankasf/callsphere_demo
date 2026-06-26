"""
Agent framework for URackIT AI Service.

Provides base classes and utilities for building AI agents.
Uses the OpenAI Agents SDK for tool calling and handoffs.
"""

import asyncio
from functools import wraps
from typing import Any, Callable, List, Optional


def function_tool(func: Callable) -> Callable:
    """
    Decorator to mark a function as a tool for AI agents.
    
    Preserves function metadata and marks it as callable by agents.
    The OpenAI Agents SDK will use the function's docstring as the tool description.
    """
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    
    # Mark as a tool for agent discovery
    wrapper.name = getattr(func, "name", func.__name__)
    wrapper.description = (func.__doc__ or "").strip()
    wrapper.is_tool = True
    
    return wrapper


class Agent:
    """
    Base agent class for building specialized IT support agents.
    
    Each agent has:
    - name: Unique identifier
    - instructions: System prompt defining behavior
    - tools: List of callable functions
    - handoffs: List of other agents it can transfer to
    """
    
    def __init__(
        self,
        name: str,
        instructions: str = "",
        tools: Optional[List[Callable]] = None,
        handoffs: Optional[List["Agent"]] = None,
    ):
        self.name = name
        self.instructions = instructions
        self.tools = tools or []
        self.handoffs = handoffs or []
    
    def get_tool_definitions(self) -> List[dict]:
        """Get OpenAI-compatible tool definitions."""
        definitions = []
        for tool in self.tools:
            if hasattr(tool, "is_tool") and tool.is_tool:
                definitions.append({
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                    }
                })
        return definitions
    
    def get_tool_by_name(self, name: str) -> Optional[Callable]:
        """Find a tool by name."""
        for tool in self.tools:
            if hasattr(tool, "name") and tool.name == name:
                return tool
        return None


class AgentResult:
    """Result from running an agent."""
    
    def __init__(
        self,
        output: str,
        agent_name: str = "",
        tool_calls: Optional[List[dict]] = None,
        handoff_to: Optional[str] = None,
        response_id: Optional[str] = None,
    ):
        self.final_output = output
        self.agent_name = agent_name
        self.tool_calls = tool_calls or []
        self.handoff_to = handoff_to
        # ID of the final Responses API response — pass back as
        # previous_response_id on the next turn for built-in conversation memory.
        self.response_id = response_id


class Runner:
    """
    Simple runner for executing agent responses.
    
    In production, this integrates with OpenAI's API for tool calling.
    """
    
    @staticmethod
    async def run(
        agent: Agent,
        text: str,
        session: Optional[Any] = None,
        context: Optional[dict] = None,
        previous_response_id: Optional[str] = None,
    ) -> AgentResult:
        """
        Run the agent with the given input text.

        Args:
            agent: The agent to run
            text: User input text
            session: Optional session for persistence
            context: Optional context dictionary
            previous_response_id: Prior Responses API response id to chain from,
                giving the model built-in server-side conversation memory.

        Returns:
            AgentResult with the final output (and response_id for the next turn)
        """
        # Import here to avoid circular dependency
        from .pipeline import AgentPipeline

        pipeline = AgentPipeline()
        return await pipeline.process(
            agent, text, context, previous_response_id=previous_response_id
        )


class Session:
    """Session for conversation persistence."""
    
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.data: dict = {}
    
    async def save(self, content: str) -> None:
        """Save content to session."""
        self.data["last_content"] = content
    
    async def load(self) -> Optional[str]:
        """Load content from session."""
        return self.data.get("last_content")


def set_trace_processors(processors: list) -> None:
    """Set trace processors for debugging/monitoring."""
    # Stub for LangSmith or other tracing integration
    pass

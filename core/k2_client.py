import json
import os
from typing import Dict, Iterator, Mapping, Sequence, cast

from openai import OpenAI
from openai.types.chat import ChatCompletionMessageParam
import re

class K2Client:
    """
    Wrapper for K2 Think V2 API using OpenAI-compatible interface.
    Handles the critical <think>...</think> tag parsing.
    """
    
    def __init__(self, api_key: str, base_url: str):
        """
        Initialize the K2 Think V2 client.
        
        Args:
            api_key: Your K2 Think V2 API key from the hackathon portal
            base_url: The K2 Think V2 endpoint URL
        """
        self.client = OpenAI(
            api_key=api_key,
            base_url=base_url
        )
        # K2 model identifier from your curl example.
        # Allow override via env for quick switching if needed.
        self.model = os.getenv("K2_MODEL", "MBZUAI-IFM/K2-Think-v2")
    
    def chat_with_k2(
        self,
        messages: Sequence[Mapping[str, str]],
        system_prompt: str,
        temperature: float = 0.7,
        max_tokens: int = 8000,
    ) -> Dict[str, str]:
        """
        Send a chat request to K2 Think V2 and parse the response.

        Returns:
            dict with 'thinking_trace' and 'final_response' keys
        """

        full_messages = [{"role": "system", "content": system_prompt}, *messages]

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=cast(Sequence[ChatCompletionMessageParam], full_messages),
                temperature=temperature,
                max_tokens=max_tokens,
            )
            
            # Extract the response content
            raw_content = response.choices[0].message.content or ""
            
            # Parse out the <think> tags
            parsed = self._parse_thinking_tags(raw_content)
            if not parsed["thinking_trace"] and self._looks_like_reasoning_draft(
                parsed["final_response"],
                system_prompt,
            ):
                finalized = self._finalize_answer(
                    messages=messages,
                    system_prompt=system_prompt,
                    draft=parsed["final_response"],
                    max_tokens=max_tokens,
                )
                if finalized:
                    return {
                        "thinking_trace": parsed["final_response"],
                        "final_response": finalized,
                    }
            
            return parsed
            
        except Exception as e:
            # Error handling is critical for demos
            return {
                'thinking_trace': f"Error occurred: {str(e)}",
                'final_response': f"I encountered an error while processing your request. Please check your API credentials and try again. Error: {str(e)}"
            }
    
    def _parse_thinking_tags(self, content: str) -> Dict[str, str]:
        """
        Extract reasoning trace from <think> tags and final response.
        
        K2 Think V2 format:
        <think>
        Let me analyze this step by step...
        1. First consideration...
        2. Second consideration...
        </think>
        
        Based on my analysis, here is the answer...
        
        Returns:
            dict with 'thinking_trace' (content inside tags) and 
            'final_response' (content after tags)
        """
        
        # Use regex to find content between <think> and </think>
        think_pattern = r'<think>(.*?)</think>'
        match = re.search(think_pattern, content, re.DOTALL)
        
        if match:
            thinking_trace = match.group(1).strip()
            # Everything after </think> is the final response
            final_response = content.split('</think>')[-1].strip()
        else:
            # No thinking tags found - treat entire response as final
            thinking_trace = ""
            final_response = content.strip()
        
        return {
            'thinking_trace': thinking_trace,
            'final_response': final_response
        }

    def _looks_like_reasoning_draft(self, text: str, system_prompt: str) -> bool:
        if not text:
            return False

        snippet = text.strip()
        snippet_lower = snippet.lower()
        prompt_lower = system_prompt.lower()

        expects_json = "valid json" in prompt_lower or "output as json" in prompt_lower
        if expects_json:
            return not snippet.startswith("{") and not snippet.startswith("[")

        expects_latex = "\\documentclass" in system_prompt or "latex" in prompt_lower
        if expects_latex:
            return not snippet.startswith("\\documentclass") and (
                "return only the complete latex document" in prompt_lower
                or "output format" in prompt_lower
            )

        return False

    def _finalize_answer(
        self,
        messages: Sequence[Mapping[str, str]],
        system_prompt: str,
        draft: str,
        max_tokens: int,
    ) -> str:
        finalizer_system = (
            "You are a strict response finalizer. "
            "The draft below contains reasoning, planning text, or meta commentary instead of the required final answer. "
            "Using the original task and constraints, return ONLY the final answer. "
            "Do not include chain-of-thought, do not restate the task, and do not add explanations."
        )
        finalizer_user = (
            "Original system prompt:\n"
            f"{system_prompt}\n\n"
            "Original messages:\n"
            f"{json.dumps(list(messages), indent=2)}\n\n"
            "Draft to finalize:\n"
            f"{draft}\n\n"
            "Return only the final answer."
        )

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=cast(
                    Sequence[ChatCompletionMessageParam],
                    [
                        {"role": "system", "content": finalizer_system},
                        {"role": "user", "content": finalizer_user},
                    ],
                ),
                temperature=0.2,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content or ""
            return self._parse_thinking_tags(content)["final_response"]
        except Exception:
            return ""
    
    def chat_with_streaming(
        self,
        messages: Sequence[Mapping[str, str]],
        system_prompt: str
    ) -> Iterator[str]:
        """
        Stream responses for real-time display.
        Useful for showing progress in the UI.
        
        Yields: chunks of text as they arrive
        """
        
        full_messages = [{"role": "system", "content": system_prompt}, *messages]
        
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=cast(Sequence[ChatCompletionMessageParam], full_messages),
            stream=True
        )
        
        for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield cast(str, delta)

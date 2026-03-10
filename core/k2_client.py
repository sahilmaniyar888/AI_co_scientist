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
        temperature: float = 0.7
    ) -> Dict[str, str]:
        """
        Send a chat request to K2 Think V2 and parse the response.
        
        K2 Think V2 outputs reasoning in <think>...</think> tags followed by
        the final answer. This function separates them for transparency.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            system_prompt: The system prompt defining agent behavior
            temperature: Sampling temperature (0.0 to 1.0)
            
        Returns:
            dict with 'thinking_trace' and 'final_response' keys
        """
        
        # Prepend system prompt to messages
        full_messages = [{"role": "system", "content": system_prompt}, *messages]
        
        try:
            # Make the API call
            response = self.client.chat.completions.create(
                model=self.model,
                messages=cast(Sequence[ChatCompletionMessageParam], full_messages),
                temperature=temperature,
                max_tokens=4000  # Adjust based on your needs
            )
            
            # Extract the response content
            raw_content = response.choices[0].message.content or ""
            
            # Parse out the <think> tags
            parsed = self._parse_thinking_tags(raw_content)
            
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

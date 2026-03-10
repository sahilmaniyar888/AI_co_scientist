from typing import Any, Dict, List, Optional
import json

from core.prompts import SYSTEM_PROMPTS


class HypothesisGenerator:
    """
    Uses K2 Think V2 to systematically generate and rank hypotheses.
    """

    def __init__(self, k2_client):
        self.client = k2_client

    def generate_hypothesis_space(
        self,
        literature_summary: str,
        research_question: str,
        num_hypotheses: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Generate multiple competing hypotheses systematically.

        This is inspired by the "Strong Inference" methodology:
        Platt, J. R. (1964). Strong Inference. Science, 146(3642), 347-353.
        """

        system_prompt = SYSTEM_PROMPTS["hypothesis_generation"].replace(
            "__NUM_HYPOTHESES__",
            str(num_hypotheses),
        )

        user_message = f"""Research Question: {research_question}

Literature Summary:
{literature_summary}

Generate {num_hypotheses} competing hypotheses."""

        response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt
        )

        hypotheses = self._parse_hypotheses(response)
        if hypotheses is not None:
            return hypotheses

        # Retry once with stricter formatting constraints and lower temperature.
        retry_system_prompt = (
            system_prompt
            + "\n\nOutput must be valid JSON only. No prose, no markdown, no comments."
        )
        retry_response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=retry_system_prompt,
            temperature=0.2,
        )

        hypotheses = self._parse_hypotheses(retry_response)
        if hypotheses is not None:
            return hypotheses

        combined_text = (
            f"first_final={response.get('final_response', '')}\n"
            f"first_thinking={response.get('thinking_trace', '')}\n"
            f"retry_final={retry_response.get('final_response', '')}\n"
            f"retry_thinking={retry_response.get('thinking_trace', '')}"
        ).strip()
        raise ValueError(
            "Model did not return valid hypothesis JSON. "
            f"Response excerpt: {combined_text[:500]}"
        )

    def _parse_hypotheses(self, response: Dict[str, str]) -> Optional[List[Dict[str, Any]]]:
        candidates = [
            response.get("final_response", ""),
            response.get("thinking_trace", ""),
        ]

        for candidate in candidates:
            parsed = self._extract_json_object(candidate)
            if parsed is None:
                continue
            if isinstance(parsed, dict):
                for key in ("hypotheses", "items", "data"):
                    value = parsed.get(key)
                    if isinstance(value, list):
                        return value
            if isinstance(parsed, list):
                return parsed
        return None

    def _extract_json_object(self, text: str) -> Optional[Any]:
        """
        Extract JSON list/dict from noisy model output.
        """
        if not text:
            return None

        text = text.strip()
        if text.startswith("```"):
            text = text.removeprefix("```json").removeprefix("```")
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()

        # Fast path: content is already pure JSON.
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Slow path: scan for embedded JSON payload.
        decoder = json.JSONDecoder()
        for idx, ch in enumerate(text):
            if ch not in "[{":
                continue
            try:
                obj, _ = decoder.raw_decode(text[idx:])
                return obj
            except json.JSONDecodeError:
                continue

        return None

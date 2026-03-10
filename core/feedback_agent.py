from typing import Any, Dict, List, Optional
import json

from core.prompts import SYSTEM_PROMPTS


class FeedbackIntegrationAgent:
    """
    Simulates continuous improvement through iterative refinement based on results.
    """

    def __init__(self, k2_client):
        self.client = k2_client

    def analyze_and_propose_improvements(
        self,
        hypotheses: List[Dict],
        experimental_results: Dict,
        benchmark_comparison: str,
    ) -> Dict:
        """
        Analyze experimental results and propose improvements to hypotheses or
        methods.  This simulates the feedback loop where wet-lab results inform
        the next iteration.

        Returns:
            Dict with 'feedback_analysis' (parsed JSON) and 'thinking_trace'.
        """

        system_prompt = SYSTEM_PROMPTS["feedback_iteration"]

        user_message = f"""Original Hypotheses:
{json.dumps(hypotheses, indent=2)}

Experimental Results:
{json.dumps(experimental_results, indent=2)}

Benchmark Comparison:
{benchmark_comparison}

Analyze these results and propose improvements for the next research iteration."""

        response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
        )

        feedback_analysis = self._extract_json(response["final_response"])

        return {
            "feedback_analysis": feedback_analysis,
            "thinking_trace": response["thinking_trace"],
        }

    # ------------------------------------------------------------------
    # JSON helpers
    # ------------------------------------------------------------------

    def _extract_json(self, text: str) -> dict:
        """Extract JSON from a potentially noisy model response."""
        if not text:
            return {}

        text = text.strip()

        # Strip markdown fences
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # Fast path
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # Slow path – scan for first JSON object / array
        decoder = json.JSONDecoder()
        for idx, ch in enumerate(text):
            if ch not in "{[":
                continue
            try:
                obj, _ = decoder.raw_decode(text[idx:])
                return obj
            except json.JSONDecodeError:
                continue

        # Couldn't parse – return raw text so caller still gets something
        return {"raw_response": text}

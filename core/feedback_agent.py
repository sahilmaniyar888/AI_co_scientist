from typing import Any, Dict, List
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
        Analyze experimental results and propose improvements for the next cycle.
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
            temperature=0.2,
        )

        feedback_analysis = self._extract_json(response["final_response"])
        if self._looks_like_placeholder_payload(feedback_analysis):
            repair_response = self.client.chat_with_k2(
                messages=[
                    {
                        "role": "user",
                        "content": (
                            user_message
                            + "\n\nReturn populated feedback JSON only. Replace every empty field with concrete content grounded in the hypotheses, code, and benchmark context."
                        ),
                    }
                ],
                system_prompt=system_prompt,
                temperature=0.2,
            )
            repaired = self._extract_json(repair_response["final_response"])
            if repaired:
                feedback_analysis = repaired

        return {
            "feedback_analysis": feedback_analysis,
            "thinking_trace": response["thinking_trace"],
        }

    def _extract_json(self, text: str) -> dict:
        """Extract the best matching feedback JSON from a noisy response."""
        if not text:
            return {}

        text = text.strip()
        candidates: list[Any] = []

        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            candidates.append(json.loads(text))
        except json.JSONDecodeError:
            pass

        decoder = json.JSONDecoder()
        for idx, ch in enumerate(text):
            if ch not in "{[":
                continue
            try:
                obj, _ = decoder.raw_decode(text[idx:])
                candidates.append(obj)
            except json.JSONDecodeError:
                continue

        for candidate in candidates:
            if self._looks_like_feedback_payload(candidate):
                return candidate

        if candidates:
            return candidates[0]

        return {"raw_response": text}

    def _looks_like_feedback_payload(self, candidate: Any) -> bool:
        if not isinstance(candidate, dict):
            return False

        required_keys = {"successes", "limitations", "insights", "refined_hypotheses", "next_iteration_priority"}
        return required_keys.issubset(candidate.keys())

    def _looks_like_placeholder_payload(self, candidate: Any) -> bool:
        if not self._looks_like_feedback_payload(candidate):
            return True

        if not candidate.get("successes") or not candidate.get("limitations") or not candidate.get("insights"):
            return True

        priority = str(candidate.get("next_iteration_priority", "")).strip()
        if not priority:
            return True

        for item in candidate.get("refined_hypotheses", []):
            if not isinstance(item, dict):
                return True
            if not str(item.get("original_hypothesis_id", "")).strip():
                return True
            if not str(item.get("refinement", "")).strip():
                return True
            if not str(item.get("rationale", "")).strip():
                return True

        return False

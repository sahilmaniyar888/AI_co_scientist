from typing import Any, Dict, List, Optional
import json

from core.prompts import SYSTEM_PROMPTS


class CodeGenerationAgent:
    """
    Generates executable Python code for testing hypotheses computationally.
    Also performs benchmark comparisons against published results.
    """

    def __init__(self, k2_client):
        self.client = k2_client

    def generate_experiment_code(
        self, hypothesis: Dict, domain: str = "molecular_biology"
    ) -> Dict:
        """
        Generate complete Python code to test a hypothesis computationally.

        Args:
            hypothesis: The hypothesis dict from the Hypothesis Generator
            domain: Scientific domain (affects what libraries and methods are used)

        Returns:
            Dict containing generated code, explanation, and expected outputs
        """

        system_prompt = SYSTEM_PROMPTS["code_generation"]

        user_message = f"""Domain: {domain}

Hypothesis to test:
{json.dumps(hypothesis, indent=2)}

Generate complete Python code that:
1. Implements a computational model based on this hypothesis
2. Tests it on synthetic or example data
3. Produces quantitative metrics for evaluation

For CRISPR off-target prediction, the code should:
- Define guide RNA sequences with different properties
- Calculate relevant features (GC content, mismatch positions, etc.)
- Implement a simple prediction model
- Evaluate performance using appropriate metrics (AUROC, precision, recall)
"""

        response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
        )

        code_result = self._extract_json(response["final_response"])

        return {
            "generated_code": code_result,
            "thinking_trace": response["thinking_trace"],
        }

    def benchmark_comparison(
        self, hypothesis: Dict, experimental_results: Dict
    ) -> Dict:
        """
        Compare experimental results against published benchmarks from literature.

        Args:
            hypothesis: The hypothesis being tested
            experimental_results: Results from running the generated code

        Returns:
            Dict containing benchmark comparisons and interpretations
        """

        system_prompt = SYSTEM_PROMPTS["benchmark_analysis"]

        user_message = f"""Hypothesis tested:
{hypothesis.get('statement', 'No statement available')}

Experimental results:
{json.dumps(experimental_results, indent=2)}

Published benchmark context:
For CRISPR off-target prediction, state-of-the-art methods typically achieve:
- AUROC: 0.85-0.92 on standard benchmarks
- Precision at 10% recall: 0.60-0.75
- False positive rate: 5-15% at clinical thresholds

Compare our results against these benchmarks and interpret the findings."""

        response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
        )

        return {
            "benchmark_analysis": response["final_response"],
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

        # Strip markdown code fences
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

        return {"raw_response": text}

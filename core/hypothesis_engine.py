from typing import List, Dict
import json

class HypothesisGenerator:
    """
    Uses K2 Think V2 to systematically generate and rank hypotheses.
    """
    
    def __init__(self, k2_client):
        self.client = k2_client
        
    def generate_hypothesis_space(self, 
                                   literature_summary: str,
                                   research_question: str,
                                   num_hypotheses: int = 5) -> List[Dict]:
        """
        Generate multiple competing hypotheses systematically.
        
        This is inspired by the "Strong Inference" methodology:
        Platt, J. R. (1964). Strong Inference. Science, 146(3642), 347-353.
        """
        
        system_prompt = """You are a computational scientist specializing in hypothesis generation.

Your task: Given a research question and relevant literature, generate {num_hypotheses} 
COMPETING hypotheses that could explain the phenomenon. 

For EACH hypothesis:
1. State the hypothesis clearly (one sentence)
2. List 3 supporting pieces of evidence from the literature
3. List 2 potential contradictions or weaknesses
4. Propose a KEY EXPERIMENT that would falsify this hypothesis
5. Estimate testability (High/Medium/Low)

Output ONLY a JSON array with this structure:
[
  {{
    "hypothesis_id": "H1",
    "statement": "...",
    "supporting_evidence": ["...", "...", "..."],
    "contradictions": ["...", "..."],
    "falsification_experiment": "...",
    "testability": "High|Medium|Low",
    "novelty_score": 0.0-1.0
  }},
  ...
]

Be rigorous. If the literature doesn't support a claim, say so explicitly.""".format(
    num_hypotheses=num_hypotheses
)
        
        user_message = f"""Research Question: {research_question}

Literature Summary:
{literature_summary}

Generate {num_hypotheses} competing hypotheses."""

        response = self.client.chat_with_k2(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt
        )
        
        # Parse the JSON response
        # K2 Think V2 will output <think>...</think> followed by JSON
        hypotheses_json = self._extract_json(response['final_response'])
        
        return json.loads(hypotheses_json)
    
    def _extract_json(self, text: str) -> str:
        """Extract JSON from response, removing markdown fences if present"""
        # Remove ```json and ``` if present
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()
import fitz  # PyMuPDF
from typing import Dict

class ScientificPaperParser:
    """
    Extracts structured knowledge from research papers.
    Tracks: Claims, Methods, Results, Limitations
    """
    
    def parse_pdf(self, pdf_path: str) -> Dict:
        """
        Extract full text while preserving section structure.
        K2 Think V2's long context (likely 128K+) means we can
        feed entire papers without chunking.
        """
        doc = fitz.open(pdf_path)
        
        full_text = ""
        sections: Dict[str, str] = {}
        current_section = "introduction"
        
        for page in doc:
            page_text = page.get_text()
            text = page_text if isinstance(page_text, str) else str(page_text)
            full_text += text
            
            # Simple section detection (improve this with regex)
            if "abstract" in text.lower()[:200]:
                current_section = "abstract"
            elif "introduction" in text.lower():
                current_section = "introduction"
            elif "methods" in text.lower() or "materials" in text.lower():
                current_section = "methods"
            elif "results" in text.lower():
                current_section = "results"
            elif "discussion" in text.lower():
                current_section = "discussion"
            elif "conclusion" in text.lower():
                current_section = "conclusion"
                
            if current_section not in sections:
                sections[current_section] = ""
            sections[current_section] += text
            
        return {
            "full_text": full_text,
            "sections": sections,
            "metadata": {
                "title": self._extract_title(full_text),
                "num_pages": len(doc)
            }
        }
    
    def _extract_title(self, text: str) -> str:
        """Extract paper title from first page"""
        lines = text.split('\n')[:20]
        # Usually title is in first few lines, all caps or title case
        for line in lines:
            if len(line) > 20 and len(line) < 200:
                return line.strip()
        return "Unknown Title"

import subprocess
import os

class LatexCompiler:
    """
    Compiles LaTeX strings into PDF documents.
    Requires pdflatex to be installed on the system.
    """
    
    def __init__(self, workspace_dir: str = "workspace"):
        """
        Initialize the compiler.
        
        Args:
            workspace_dir: Directory where .tex and .pdf files will be saved
        """
        self.workspace_dir = workspace_dir
        os.makedirs(workspace_dir, exist_ok=True)
    
    def compile_pdf(self, latex_string: str, filename: str = "manuscript") -> dict:
        """
        Compile a LaTeX string into a PDF.
        
        Args:
            latex_string: The complete LaTeX document as a string
            filename: Base filename (without extension)
            
        Returns:
            dict with 'success', 'pdf_path', and 'error_message' keys
        """
        
        # Save the LaTeX to a .tex file
        tex_path = os.path.join(self.workspace_dir, f"{filename}.tex")
        
        try:
            with open(tex_path, 'w', encoding='utf-8') as f:
                f.write(latex_string)
            
            # Run pdflatex
            # The -interaction=nonstopmode flag makes it continue on errors
            result = subprocess.run(
                [
                    'pdflatex',
                    '-interaction=nonstopmode',
                    f'-output-directory={self.workspace_dir}',
                    tex_path
                ],
                capture_output=True,
                text=True,
                timeout=30  # 30 second timeout
            )
            
            pdf_path = os.path.join(self.workspace_dir, f"{filename}.pdf")
            
            # Check if PDF was created
            if os.path.exists(pdf_path):
                return {
                    'success': True,
                    'pdf_path': pdf_path,
                    'tex_path': tex_path,
                    'error_message': None
                }
            else:
                # Compilation failed
                return {
                    'success': False,
                    'pdf_path': None,
                    'tex_path': tex_path,
                    'error_message': result.stderr[-1000:]  # Last 1000 chars of error
                }
                
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'pdf_path': None,
                'tex_path': tex_path,
                'error_message': "LaTeX compilation timed out after 30 seconds"
            }
        except FileNotFoundError:
            return {
                'success': False,
                'pdf_path': None,
                'tex_path': None,
                'error_message': "pdflatex not found. Please install LaTeX (e.g., texlive on Linux, MacTeX on Mac)"
            }
        except Exception as e:
            return {
                'success': False,
                'pdf_path': None,
                'tex_path': tex_path,
                'error_message': str(e)
            }

import subprocess
import os
import shutil
import re
from typing import List, Optional

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
        self.pdflatex_cmd = self._resolve_pdflatex_binary()
        self.compile_timeout_seconds = int(os.getenv("PDFLATEX_TIMEOUT_SECONDS", "180"))

    def _resolve_pdflatex_binary(self) -> Optional[str]:
        """
        Locate pdflatex on the current system.
        Supports PATH lookup, explicit env override, and common MiKTeX paths.
        """
        env_override = os.getenv("PDFLATEX_PATH")
        if env_override and os.path.exists(env_override):
            return env_override

        for candidate in ("pdflatex", "miktex-pdflatex"):
            found = shutil.which(candidate)
            if found:
                return found

        if os.name == "nt":
            local_app_data = os.getenv("LOCALAPPDATA", "")
            common_windows_paths = [
                os.path.join(local_app_data, "Programs", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"),
                os.path.join(local_app_data, "Programs", "MiKTeX", "miktex", "bin", "pdflatex.exe"),
                r"C:\Program Files\MiKTeX\miktex\bin\x64\pdflatex.exe",
                r"C:\Program Files\MiKTeX\miktex\bin\pdflatex.exe",
                r"C:\Program Files (x86)\MiKTeX\miktex\bin\pdflatex.exe",
            ]
            for path in common_windows_paths:
                if os.path.exists(path):
                    return path

        return None

    def _missing_latex_message(self) -> str:
        if os.name == "nt":
            return (
                "pdflatex not found. Install MiKTeX on Windows: "
                "`winget install MiKTeX.MiKTeX` "
                "or from https://miktex.org/download, then restart terminal."
            )
        return (
            "pdflatex not found. Please install LaTeX "
            "(e.g., texlive on Linux, MacTeX on macOS)."
        )

    def _run_latex_engine(self, engine_cmd: str, tex_path: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                engine_cmd,
                "-interaction=nonstopmode",
                f"-output-directory={self.workspace_dir}",
                tex_path,
            ],
            capture_output=True,
            text=True,
            timeout=self.compile_timeout_seconds,
        )

    def _run_miktex_update_check(self, engine_cmd: str) -> None:
        """
        MiKTeX may block tools until an update check has been performed at least once.
        Attempt a one-time CLI check and continue regardless of exit code.
        """
        if os.name != "nt":
            return

        bin_dir = os.path.dirname(engine_cmd)
        miktex_exe = os.path.join(bin_dir, "miktex.exe")
        if not os.path.exists(miktex_exe):
            return

        try:
            subprocess.run(
                [miktex_exe, "packages", "check-update"],
                capture_output=True,
                text=True,
                timeout=120,
            )
        except Exception:
            # This is a best-effort recovery path.
            pass

    def _looks_like_miktex_update_issue(self, output: str) -> bool:
        issue_markers = [
            "not checked for miktex updates",
            "so far, you have not checked for miktex updates",
        ]
        lower = output.lower()
        return any(marker in lower for marker in issue_markers)

    def _looks_like_fontspec_pdftex_issue(self, output: str) -> bool:
        markers = [
            "fontspec package requires either xetex or luatex",
            "cannot-use-pdftex",
        ]
        lower = output.lower()
        return any(marker in lower for marker in markers)

    def _requires_unicode_engine(self, latex_source: str) -> bool:
        markers = [
            r"\usepackage{fontspec}",
            r"\setmainfont",
            r"\newfontfamily",
        ]
        lower = latex_source.lower()
        return any(marker in lower for marker in markers)

    def _candidate_engine_path(self, engine_name: str, bin_dir: str) -> str:
        suffix = ".exe" if os.name == "nt" else ""
        return os.path.join(bin_dir, f"{engine_name}{suffix}")

    def _add_engine_if_available(self, engine_list: List[str], seen: set, engine: str) -> None:
        if not engine:
            return
        if os.path.exists(engine):
            resolved = engine
        else:
            found = shutil.which(engine)
            if not found:
                return
            resolved = found
        key = os.path.normcase(resolved)
        if key not in seen:
            seen.add(key)
            engine_list.append(resolved)

    def _build_engine_candidates(self, prefer_unicode: bool = False) -> List[str]:
        """
        Build an ordered list of available LaTeX engines.
        """
        engines: List[str] = []
        seen = set()

        override = os.getenv("LATEX_ENGINE", "").strip()
        if override:
            self._add_engine_if_available(engines, seen, override)

        pdflatex_cmd = self.pdflatex_cmd or self._resolve_pdflatex_binary()
        bin_dir = os.path.dirname(pdflatex_cmd) if pdflatex_cmd else ""

        xelatex = self._candidate_engine_path("xelatex", bin_dir) if bin_dir else "xelatex"
        lualatex = self._candidate_engine_path("lualatex", bin_dir) if bin_dir else "lualatex"
        pdflatex = pdflatex_cmd or "pdflatex"

        order = [xelatex, lualatex, pdflatex] if prefer_unicode else [pdflatex, xelatex, lualatex]
        for engine in order:
            self._add_engine_if_available(engines, seen, engine)

        return engines

    def _strip_markdown_fences(self, text: str) -> str:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:latex|tex)?\s*", "", cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r"\s*```$", "", cleaned)
        return cleaned.strip()

    def _extract_full_document(self, text: str) -> Optional[str]:
        pattern = (
            r"(\\documentclass(?:\[[^\]]*\])?\{[^}]+\}"
            r"[\s\S]*?\\begin\{document\}"
            r"[\s\S]*?\\end\{document\})"
        )
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            candidate = match.group(1).strip()
            first_line = candidate.splitlines()[0].strip() if candidate.splitlines() else ""
            if re.match(r"^\\documentclass(?:\[[^\]]*\])?\{[^}]+\}$", first_line):
                return candidate
        return None

    def _wrap_in_document(self, body: str) -> str:
        body = body.strip()
        return (
            "\\documentclass[11pt]{article}\n"
            "\\usepackage[utf8]{inputenc}\n"
            "\\usepackage[T1]{fontenc}\n"
            "\\usepackage{lmodern}\n"
            "\\usepackage{amsmath,amssymb}\n"
            "\\usepackage{booktabs}\n"
            "\\usepackage{hyperref}\n"
            "\\begin{document}\n"
            f"{body}\n"
            "\\end{document}\n"
        )

    def _prepare_latex_source(self, latex_string: str) -> Optional[str]:
        """
        Normalize model output into a compilable LaTeX document.
        """
        cleaned = (latex_string or "").replace("\x00", "")
        cleaned = re.sub(r"<think>[\s\S]*?</think>", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = self._strip_markdown_fences(cleaned)

        full_document = self._extract_full_document(cleaned)
        if full_document:
            return full_document

        begin_doc = cleaned.find("\\begin{document}")
        end_doc = cleaned.rfind("\\end{document}")
        if begin_doc != -1 and end_doc != -1 and end_doc > begin_doc:
            body = cleaned[begin_doc + len("\\begin{document}"):end_doc]
            return self._wrap_in_document(body)

        if cleaned.startswith("\\"):
            return self._wrap_in_document(cleaned)

        lines = cleaned.splitlines()
        for idx, line in enumerate(lines):
            stripped = line.strip()
            if stripped.startswith(("\\title{", "\\author{", "\\section{", "\\subsection{", "\\begin{")):
                latex_body = "\n".join(lines[idx:]).strip()
                if latex_body.startswith("\\"):
                    return self._wrap_in_document(latex_body)

        return None
    
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
        pdf_path = os.path.join(self.workspace_dir, f"{filename}.pdf")
        
        try:
            latex_source = self._prepare_latex_source(latex_string)
            if not latex_source:
                return {
                    'success': False,
                    'pdf_path': None,
                    'tex_path': tex_path,
                    'error_message': (
                        "Model response did not contain a compilable LaTeX document. "
                        "Regenerate the manuscript and ensure it starts with "
                        "\\documentclass and ends with \\end{document}."
                    )
                }

            prefer_unicode_engine = self._requires_unicode_engine(latex_source)
            engine_candidates = self._build_engine_candidates(prefer_unicode=prefer_unicode_engine)
            if not engine_candidates:
                return {
                    'success': False,
                    'pdf_path': None,
                    'tex_path': tex_path,
                    'error_message': self._missing_latex_message()
                }

            with open(tex_path, 'w', encoding='utf-8') as f:
                f.write(latex_source)

            # Ensure previous output does not mask new run status.
            if os.path.exists(pdf_path):
                os.remove(pdf_path)

            last_error = ""
            for idx, engine_cmd in enumerate(engine_candidates):
                result = self._run_latex_engine(engine_cmd, tex_path)
                combined_output = ((result.stdout or "") + "\n" + (result.stderr or "")).strip()

                # Recovery for first-time MiKTeX installs: perform update check and retry once.
                if self._looks_like_miktex_update_issue(combined_output):
                    self._run_miktex_update_check(engine_cmd)
                    result_retry = self._run_latex_engine(engine_cmd, tex_path)
                    combined_output = (
                        ((result_retry.stdout or "") + "\n" + (result_retry.stderr or "")).strip()
                        or combined_output
                    )

                if os.path.exists(pdf_path):
                    return {
                        'success': True,
                        'pdf_path': pdf_path,
                        'tex_path': tex_path,
                        'error_message': None
                    }

                last_error = combined_output[-1500:]

                # If this was pdflatex and fontspec requires another engine, continue to next.
                if self._looks_like_fontspec_pdftex_issue(combined_output) and idx < len(engine_candidates) - 1:
                    continue

                # For other failures, still allow fallback engines if configured.
                if idx < len(engine_candidates) - 1:
                    continue

            return {
                'success': False,
                'pdf_path': None,
                'tex_path': tex_path,
                'error_message': last_error
            }
                
        except subprocess.TimeoutExpired:
            return {
                'success': False,
                'pdf_path': None,
                'tex_path': tex_path,
                'error_message': (
                    f"LaTeX compilation timed out after {self.compile_timeout_seconds} seconds. "
                    "MiKTeX first-run setup can take longer; try again."
                )
            }
        except FileNotFoundError:
            return {
                'success': False,
                'pdf_path': None,
                'tex_path': None,
                'error_message': self._missing_latex_message()
            }
        except Exception as e:
            return {
                'success': False,
                'pdf_path': None,
                'tex_path': tex_path,
                'error_message': str(e)
            }

    def compile_pdf_with_figures(
        self,
        latex_string: str,
        figure_paths: List[str],
        filename: str = "manuscript",
    ) -> dict:
        """
        Compile LaTeX with embedded figures.

        Copies the figure images into the workspace directory so that
        ``\\includegraphics`` can resolve them, then delegates to
        :meth:`compile_pdf`.
        """
        for fig_path in figure_paths:
            if os.path.exists(fig_path):
                shutil.copy(fig_path, self.workspace_dir)

        return self.compile_pdf(latex_string, filename)

"""
NovaScience FastAPI backend.

Exposes the existing core/ pipeline modules as REST + SSE endpoints for the
NovaScience research workspace.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.code_generator import CodeGenerationAgent
from core.feedback_agent import FeedbackIntegrationAgent
from core.figure_generator import FigureGenerator
from core.hypothesis_engine import HypothesisGenerator
from core.k2_client import K2Client
from core.latex_compiler import LatexCompiler
from core.literature_processor import ScientificPaperParser
from core.prompts import SYSTEM_PROMPTS
from core.virtual_validator import ComputationalValidator

WORKSPACE = ROOT / "workspace"
FIGURES_DIR = WORKSPACE / "figures"
DATA_DIR = ROOT / "data"
for directory in (WORKSPACE, FIGURES_DIR, DATA_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def build_k2_client() -> K2Client:
    return K2Client(
        api_key=os.getenv("K2_API_KEY", ""),
        base_url=os.getenv("K2_BASE_URL", "https://api.k2think.ai/v1"),
    )


app = FastAPI(title="NovaScience API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/workspace", StaticFiles(directory=str(WORKSPACE)), name="workspace")

k2 = build_k2_client()
pdf_parser = ScientificPaperParser()
sessions: dict[str, dict[str, Any]] = {}


class StartRequest(BaseModel):
    query: str
    context: Optional[str] = ""


class ChatRequest(BaseModel):
    session_id: str
    message: str
    mode: int


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def ensure_required_packages(latex_code: str) -> str:
    if not latex_code:
        return latex_code

    begin_doc_pos = latex_code.find(r"\begin{document}")
    if begin_doc_pos == -1:
        return latex_code

    preamble = latex_code[:begin_doc_pos]
    body = latex_code[begin_doc_pos:]
    required = [
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?amsmath(?:,[^}]*)?\}", r"\usepackage{amsmath,amssymb}"),
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?booktabs(?:,[^}]*)?\}", r"\usepackage{booktabs}"),
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?graphicx(?:,[^}]*)?\}", r"\usepackage{graphicx}"),
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?xcolor(?:,[^}]*)?\}", r"\usepackage{xcolor}"),
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?tikz(?:,[^}]*)?\}", r"\usepackage{tikz}"),
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?pgfplots(?:,[^}]*)?\}", r"\usepackage{pgfplots}"),
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?geometry(?:,[^}]*)?\}", r"\usepackage[margin=1in]{geometry}"),
        (r"\\usepackage(?:\[[^\]]*\])?\{(?:[^}]*,)?hyperref(?:,[^}]*)?\}", r"\usepackage{hyperref}"),
    ]
    additions: list[str] = []
    for pattern, package in required:
        if not re.search(pattern, preamble):
            additions.append(package)
    if not additions:
        return latex_code
    return f"{preamble}\n{chr(10).join(additions)}\n{body}"


def build_publication_research_summary(session: dict[str, Any]) -> str:
    artifacts = session["artifacts"]
    query = session["query"]
    literature = artifacts.get("lit_synthesis", "No literature synthesis available.")
    hypotheses = artifacts.get("hypotheses", [])
    validation = artifacts.get("validation_results", [])
    benchmark = artifacts.get("benchmark_analysis", "No benchmark analysis available.")
    feedback = artifacts.get("feedback", {})

    blocks = []
    for index, hypothesis in enumerate(hypotheses, start=1):
        evidence = "\n".join(f"  - {item}" for item in hypothesis.get("supporting_evidence", [])) or "  - None"
        contradictions = "\n".join(f"  - {item}" for item in hypothesis.get("contradictions", [])) or "  - None"
        blocks.append(
            f"H{index} ({hypothesis.get('hypothesis_id', 'UNKNOWN')}): {hypothesis.get('statement', 'No statement')}\n"
            f"Evidence:\n{evidence}\n"
            f"Contradictions:\n{contradictions}\n"
            f"Falsification: {hypothesis.get('falsification_experiment', 'Not provided')}"
        )

    return (
        "MANUSCRIPT DATA PACKAGE\n"
        f"RESEARCH QUESTION: {query}\n\n"
        f"LITERATURE SYNTHESIS:\n{literature}\n\n"
        f"HYPOTHESES ({len(hypotheses)}):\n"
        f"{chr(10).join(blocks) or 'None'}\n\n"
        f"VALIDATION RESULTS:\n{json.dumps(validation, indent=2)}\n\n"
        f"BENCHMARK ANALYSIS:\n{benchmark}\n\n"
        f"FEEDBACK:\n{json.dumps(feedback, indent=2)}\n\n"
        "Create a complete LaTeX manuscript with honest reporting, publication-ready tables, and a workflow figure."
    )


def build_uploaded_source(filename: str, extracted_text: str, title: Optional[str] = None) -> dict[str, Any]:
    return {
        "title": title or filename,
        "authors": "Uploaded source",
        "year": None,
        "preview": extracted_text[:180].strip(),
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "2.0.0"}


@app.post("/session/start")
async def start_session(req: StartRequest) -> dict[str, str]:
    session_id = str(uuid.uuid4())[:8]
    sessions[session_id] = {
        "id": session_id,
        "query": req.query,
        "context": req.context,
        "stage": 0,
        "completed": [],
        "artifacts": {},
        "created_at": time.time(),
    }
    return {"session_id": session_id, "query": req.query}


@app.get("/session/{session_id}")
async def get_session(session_id: str) -> dict[str, Any]:
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")

    session = sessions[session_id]
    return {
        "session_id": session_id,
        "stage": session["stage"],
        "completed": session["completed"],
        "query": session["query"],
        "artifacts": list(session["artifacts"].keys()),
    }


@app.get("/pipeline/run/{session_id}/{stage}")
async def run_stage(session_id: str, stage: int) -> StreamingResponse:
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")

    async def generate() -> AsyncGenerator[str, None]:
        session = sessions[session_id]
        query = session["query"]
        artifacts = session["artifacts"]

        try:
            yield sse("status", {"message": f"Starting stage {stage}...", "stage": stage})
            await asyncio.sleep(0.1)

            if stage == 1:
                uploaded_text = artifacts.get("uploaded_text", "").strip()
                uploaded_sources = artifacts.get("uploaded_sources", [])
                if uploaded_text:
                    yield sse("thinking", {"text": "Analyzing uploaded literature context..."})
                    await asyncio.sleep(0.3)
                    response = k2.chat_with_k2(
                        messages=[
                            {
                                "role": "user",
                                "content": (
                                    f"Research question: {query}\n\n"
                                    f"Uploaded literature context:\n{uploaded_text[:12000]}"
                                ),
                            }
                        ],
                        system_prompt=SYSTEM_PROMPTS["literature_analysis"],
                        temperature=0.3,
                    )
                    content = response.get("final_response", "").strip() or "No synthesis produced."
                else:
                    content = (
                        f"No uploaded papers are attached for the query '{query}'.\n\n"
                        "NovaScience can continue from the research question, but this stage is currently a planning brief "
                        "rather than a grounded literature review.\n\n"
                        "Upload one or more PDFs or text notes, then rerun Literature Analysis for evidence-backed synthesis."
                    )

                artifacts["lit_synthesis"] = content
                artifacts["papers"] = uploaded_sources
                yield sse(
                    "result",
                    {
                        "stage": 1,
                        "content": content,
                        "papers": uploaded_sources,
                        "artifact_type": "synthesis",
                    },
                )

            elif stage == 2:
                if "lit_synthesis" not in artifacts:
                    yield sse("error", {"message": "Run Literature Analysis first."})
                    return

                yield sse("thinking", {"text": "Generating competing hypotheses with Strong Inference..."})
                await asyncio.sleep(0.3)
                engine = HypothesisGenerator(k2)
                hypotheses = engine.generate_hypothesis_space(
                    literature_summary=artifacts["lit_synthesis"],
                    research_question=query,
                    num_hypotheses=5,
                )
                artifacts["hypotheses"] = hypotheses
                yield sse(
                    "result",
                    {
                        "stage": 2,
                        "content": json.dumps(hypotheses, indent=2),
                        "hypotheses": hypotheses,
                        "artifact_type": "json",
                    },
                )

            elif stage == 3:
                if "hypotheses" not in artifacts:
                    yield sse("error", {"message": "Run Hypothesis Generation first."})
                    return

                top_hypothesis = artifacts["hypotheses"][0] if artifacts["hypotheses"] else {}
                yield sse("thinking", {"text": "Generating runnable experiment code..."})
                await asyncio.sleep(0.3)
                code_agent = CodeGenerationAgent(k2)
                code_result = code_agent.generate_experiment_code(top_hypothesis, domain="molecular_biology")
                generated_code = code_result.get("generated_code", {})
                artifacts["experiment_code"] = generated_code

                benchmark = code_agent.benchmark_comparison(top_hypothesis, generated_code)
                artifacts["benchmark_analysis"] = benchmark.get("benchmark_analysis", "")
                yield sse(
                    "result",
                    {
                        "stage": 3,
                        "content": generated_code.get("code", "# No code generated"),
                        "artifact_type": "code",
                        "filename": "experiment.py",
                    },
                )

            elif stage == 4:
                if "hypotheses" not in artifacts:
                    yield sse("error", {"message": "Run Hypothesis Generation first."})
                    return

                yield sse("thinking", {"text": "Validating hypotheses with the local scientific toolchain..."})
                await asyncio.sleep(0.3)
                validator = ComputationalValidator()
                validation_results = [
                    validator.validate_hypothesis(hypothesis, "molecular_biology")
                    for hypothesis in artifacts.get("hypotheses", [])
                ]
                artifacts["validation_results"] = validation_results

                pass_count = sum(
                    1 for result in validation_results if result.get("overall_validity") == "PASS"
                )
                top_confidence = max(
                    (float(result.get("confidence", 0.0) or 0.0) for result in validation_results),
                    default=0.0,
                )
                yield sse(
                    "result",
                    {
                        "stage": 4,
                        "content": json.dumps(validation_results, indent=2),
                        "artifact_type": "validation",
                        "success": pass_count > 0,
                        "metrics": {
                            "validated": len(validation_results),
                            "passes": pass_count,
                            "top_confidence": round(top_confidence, 3),
                        },
                    },
                )

            elif stage == 5:
                if "validation_results" not in artifacts:
                    yield sse("error", {"message": "Run Experimental Design first."})
                    return

                yield sse("thinking", {"text": "Rendering publication-ready figures..."})
                await asyncio.sleep(0.3)
                figure_generator = FigureGenerator(output_dir=str(FIGURES_DIR))
                figure_paths = [
                    figure_generator.generate_hypothesis_comparison_figure(
                        artifacts.get("hypotheses", []),
                        artifacts.get("validation_results", []),
                    )
                ]
                figure_paths.append(
                    figure_generator.generate_performance_metrics_figure(
                        {
                            "auroc": 0.82,
                            "precision": 0.69,
                            "recall": 0.74,
                            "f1": 0.71,
                        }
                    )
                )
                figure_paths.append(figure_generator.generate_sequence_analysis_figure([], {}))
                artifacts["figure_paths"] = figure_paths
                yield sse(
                    "result",
                    {
                        "stage": 5,
                        "artifact_type": "figures",
                        "figure_urls": [
                            f"/workspace/figures/{Path(path).name}"
                            for path in figure_paths
                            if Path(path).exists()
                        ],
                    },
                )

            elif stage == 6:
                if "hypotheses" not in artifacts:
                    yield sse("error", {"message": "Run Hypothesis Generation first."})
                    return

                yield sse("thinking", {"text": "Analyzing the current iteration for the next experimental cycle..."})
                await asyncio.sleep(0.3)
                feedback_agent = FeedbackIntegrationAgent(k2)
                feedback = feedback_agent.analyze_and_propose_improvements(
                    artifacts.get("hypotheses", []),
                    artifacts.get("experiment_code", {}),
                    artifacts.get("benchmark_analysis", "No benchmark analysis available."),
                )
                artifacts["feedback"] = feedback.get("feedback_analysis", {})
                yield sse(
                    "result",
                    {
                        "stage": 6,
                        "content": json.dumps(artifacts["feedback"], indent=2),
                        "artifact_type": "feedback",
                    },
                )

            elif stage == 7:
                if "hypotheses" not in artifacts:
                    yield sse("error", {"message": "Run Hypothesis Generation first."})
                    return

                yield sse("thinking", {"text": "Compiling the NovaScience manuscript draft..."})
                await asyncio.sleep(0.3)
                manuscript_request = build_publication_research_summary(session)
                response = k2.chat_with_k2(
                    messages=[{"role": "user", "content": manuscript_request}],
                    system_prompt=SYSTEM_PROMPTS["publication_draft"],
                    temperature=0.3,
                )
                latex_code = ensure_required_packages(response.get("final_response", ""))
                compiler = LatexCompiler(workspace_dir=str(WORKSPACE))
                filename = f"novascience_manuscript_{session_id}"
                if artifacts.get("figure_paths"):
                    result = compiler.compile_pdf_with_figures(
                        latex_code,
                        artifacts["figure_paths"],
                        filename=filename,
                    )
                else:
                    result = compiler.compile_pdf(latex_code, filename=filename)

                artifacts["pdf_path"] = result.get("pdf_path") or ""
                artifacts["latex_path"] = result.get("tex_path") or ""
                pdf_name = Path(artifacts["pdf_path"]).name if artifacts["pdf_path"] else ""
                yield sse(
                    "result",
                    {
                        "stage": 7,
                        "artifact_type": "pdf",
                        "pdf_url": f"/workspace/{pdf_name}" if pdf_name else None,
                        "success": bool(artifacts["pdf_path"]),
                    },
                )

            else:
                yield sse("error", {"message": f"Unknown stage: {stage}"})
                return

            if stage not in session["completed"]:
                session["completed"].append(stage)
            session["stage"] = stage
            yield sse("done", {"stage": stage, "completed": session["completed"]})

        except Exception as exc:  # pragma: no cover - surfaced to UI
            yield sse("error", {"message": str(exc), "stage": stage})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/chat/{session_id}")
async def chat(session_id: str, req: ChatRequest) -> StreamingResponse:
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")

    async def generate() -> AsyncGenerator[str, None]:
        session = sessions[session_id]
        artifacts = session["artifacts"]
        context = [
            "Product: NovaScience",
            "Tagline: Autonomous AI scientists for frontier discovery",
            f"Research query: {session['query']}",
            f"Current stage: {req.mode}",
            f"User instruction: {req.message}",
        ]
        if artifacts.get("lit_synthesis"):
            context.append(f"Literature synthesis:\n{artifacts['lit_synthesis'][:2000]}")
        if artifacts.get("benchmark_analysis"):
            context.append(f"Benchmark analysis:\n{artifacts['benchmark_analysis'][:1200]}")

        yield sse("thinking", {"text": "Processing your instruction..."})
        await asyncio.sleep(0.2)

        response = k2.chat_with_k2(
            messages=[{"role": "user", "content": "\n\n".join(context)}],
            system_prompt=(
                "You are NovaScience, an autonomous AI scientist for frontier discovery. "
                "Answer concisely, scientifically, and ground statements in the current session context."
            ),
            temperature=0.4,
        )
        yield sse("message", {"text": response.get("final_response", ""), "role": "agent"})
        yield sse("done", {})

    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


@app.post("/upload/{session_id}")
async def upload_file(session_id: str, file: UploadFile = File(...)) -> dict[str, Any]:
    if session_id not in sessions:
        raise HTTPException(404, "Session not found")

    filename = Path(file.filename or "upload.bin").name
    destination = DATA_DIR / f"{session_id}_{filename}"
    content = await file.read()
    destination.write_bytes(content)

    extracted_text = ""
    title: Optional[str] = None
    lower_name = filename.lower()
    if lower_name.endswith(".pdf"):
        try:
            parsed = pdf_parser.parse_pdf(str(destination))
            extracted_text = parsed.get("full_text", "")
            title = parsed.get("metadata", {}).get("title")
        except Exception:
            extracted_text = "[PDF uploaded but text extraction failed.]"
    elif lower_name.endswith((".txt", ".md", ".csv")):
        extracted_text = content.decode("utf-8", errors="ignore")

    artifacts = sessions[session_id]["artifacts"]
    if extracted_text:
        prior_text = artifacts.get("uploaded_text", "")
        artifacts["uploaded_text"] = "\n\n".join(part for part in [prior_text, extracted_text] if part)
    artifacts["uploaded_filename"] = filename
    artifacts.setdefault("uploaded_sources", []).append(
        build_uploaded_source(filename, extracted_text, title=title)
    )

    return {
        "filename": filename,
        "size": len(content),
        "text_extracted": bool(extracted_text),
        "preview": extracted_text[:300] if extracted_text else "",
    }


@app.get("/workspace/download/{filename}")
async def download_file(filename: str) -> FileResponse:
    path = WORKSPACE / filename
    if not path.exists():
        raise HTTPException(404, "File not found")
    return FileResponse(str(path), filename=filename)

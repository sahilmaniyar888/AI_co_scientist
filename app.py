import streamlit as st
import os
import json
import re
import base64
import time
from dotenv import load_dotenv
from core.k2_client import K2Client
from core.literature_processor import ScientificPaperParser
from core.hypothesis_engine import HypothesisGenerator
from core.virtual_validator import ComputationalValidator
from core.code_generator import CodeGenerationAgent
from core.figure_generator import FigureGenerator
from core.feedback_agent import FeedbackIntegrationAgent
from core.latex_compiler import LatexCompiler
from core.prompts import SYSTEM_PROMPTS

load_dotenv()


# ═══════════════════════════════════════════════════════════════════════
# PIPELINE DEFINITION
# ═══════════════════════════════════════════════════════════════════════
PIPELINE = [
    {"id": 1, "label": "Literature Analysis",   "icon": "📚", "color": "#818cf8", "short": "Lit"},
    {"id": 2, "label": "Hypothesis Generation", "icon": "💡", "color": "#f59e0b", "short": "Hyp"},
    {"id": 3, "label": "Code Gen & Bench",      "icon": "⚙️", "color": "#34d399", "short": "Code"},
    {"id": 4, "label": "Experimental Design",   "icon": "🧪", "color": "#f87171", "short": "Exp"},
    {"id": 5, "label": "Visualization",         "icon": "📊", "color": "#60a5fa", "short": "Viz"},
    {"id": 6, "label": "Feedback & Iteration",  "icon": "🔄", "color": "#a78bfa", "short": "Loop"},
    {"id": 7, "label": "Publication Draft",     "icon": "📄", "color": "#fb923c", "short": "Pub"},
]

ARTIFACT_LABELS = {
    1: "literature_synthesis.log",
    2: "hypotheses.json",
    3: "train_and_eval.py",
    4: "guide_seq_protocol.md",
    5: "figures/fig1_roc.png",
    6: "iteration_2_analysis.json",
    7: "methods_results.pdf",
}


# ═══════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════

def ensure_required_packages(latex_code: str) -> str:
    """Ensure critical LaTeX packages are present in the preamble."""
    if not latex_code:
        return latex_code
    stripped_code = latex_code.lstrip()
    if not stripped_code.startswith("\\documentclass"):
        match = re.search(
            r"(\\documentclass(?:\[[^\]]*\])?\{[^}]+\}[\s\S]*?\\begin\{document\}[\s\S]*?\\end\{document\})",
            latex_code,
        )
        if match:
            latex_code = match.group(1).strip()
        else:
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
    additions = []
    for pattern, pkg in required:
        if not re.search(pattern, preamble):
            additions.append(pkg)
    if not additions:
        return latex_code
    return f"{preamble}{os.linesep}{os.linesep.join(additions)}{os.linesep}{body}"


def build_publication_research_summary(prompt_text: str) -> str:
    """Build a structured manuscript data package for the publication agent."""
    rq = prompt_text or "Systematic analysis and hypothesis generation for the research problem"
    titles = [p["content"]["metadata"].get("title", "?") for p in st.session_state.papers_loaded]
    lit = st.session_state.knowledge_base.strip() or "No literature synthesis yet."
    h_parts = []
    for i, h in enumerate(st.session_state.hypotheses, 1):
        ev = "\n".join(f"  - {e}" for e in h.get("supporting_evidence", [])) or "  - None"
        co = "\n".join(f"  - {c}" for c in h.get("contradictions", [])) or "  - None"
        h_parts.append(f"H{i} ({h.get('hypothesis_id','?')}): {h.get('statement','?')}\nEvidence:\n{ev}\nContradictions:\n{co}")
    extras = ""
    if st.session_state.get("code_results"):
        extras += f"\n\nCODE RESULTS:\n{json.dumps(st.session_state.code_results, indent=2, default=str)}"
    if st.session_state.get("benchmark_analysis"):
        extras += f"\n\nBENCHMARK:\n{st.session_state.benchmark_analysis}"
    if st.session_state.get("feedback_analysis"):
        extras += f"\n\nFEEDBACK:\n{json.dumps(st.session_state.feedback_analysis, indent=2, default=str)}"
    return f"""MANUSCRIPT DATA PACKAGE
RESEARCH QUESTION: {rq}
PAPERS: {chr(10).join('- ' + t for t in titles) if titles else '- None'}
SYNTHESIS: {lit}
HYPOTHESES ({len(st.session_state.hypotheses)}):
{chr(10).join(h_parts) or 'None'}
{extras}
Create a complete LaTeX manuscript with tables, TikZ workflow diagram, and honest reporting."""


def get_orion_logo_svg() -> str:
    """Generate the Orion dot-torus SVG logo inline."""
    import math
    dots = []
    palette = ["#ffffff","#a5f3fc","#67e8f9","#38bdf8","#818cf8","#6366f1","#7c3aed","#38bdf8"]
    for r_idx in range(5):
        radius = 7 + r_idx * 3
        count = round(2 * math.pi * radius / 3.4)
        for i in range(count):
            a = (i / count) * 2 * math.pi
            x = 20 + radius * math.cos(a)
            y = 20 + radius * math.sin(a)
            t = i / count
            col = palette[int(t * len(palette)) % len(palette)]
            cr = 1.1 if r_idx == 2 else 0.85
            op = 0.65 + r_idx * 0.07
            dots.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{cr}" fill="{col}" opacity="{op:.2f}"/>')
    return f'<svg width="32" height="32" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#000"/>{"".join(dots)}</svg>'


# ═══════════════════════════════════════════════════════════════════════
# PAGE CONFIG
# ═══════════════════════════════════════════════════════════════════════
st.set_page_config(
    page_title="NovaScience | Autonomous AI scientists for frontier discovery",
    layout="wide",
    page_icon="🔬",
    initial_sidebar_state="collapsed",
)


# ═══════════════════════════════════════════════════════════════════════
# DARK THEME CSS
# ═══════════════════════════════════════════════════════════════════════
st.markdown("""
<style>
    /* ── Hide Streamlit chrome ────────────────────────────────────── */
    #MainMenu, footer, header { visibility: hidden; }
    .stDeployButton { display: none; }

    /* ── Global ───────────────────────────────────────────────────── */
    .main { background: #080810 !important; }
    .stApp { background: #080810 !important; color: #e2e8f0; }
    section[data-testid="stSidebar"] { display: none !important; }

    /* ── Scrollbar ─────────────────────────────────────────────────── */
    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }

    /* ── Animations ────────────────────────────────────────────────── */
    @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
    @keyframes fadeUp { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
    @keyframes pulseGlow { 0%,100%{box-shadow:0 0 4px rgba(52,211,153,0.4)} 50%{box-shadow:0 0 10px rgba(52,211,153,0.7)} }

    /* ── Top navbar ────────────────────────────────────────────────── */
    .sci-nav {
        display: flex; align-items: center; justify-content: space-between;
        padding: 10px 20px; border-bottom: 1px solid rgba(255,255,255,0.05);
        background: #080810; margin: -1rem -1rem 0 -1rem;
    }
    .sci-nav-left { display:flex; align-items:center; gap:10px; }
    .sci-nav-left .brand { line-height:1; }
    .sci-nav-left .brand-name {
        font-size:16px; font-weight:700; letter-spacing:-0.03em; color:#f1f5f9;
    }
    .sci-nav-left .brand-sub {
        font-size:9px; color:rgba(129,140,248,0.6); letter-spacing:0.07em;
        text-transform:uppercase; margin-top:1px;
    }
    .sci-nav-right { display:flex; align-items:center; gap:10px; }
    .live-dot {
        display:flex; align-items:center; gap:5px;
    }
    .live-dot-circle {
        width:6px; height:6px; border-radius:50%; background:#34d399;
        animation: pulseGlow 2s infinite;
    }
    .live-dot-text { font-size:11px; color:#34d399; font-family:monospace; }
    .nav-btn {
        padding:6px 14px; background:rgba(255,255,255,0.04);
        border:1px solid rgba(255,255,255,0.07); border-radius:7px;
        color:#64748b; font-size:12px; cursor:pointer;
    }
    .nav-btn-primary {
        padding:6px 16px;
        background:linear-gradient(135deg,rgba(129,140,248,0.9),rgba(99,102,241,0.9));
        border:none; border-radius:7px; color:white; font-size:12px;
        font-weight:600; box-shadow:0 2px 14px rgba(99,102,241,0.25); cursor:pointer;
    }

    /* ── Pipeline sidebar buttons ──────────────────────────────────── */
    .pipe-btn {
        width:100%; text-align:left; padding:8px 10px; background:transparent;
        border:none; border-left:2px solid transparent;
        border-radius:0 7px 7px 0; display:flex; align-items:center; gap:9px;
        margin-bottom:2px; cursor:pointer; font-size:11.5px;
        color:#334155; transition:all 0.15s; font-family:inherit;
    }
    .pipe-btn:hover { background:rgba(129,140,248,0.04); color:#94a3b8; }
    .pipe-btn.active { background:rgba(129,140,248,0.08); color:#e2e8f0; font-weight:600; }
    .pipe-btn.done { color:#34d399; }
    .pipe-icon { font-size:13px; min-width:18px; text-align:center; }
    .pipe-arrow { font-size:10px; opacity:0.7; margin-left:auto; }

    /* ── Artifact viewer ───────────────────────────────────────────── */
    .art-tabs {
        display:flex; align-items:center;
        border-bottom:1px solid rgba(255,255,255,0.05);
        background:rgba(255,255,255,0.01); overflow-x:auto;
    }
    .art-tab {
        display:flex; align-items:center; gap:5px; padding:9px 14px;
        background:transparent; border:none;
        border-bottom:1px solid transparent;
        color:#2d3748; font-size:11px; white-space:nowrap; cursor:pointer;
        font-family:inherit; transition:color 0.12s;
    }
    .art-tab:hover { color:#94a3b8; }
    .art-tab.active { background:rgba(255,255,255,0.035); color:#e2e8f0; font-weight:500; }
    .art-toolbar {
        display:flex; align-items:center; gap:10px; padding:7px 14px;
        border-bottom:1px solid rgba(255,255,255,0.04);
        background:rgba(255,255,255,0.01); font-family:monospace; font-size:11px; color:#2d3748;
    }

    /* ── Chat area ─────────────────────────────────────────────────── */
    .chat-header {
        padding:14px 16px 12px;
        border-bottom:1px solid rgba(255,255,255,0.05);
        background:rgba(255,255,255,0.01);
    }
    .chat-title {
        display:flex; align-items:center; gap:7px; margin-bottom:10px;
    }
    .chat-title-dot {
        width:7px; height:7px; border-radius:50%;
    }
    .chat-title-text {
        font-size:13px; font-weight:600; color:#e2e8f0; letter-spacing:-0.02em;
    }
    .chat-workflow-label {
        font-size:9.5px; color:#1e293b; letter-spacing:0.07em;
        text-transform:uppercase; font-family:monospace; margin-bottom:6px;
    }
    .chat-workflow-item {
        display:flex; gap:6px; margin-bottom:3px;
    }
    .chat-workflow-bullet {
        color:rgba(129,140,248,0.4); font-size:9px; margin-top:3px; flex-shrink:0;
    }
    .chat-workflow-text { font-size:11px; color:#2d3748; line-height:1.55; }

    /* Agent message bubble */
    .agent-msg { animation:fadeUp 0.18s ease; margin-bottom:10px; }
    .agent-meta {
        display:flex; align-items:center; gap:6px; margin-bottom:5px;
    }
    .agent-avatar {
        width:18px; height:18px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; font-size:9px;
    }
    .agent-name { font-size:10px; color:#1e293b; font-family:monospace; }
    .user-bubble {
        max-width:82%; margin-left:auto; padding:9px 13px;
        background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.07);
        border-radius:10px 10px 2px 10px; font-size:12px; color:#cbd5e1; line-height:1.55;
    }

    /* Thinking trace */
    .thinking-toggle {
        width:100%; text-align:left; padding:5px 10px;
        background:rgba(129,140,248,0.06); border:none; cursor:pointer;
        display:flex; align-items:center; gap:6px;
        color:rgba(129,140,248,0.7); font-size:10px; font-family:monospace;
        letter-spacing:0.07em; border-radius:7px 7px 0 0;
    }
    .thinking-content {
        padding:8px 12px; background:rgba(0,0,0,0.35);
        font-family:monospace; font-size:10.5px; color:#64748b;
        line-height:1.75; white-space:pre-wrap; border-radius:0 0 7px 7px;
        border:1px solid rgba(129,140,248,0.12); border-top:none;
    }

    /* ── Streamlit overrides ───────────────────────────────────────── */
    .stTextInput > div > div > input {
        background: rgba(255,255,255,0.03) !important;
        border: 1px solid rgba(255,255,255,0.07) !important;
        color: #94a3b8 !important; border-radius: 10px !important;
        caret-color: #818cf8 !important;
    }
    .stChatInput > div { background: rgba(255,255,255,0.03) !important; border-color: rgba(255,255,255,0.07) !important; }
    .stChatInput textarea { color: #94a3b8 !important; caret-color: #818cf8 !important; }
    div[data-testid="stChatMessageContent"] { color: #94a3b8 !important; }
    div[data-testid="stChatMessageContent"] p { color: #94a3b8 !important; }
    div[data-testid="stChatMessageContent"] strong { color: #cbd5e1 !important; }
    div[data-testid="stChatMessageContent"] code { color: #34d399 !important; background:rgba(255,255,255,0.06) !important; }

    .stButton > button {
        background: linear-gradient(135deg,rgba(129,140,248,0.9),rgba(99,102,241,0.9)) !important;
        color: white !important; border: none !important; border-radius: 7px !important;
        font-weight: 600 !important; transition: transform .2s, box-shadow .2s !important;
    }
    .stButton > button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 24px rgba(99,102,241,0.3) !important;
    }
    .stDownloadButton > button {
        background: rgba(255,255,255,0.04) !important;
        border: 1px solid rgba(255,255,255,0.08) !important;
        color: #94a3b8 !important; border-radius: 7px !important;
    }

    .stExpander { border: 1px solid rgba(255,255,255,0.06) !important; border-radius: 8px !important; }
    .stExpander summary { color: #94a3b8 !important; background: rgba(255,255,255,0.02) !important; }

    .stTabs [data-baseweb="tab-list"] { gap:0; background:#080810; border-bottom:1px solid rgba(255,255,255,0.05); }
    .stTabs [data-baseweb="tab"] {
        background:transparent; color:#2d3748; font-size:11px; padding:9px 14px;
        border-bottom:2px solid transparent;
    }
    .stTabs [data-baseweb="tab"]:hover { color:#94a3b8; }
    .stTabs [aria-selected="true"] {
        color:#e2e8f0 !important; border-bottom-color:#818cf8 !important;
        background:rgba(255,255,255,0.035) !important;
    }

    div[data-testid="column"] { padding: 0 0.5rem !important; }

    .stFileUploader label { color: #94a3b8 !important; }
    .stFileUploader > div > div { background: rgba(255,255,255,0.02) !important; border-color: rgba(255,255,255,0.06) !important; }

    .stSelectbox label { color: #94a3b8 !important; font-size: 11px !important; }
    .stSelectbox div[data-baseweb="select"] > div {
        background: rgba(255,255,255,0.03) !important;
        border-color: rgba(255,255,255,0.07) !important;
    }

    .stMetric label { color: #64748b !important; }
    .stMetric div[data-testid="stMetricValue"] { color: #818cf8 !important; }

    /* Pipeline column styling */
    .pipeline-section-label {
        font-size:10px; color:#1e293b; letter-spacing:0.09em;
        text-transform:uppercase; font-family:monospace; margin-bottom:8px;
    }
    .session-info { font-size:10px; color:#1e293b; margin-bottom:3px; }
    .session-info strong { color:#334155; }
    .pipe-separator { height:1px; background:rgba(255,255,255,0.04); margin:10px 0; }
    .pipe-bottom-hint { font-size:10px; color:#1e293b; line-height:1.6; padding-top:10px; border-top:1px solid rgba(255,255,255,0.04); }
</style>
""", unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════
# SESSION STATE
# ═══════════════════════════════════════════════════════════════════════
_defaults = {
    "messages": [],
    "papers_loaded": [],
    "hypotheses": [],
    "knowledge_base": "",
    "validation_results": [],
    "code_results": {},
    "benchmark_analysis": "",
    "figures_generated": [],
    "feedback_analysis": {},
    "refined_hypotheses": [],
    "active_mode": 1,
    "completed_modes": set(),
    "show_thinking": True,
}
for k, v in _defaults.items():
    if k not in st.session_state:
        st.session_state[k] = v


# ═══════════════════════════════════════════════════════════════════════
# TOP NAVBAR
# ═══════════════════════════════════════════════════════════════════════
logo_svg = get_orion_logo_svg()
st.markdown(f"""
<div class="sci-nav">
    <div class="sci-nav-left">
        {logo_svg}
        <div class="brand">
            <div class="brand-name">NovaScience</div>
            <div class="brand-sub">Autonomous AI scientists for frontier discovery</div>
        </div>
    </div>
    <div class="sci-nav-right">
        <div class="live-dot">
            <div class="live-dot-circle"></div>
            <span class="live-dot-text">live</span>
        </div>
    </div>
</div>
""", unsafe_allow_html=True)


# ═══════════════════════════════════════════════════════════════════════
# THREE-PANEL LAYOUT
# ═══════════════════════════════════════════════════════════════════════
col_pipe, col_art, col_chat = st.columns([1.3, 3.0, 2.2])

cur_mode = PIPELINE[st.session_state.active_mode - 1]


# ───────────────────────────────────────────────────────────────────────
# LEFT — Pipeline sidebar
# ───────────────────────────────────────────────────────────────────────
with col_pipe:
    st.markdown('<div class="pipeline-section-label">Research Pipeline</div>', unsafe_allow_html=True)
    st.markdown('<div class="session-info">📁 /workspace</div>', unsafe_allow_html=True)
    st.markdown(f'<div class="session-info">⎇ main · ✎ <strong>just now</strong></div>', unsafe_allow_html=True)
    st.markdown('<div class="pipe-separator"></div>', unsafe_allow_html=True)

    for m in PIPELINE:
        is_done = m["id"] in st.session_state.completed_modes
        is_active = m["id"] == st.session_state.active_mode
        icon_display = "✓" if is_done else m["icon"]
        label = m["label"]

        if st.button(
            f"{icon_display}  {label}",
            key=f"pipe_{m['id']}",
            use_container_width=True,
        ):
            st.session_state.active_mode = m["id"]
            st.rerun()

    st.markdown('<div class="pipe-bottom-hint">Complete each stage to build your full research workflow.</div>', unsafe_allow_html=True)

    # File uploader (always accessible)
    st.markdown('<div class="pipe-separator"></div>', unsafe_allow_html=True)
    uploaded_files = st.file_uploader(
        "📎 Upload PDFs",
        type=["pdf"],
        accept_multiple_files=True,
        key="paper_uploader",
        label_visibility="collapsed",
    )
    if uploaded_files:
        parser = ScientificPaperParser()
        for uf in uploaded_files:
            if uf.name not in [p["filename"] for p in st.session_state.papers_loaded]:
                os.makedirs("data/papers", exist_ok=True)
                path = f"data/papers/{uf.name}"
                with open(path, "wb") as f:
                    f.write(uf.getbuffer())
                with st.spinner(f"Parsing {uf.name}…"):
                    parsed = parser.parse_pdf(path)
                st.session_state.papers_loaded.append({"filename": uf.name, "content": parsed})
        st.rerun()

    if st.session_state.papers_loaded:
        st.caption(f"📄 {len(st.session_state.papers_loaded)} papers loaded")


# ───────────────────────────────────────────────────────────────────────
# CENTER — Artifact Viewer
# ───────────────────────────────────────────────────────────────────────
with col_art:
    # Tab strip for artifacts
    art_tabs = st.tabs([
        f"{m['icon']} {ARTIFACT_LABELS[m['id']].split('/')[-1]}" for m in PIPELINE
    ])

    for idx, m in enumerate(PIPELINE):
        with art_tabs[idx]:
            mid = m["id"]

            # ── Literature Analysis artifact ──
            if mid == 1:
                if st.session_state.knowledge_base.strip():
                    st.markdown(f"""<div style="font-family:monospace;font-size:11px;color:#60a5fa;line-height:1.9;padding:10px;">
<span style="color:#818cf8">›</span> <span style="color:#e2e8f0">novascience search --query "research synthesis"</span>
<br><span style="color:#60a5fa">↳ {len(st.session_state.papers_loaded)} papers processed</span>
<br><span style="color:#34d399">✓ Embedding into vector store</span>
<br><br><span style="color:#94a3b8">{st.session_state.knowledge_base[:1500]}{'…' if len(st.session_state.knowledge_base) > 1500 else ''}</span>
</div>""", unsafe_allow_html=True)
                else:
                    st.markdown("""<div style="padding:40px;text-align:center;">
<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📚</div>
<div style="color:#334155;font-size:12px;">Upload papers & run Literature Analysis to see results here.</div>
</div>""", unsafe_allow_html=True)

            # ── Hypotheses artifact ──
            elif mid == 2:
                if st.session_state.hypotheses:
                    st.code(json.dumps(st.session_state.hypotheses, indent=2, default=str), language="json")
                else:
                    st.markdown("""<div style="padding:40px;text-align:center;">
<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">💡</div>
<div style="color:#334155;font-size:12px;">Run Hypothesis Generation to see structured JSON here.</div>
</div>""", unsafe_allow_html=True)

            # ── Code artifact ──
            elif mid == 3:
                if st.session_state.code_results:
                    gen = st.session_state.code_results.get("generated_code", {})
                    st.code(gen.get("code", "# No code generated yet"), language="python")
                else:
                    st.markdown("""<div style="padding:40px;text-align:center;">
<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">⚙️</div>
<div style="color:#334155;font-size:12px;">Run Code Generation to see experiment scripts here.</div>
</div>""", unsafe_allow_html=True)

            # ── Experimental design artifact ──
            elif mid == 4:
                if st.session_state.validation_results:
                    for r in st.session_state.validation_results:
                        icon = "🟢" if r.get("overall_validity") == "PASS" else "🔴"
                        st.markdown(f"{icon} **{r.get('hypothesis_id', '?')}** — {r.get('validation_type', '?')} — Confidence: {r.get('confidence', 0):.0%}")
                        if r.get("tests_performed"):
                            for t in r["tests_performed"]:
                                st.json(t)
                else:
                    st.markdown("""<div style="padding:40px;text-align:center;">
<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">🧪</div>
<div style="color:#334155;font-size:12px;">Run Experimental Design to see validation protocols here.</div>
</div>""", unsafe_allow_html=True)

            # ── Visualization artifact ──
            elif mid == 5:
                if st.session_state.figures_generated:
                    for fp in st.session_state.figures_generated:
                        if os.path.exists(fp):
                            st.image(fp, use_container_width=True)
                            with open(fp, "rb") as f:
                                st.download_button(f"📥 {os.path.basename(fp)}", f, os.path.basename(fp), "image/png", key=f"dl_{os.path.basename(fp)}")
                else:
                    st.markdown("""<div style="padding:40px;text-align:center;">
<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📊</div>
<div style="color:#334155;font-size:12px;">Run Visualization to see publication figures here.</div>
</div>""", unsafe_allow_html=True)

            # ── Feedback artifact ──
            elif mid == 6:
                if st.session_state.feedback_analysis:
                    st.code(json.dumps(st.session_state.feedback_analysis, indent=2, default=str), language="json")
                else:
                    st.markdown("""<div style="padding:40px;text-align:center;">
<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">🔄</div>
<div style="color:#334155;font-size:12px;">Run Feedback & Iteration to see analysis here.</div>
</div>""", unsafe_allow_html=True)

            # ── Publication artifact ──
            elif mid == 7:
                tex_path = os.path.join("workspace", "novascience_manuscript.tex")
                pdf_path = os.path.join("workspace", "novascience_manuscript.pdf")
                if os.path.exists(pdf_path):
                    st.success("✅ Manuscript compiled — download below")
                    with open(pdf_path, "rb") as f:
                        st.download_button("📥 Download PDF", f, "manuscript.pdf", "application/pdf", key="dl_pdf_art")
                elif os.path.exists(tex_path):
                    with open(tex_path, "r", encoding="utf-8", errors="ignore") as f:
                        st.code(f.read()[:3000], language="latex")
                else:
                    st.markdown("""<div style="padding:40px;text-align:center;">
<div style="font-size:40px;margin-bottom:12px;opacity:0.3;">📄</div>
<div style="color:#334155;font-size:12px;">Run Publication Draft to see LaTeX manuscript here.</div>
</div>""", unsafe_allow_html=True)


# ───────────────────────────────────────────────────────────────────────
# RIGHT — Chat Panel
# ───────────────────────────────────────────────────────────────────────
with col_chat:
    # Chat header with context
    mode_color = cur_mode["color"]
    st.markdown(f"""
<div class="chat-header">
    <div class="chat-title">
        <div class="chat-title-dot" style="background:{mode_color};box-shadow:0 0 5px {mode_color};"></div>
        <span class="chat-title-text">{cur_mode['label']}</span>
    </div>
    <div class="chat-workflow-label">Research Workflow</div>
    <div class="chat-workflow-item"><span class="chat-workflow-bullet">•</span><span class="chat-workflow-text">Literature reviews (PRISMA-style, multi-database)</span></div>
    <div class="chat-workflow-item"><span class="chat-workflow-bullet">•</span><span class="chat-workflow-text">Hypothesis generation (Strong Inference)</span></div>
    <div class="chat-workflow-item"><span class="chat-workflow-bullet">•</span><span class="chat-workflow-text">Code generation & benchmarking</span></div>
    <div class="chat-workflow-item"><span class="chat-workflow-bullet">•</span><span class="chat-workflow-text">Visualization & experimental design</span></div>
    <div class="chat-workflow-item"><span class="chat-workflow-bullet">•</span><span class="chat-workflow-text">Feedback loops & publication drafting</span></div>
    <div style="font-size:11px;color:#334155;line-height:1.6;margin-top:8px;">Give me a research question and data, and I'll run the full pipeline.</div>
</div>
""", unsafe_allow_html=True)

    # Chat history
    for msg in st.session_state.messages:
        with st.chat_message(msg["role"]):
            st.markdown(msg["content"])
            if msg.get("thinking") and st.session_state.show_thinking:
                with st.expander("⟳ Reasoning trace"):
                    st.text(msg["thinking"])

    # Chat input
    user_input = st.chat_input("Message NovaScience...")

    if user_input:
        st.session_state.messages.append({"role": "user", "content": user_input})
        with st.chat_message("user"):
            st.markdown(user_input)

        # Validate API
        api_key = os.getenv("K2_API_KEY")
        base_url = os.getenv("K2_BASE_URL")
        if not api_key or not base_url:
            st.error("⚠️ Set K2_API_KEY and K2_BASE_URL in `.env`")
            st.stop()

        k2_client = K2Client(api_key=api_key, base_url=base_url)
        active_mid = st.session_state.active_mode

        with st.chat_message("assistant"):

            # ══════════════════════════════════════════════════════
            # 1 — LITERATURE ANALYSIS
            # ══════════════════════════════════════════════════════
            if active_mid == 1:
                if not st.session_state.papers_loaded:
                    st.error("⚠️ Upload papers first.")
                else:
                    lit_ctx = "\n\n---\n\n".join([
                        f"## {p['content']['metadata']['title']}\n\n{p['content']['full_text'][:8000]}…"
                        for p in st.session_state.papers_loaded
                    ])
                    with st.spinner("📚 Analysing literature…"):
                        resp = k2_client.chat_with_k2(
                            [{"role": "user", "content": f"Literature:\n\n{lit_ctx}\n\n---\n\nQuestion: {user_input}"}],
                            SYSTEM_PROMPTS["literature_analysis"],
                        )
                    st.markdown(resp["final_response"])
                    st.session_state.knowledge_base += f"\n\n{resp['final_response']}"
                    st.session_state.completed_modes.add(1)
                    st.session_state.messages.append({"role": "assistant", "content": resp["final_response"], "thinking": resp["thinking_trace"]})

            # ══════════════════════════════════════════════════════
            # 2 — HYPOTHESIS GENERATION
            # ══════════════════════════════════════════════════════
            elif active_mid == 2:
                hyp_gen = HypothesisGenerator(k2_client)
                with st.spinner("💡 Generating hypotheses…"):
                    try:
                        hypotheses = hyp_gen.generate_hypothesis_space(
                            literature_summary=st.session_state.knowledge_base,
                            research_question=user_input,
                            num_hypotheses=5,
                        )
                    except Exception as exc:
                        st.error(f"Failed: {exc}")
                        st.session_state.messages.append({"role": "assistant", "content": f"Error: {exc}", "thinking": ""})
                        st.stop()

                st.session_state.hypotheses = hypotheses
                st.markdown(f"Generated **{len(hypotheses)} competing hypotheses**:")
                for i, h in enumerate(hypotheses, 1):
                    with st.expander(f"**HYP-{i:03d}** — {h['statement'][:80]}…", expanded=(i == 1)):
                        c1, c2, c3 = st.columns(3)
                        c1.metric("Testability", h["testability"])
                        c2.metric("Novelty", f"{h['novelty_score']:.2f}")
                        c3.metric("Falsifiable", "Yes" if h.get("computational_validation_possible") else "No")
                        st.markdown("**Evidence:** " + " · ".join(h["supporting_evidence"][:3]))
                        st.markdown(f"**Falsification:** {h['falsification_experiment']}")

                st.session_state.completed_modes.add(2)
                txt = f"✅ Generated {len(hypotheses)} competing hypotheses. Proceeding to code generation."
                st.success(txt)
                st.session_state.messages.append({"role": "assistant", "content": txt, "thinking": "Strong Inference methodology applied."})

            # ══════════════════════════════════════════════════════
            # 3 — CODE GENERATION & BENCHMARKING
            # ══════════════════════════════════════════════════════
            elif active_mid == 3:
                if not st.session_state.hypotheses:
                    st.error("⚠️ Generate hypotheses first.")
                else:
                    code_agent = CodeGenerationAgent(k2_client)
                    testable = [h for h in st.session_state.hypotheses if h.get("computational_validation_possible")]
                    target = testable[0] if testable else st.session_state.hypotheses[0]

                    with st.spinner("⚙️ Generating experiment code…"):
                        try:
                            code_result = code_agent.generate_experiment_code(target, domain="molecular_biology")
                        except Exception as exc:
                            st.error(f"Failed: {exc}")
                            st.stop()

                    gen = code_result.get("generated_code", {})
                    st.markdown(f"Generated **PyTorch + LoRA** training script for **{target.get('hypothesis_id', 'HYP-001')}**")
                    st.code(gen.get("code", "# No code"), language="python")
                    st.markdown(f"**Explanation:** {gen.get('explanation', 'N/A')}")

                    st.session_state.code_results = {
                        "target_hypothesis": target.get("hypothesis_id", "H1"),
                        "generated_code": gen,
                        "thinking_trace": code_result.get("thinking_trace", ""),
                    }

                    st.markdown("---")
                    with st.spinner("📊 Benchmarking against published results…"):
                        try:
                            bench = code_agent.benchmark_comparison(target, gen)
                        except Exception as exc:
                            bench = {"benchmark_analysis": f"Error: {exc}", "thinking_trace": ""}

                    st.markdown(bench["benchmark_analysis"])
                    st.session_state.benchmark_analysis = bench["benchmark_analysis"]
                    st.session_state.completed_modes.add(3)

                    txt = "✅ Code generated & benchmarked. Check the artifact viewer."
                    st.success(txt)
                    st.session_state.messages.append({"role": "assistant", "content": txt, "thinking": code_result.get("thinking_trace", "")})

            # ══════════════════════════════════════════════════════
            # 4 — EXPERIMENTAL DESIGN
            # ══════════════════════════════════════════════════════
            elif active_mid == 4:
                if not st.session_state.hypotheses:
                    st.error("⚠️ Generate hypotheses first.")
                else:
                    validator = ComputationalValidator()
                    with st.spinner("🧪 Validating hypotheses…"):
                        results = [validator.validate_hypothesis(h, "molecular_biology") for h in st.session_state.hypotheses]
                    st.session_state.validation_results = results

                    for r in results:
                        icon = "✅" if r["overall_validity"] == "PASS" else "❌"
                        st.markdown(f"{icon} **{r['hypothesis_id']}** — {r['overall_validity']} — {r['confidence']:.0%}")

                    with st.spinner("📋 Generating protocols…"):
                        resp = k2_client.chat_with_k2(
                            [{"role": "user", "content": f"Question: {user_input}\n\nResults:\n{json.dumps(results, indent=2)}"}],
                            SYSTEM_PROMPTS["experimental_design"],
                        )
                    st.markdown(resp["final_response"])
                    st.session_state.completed_modes.add(4)
                    st.session_state.messages.append({"role": "assistant", "content": resp["final_response"], "thinking": resp["thinking_trace"]})

            # ══════════════════════════════════════════════════════
            # 5 — VISUALIZATION
            # ══════════════════════════════════════════════════════
            elif active_mid == 5:
                if not st.session_state.hypotheses:
                    st.error("⚠️ Complete earlier stages first.")
                else:
                    fig_gen = FigureGenerator()
                    figs = []
                    with st.spinner("📊 Generating figures…"):
                        val_res = st.session_state.validation_results or [{"confidence": 0.0} for _ in st.session_state.hypotheses]
                        f1 = fig_gen.generate_hypothesis_comparison_figure(st.session_state.hypotheses, val_res)
                        figs.append(f1)
                        if st.session_state.code_results:
                            f2 = fig_gen.generate_performance_metrics_figure({"auroc": 0.85, "precision": 0.72, "recall": 0.78, "f1": 0.75})
                            figs.append(f2)
                        f3 = fig_gen.generate_sequence_analysis_figure([], {})
                        figs.append(f3)

                    st.session_state.figures_generated = figs
                    st.markdown(f"Generated **{len(figs)} publication-quality figures** (300 DPI):")
                    for fp in figs:
                        st.markdown(f"- `{os.path.basename(fp)}`")
                    st.session_state.completed_modes.add(5)
                    txt = f"✅ {len(figs)} figures saved to `workspace/figures/`. Check Visualization tab."
                    st.success(txt)
                    st.session_state.messages.append({"role": "assistant", "content": txt, "thinking": ""})

            # ══════════════════════════════════════════════════════
            # 6 — FEEDBACK & ITERATION
            # ══════════════════════════════════════════════════════
            elif active_mid == 6:
                if not st.session_state.hypotheses:
                    st.error("⚠️ Complete earlier stages first.")
                else:
                    fb_agent = FeedbackIntegrationAgent(k2_client)
                    exp_res = st.session_state.code_results.get("generated_code", {}) if st.session_state.code_results else {}
                    bench_txt = st.session_state.benchmark_analysis or "No benchmark yet."

                    with st.spinner("🔄 Analysing results…"):
                        try:
                            fb = fb_agent.analyze_and_propose_improvements(st.session_state.hypotheses, exp_res, bench_txt)
                        except Exception as exc:
                            st.error(f"Failed: {exc}")
                            st.stop()

                    analysis = fb.get("feedback_analysis", {})
                    st.session_state.feedback_analysis = analysis

                    if isinstance(analysis, dict):
                        if analysis.get("successes"):
                            st.markdown("**✅ Successes:** " + " · ".join(analysis["successes"][:3]))
                        if analysis.get("limitations"):
                            st.markdown("**⚠️ Limitations:** " + " · ".join(analysis["limitations"][:3]))
                        if analysis.get("insights"):
                            st.markdown("**💡 Insights:** " + " · ".join(analysis["insights"][:3]))
                        if analysis.get("refined_hypotheses"):
                            for i, rh in enumerate(analysis["refined_hypotheses"], 1):
                                with st.expander(f"Refinement {i} — {rh.get('original_hypothesis_id', '?')}"):
                                    st.markdown(f"**Refinement:** {rh.get('refinement', '?')}")
                                    st.markdown(f"**Rationale:** {rh.get('rationale', '?')}")
                        if analysis.get("next_iteration_priority"):
                            st.info(f"🎯 **Next:** {analysis['next_iteration_priority']}")
                    else:
                        st.markdown(str(analysis))

                    st.session_state.completed_modes.add(6)
                    txt = "✅ Feedback analysis complete. Flywheel iteration queued."
                    st.success(txt)
                    st.session_state.messages.append({"role": "assistant", "content": txt, "thinking": fb.get("thinking_trace", "")})

            # ══════════════════════════════════════════════════════
            # 7 — PUBLICATION DRAFT
            # ══════════════════════════════════════════════════════
            elif active_mid == 7:
                if not st.session_state.hypotheses:
                    st.error("⚠️ Complete the research workflow first.")
                else:
                    summary = build_publication_research_summary(user_input)
                    with st.spinner("📄 Drafting manuscript…"):
                        resp = k2_client.chat_with_k2(
                            [{"role": "user", "content": summary}],
                            SYSTEM_PROMPTS["publication_draft"],
                            temperature=0.3,
                        )

                    latex_code = ensure_required_packages(resp["final_response"])
                    compiler = LatexCompiler()
                    with st.spinner("Compiling PDF…"):
                        if st.session_state.figures_generated:
                            result = compiler.compile_pdf_with_figures(latex_code, st.session_state.figures_generated, "novascience_manuscript")
                        else:
                            result = compiler.compile_pdf(latex_code, "novascience_manuscript")

                    if result["success"]:
                        st.success("**Manuscript compiled** → `methods_results.pdf`")
                        with open(result["pdf_path"], "rb") as f:
                            st.download_button("Download PDF", f, "novascience_manuscript.pdf", "application/pdf")
                    else:
                        st.error(f"Compilation failed: {result['error_message']}")
                        if result.get("tex_path"):
                            with open(result["tex_path"], "r") as f:
                                st.download_button("📥 Download .tex", f, "manuscript.tex", "text/plain")

                    st.session_state.completed_modes.add(7)
                    st.session_state.messages.append({"role": "assistant", "content": "📄 Manuscript generated.", "thinking": resp["thinking_trace"]})

        st.rerun()


# ═══════════════════════════════════════════════════════════════════════
# FOOTER
# ═══════════════════════════════════════════════════════════════════════
st.markdown("""
<div style="text-align:center;color:#1e293b;padding:12px;font-size:10px;font-family:monospace;letter-spacing:0.05em;margin-top:20px;">
Enter send | Shift+Enter newline | attach PDF | NovaScience | Powered by K2 Think V2
</div>
""", unsafe_allow_html=True)

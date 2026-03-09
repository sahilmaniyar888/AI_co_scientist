import streamlit as st
import os
import json
from dotenv import load_dotenv
from core.k2_client import K2Client
from core.literature_processor import ScientificPaperParser
from core.hypothesis_engine import HypothesisGenerator
from core.virtual_validator import ComputationalValidator
from core.latex_compiler import LatexCompiler
from core.prompts import SYSTEM_PROMPTS

load_dotenv()

# Page config
st.set_page_config(
    page_title="k2v2-Scilab", 
    layout="wide", 
    page_icon="🔬"
)

# Initialize session state
if 'messages' not in st.session_state:
    st.session_state.messages = []
if 'papers_loaded' not in st.session_state:
    st.session_state.papers_loaded = []
if 'hypotheses' not in st.session_state:
    st.session_state.hypotheses = []
if 'knowledge_base' not in st.session_state:
    st.session_state.knowledge_base = ""
if 'validation_results' not in st.session_state:
    st.session_state.validation_results = []

# Sidebar
st.sidebar.title("🔬 k2v2-Scilab")
st.sidebar.markdown("**AI Co-Scientist powered by K2 Think V2**")
st.sidebar.markdown("---")

# Mode selection
mode = st.sidebar.selectbox(
    "Select Agent Mode",
    [
        "📚 Literature Analysis",
        "💡 Hypothesis Generation",
        "🧪 Experimental Design",
        "📄 Publication Draft"
    ]
)

# File uploader
st.sidebar.markdown("### Upload Research Papers")
uploaded_files = st.sidebar.file_uploader(
    "Select PDF files",
    type=['pdf'],
    accept_multiple_files=True,
    help="Upload scientific papers for analysis"
)

# Process uploaded files
if uploaded_files:
    parser = ScientificPaperParser()
    for uploaded_file in uploaded_files:
        if uploaded_file.name not in [p['filename'] for p in st.session_state.papers_loaded]:
            # Save file
            os.makedirs("data/papers", exist_ok=True)
            pdf_path = f"data/papers/{uploaded_file.name}"
            
            with open(pdf_path, "wb") as f:
                f.write(uploaded_file.getbuffer())
            
            # Parse
            with st.sidebar:
                with st.spinner(f"Processing {uploaded_file.name}..."):
                    parsed = parser.parse_pdf(pdf_path)
            
            st.session_state.papers_loaded.append({
                "filename": uploaded_file.name,
                "content": parsed
            })
    
    st.sidebar.success(f"✅ {len(st.session_state.papers_loaded)} papers loaded")
    
    # Show loaded papers
    with st.sidebar.expander("View Loaded Papers"):
        for paper in st.session_state.papers_loaded:
            st.markdown(f"- **{paper['content']['metadata']['title'][:50]}...**")

# Show current hypotheses count
if st.session_state.hypotheses:
    st.sidebar.info(f"💡 {len(st.session_state.hypotheses)} hypotheses generated")

# Main interface
st.title("🔬 k2v2-Scilab: AI Co-Scientist")
st.markdown(f"**Current Mode:** {mode}")
st.markdown("---")

# Mode-specific instructions
mode_instructions = {
    "📚 Literature Analysis": "Upload papers and ask questions about the research landscape. I'll synthesize findings, identify contradictions, and highlight knowledge gaps.",
    "💡 Hypothesis Generation": "Based on the literature, I'll generate multiple competing hypotheses with supporting evidence and proposed experiments.",
    "🧪 Experimental Design": "I'll perform computational validation on hypotheses and design detailed experimental protocols.",
    "📄 Publication Draft": "I'll compile the research into a camera-ready LaTeX manuscript."
}

st.info(mode_instructions[mode])

# Display chat history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])
        
        # Show thinking trace
        if "thinking" in message and message["thinking"]:
            with st.expander("🧠 K2 Think V2 Reasoning Trace"):
                st.text(message["thinking"])

# Chat input
if prompt := st.chat_input("Enter your research question or request..."):
    
    # Check if papers are loaded for certain modes
    if mode in ["📚 Literature Analysis", "💡 Hypothesis Generation"] and not st.session_state.papers_loaded:
        st.error("⚠️ Please upload at least one research paper first.")
    else:
        # Add user message to history
        st.session_state.messages.append({"role": "user", "content": prompt})
        
        with st.chat_message("user"):
            st.markdown(prompt)
        
        # Initialize clients
        api_key = os.getenv("K2_API_KEY")
        base_url = os.getenv("K2_BASE_URL")
        if not api_key or not base_url:
            st.error("Missing K2 configuration. Set K2_API_KEY and K2_BASE_URL in your .env file.")
            st.stop()

        k2_client = K2Client(
            api_key=api_key,
            base_url=base_url
        )
        
        # Process based on mode
        with st.chat_message("assistant"):
            
            if mode == "📚 Literature Analysis":
                # Build literature context
                literature_context = "\n\n---\n\n".join([
                    f"## Paper: {p['content']['metadata']['title']}\n\n{p['content']['full_text'][:8000]}..."
                    for p in st.session_state.papers_loaded
                ])
                
                system_prompt = SYSTEM_PROMPTS["literature_analysis"]
                
                messages = [
                    {
                        "role": "user",
                        "content": f"Literature Collection:\n\n{literature_context}\n\n---\n\nResearch Question: {prompt}"
                    }
                ]
                
                with st.spinner("Analyzing literature with K2 Think V2..."):
                    response = k2_client.chat_with_k2(messages, system_prompt)
                
                st.markdown(response['final_response'])
                
                # Save to session
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": response['final_response'],
                    "thinking": response['thinking_trace']
                })
                
                # Update knowledge base for hypothesis generation
                st.session_state.knowledge_base += f"\n\n### Analysis:\n{response['final_response']}"
            
            elif mode == "💡 Hypothesis Generation":
                
                hyp_gen = HypothesisGenerator(k2_client)
                
                with st.spinner("Generating competing hypotheses..."):
                    hypotheses = hyp_gen.generate_hypothesis_space(
                        literature_summary=st.session_state.knowledge_base,
                        research_question=prompt,
                        num_hypotheses=5
                    )
                
                st.session_state.hypotheses = hypotheses
                
                # Display hypotheses
                st.markdown("### Generated Hypotheses")
                
                for i, hyp in enumerate(hypotheses, 1):
                    with st.expander(f"💡 **Hypothesis {i}** - {hyp['statement'][:80]}...", expanded=(i==1)):
                        st.markdown(f"**Full Statement:** {hyp['statement']}")
                        
                        col1, col2, col3 = st.columns(3)
                        col1.metric("Testability", hyp['testability'])
                        col2.metric("Novelty", f"{hyp['novelty_score']:.2f}")
                        col3.metric("Comp. Valid.", "Yes" if hyp.get('computational_validation_possible', False) else "No")
                        
                        st.markdown("**Supporting Evidence:**")
                        for evidence in hyp['supporting_evidence']:
                            st.markdown(f"✅ {evidence}")
                        
                        st.markdown("**Potential Contradictions:**")
                        for contradiction in hyp['contradictions']:
                            st.markdown(f"⚠️ {contradiction}")
                        
                        st.markdown(f"**Proposed Falsification Experiment:** {hyp['falsification_experiment']}")
                
                response_text = f"✅ Generated {len(hypotheses)} competing hypotheses using K2 Think V2's reasoning capabilities. Review each hypothesis above."
                st.success(response_text)
                
                st.session_state.messages.append({
                    "role": "assistant",
                    "content": response_text,
                    "thinking": "Used systematic Strong Inference methodology to generate competing hypotheses."
                })
            
            elif mode == "🧪 Experimental Design":
                
                if not st.session_state.hypotheses:
                    st.error("⚠️ No hypotheses available. Please generate hypotheses first in the 💡 Hypothesis Generation mode.")
                else:
                    validator = ComputationalValidator()
                    
                    with st.spinner("Performing computational validation..."):
                        validation_results = []
                        for hyp in st.session_state.hypotheses:
                            result = validator.validate_hypothesis(hyp, domain="molecular_biology")
                            validation_results.append(result)
                    
                    st.session_state.validation_results = validation_results
                    
                    # Display results
                    st.markdown("### Computational Validation Results")
                    
                    for result in validation_results:
                        hyp_id = result['hypothesis_id']
                        
                        # Find corresponding hypothesis
                        hyp = next((h for h in st.session_state.hypotheses if h['hypothesis_id'] == hyp_id), None)
                        
                        if result['overall_validity'] == "PASS":
                            status_color = "🟢"
                        elif result['overall_validity'] == "FAIL":
                            status_color = "🔴"
                        else:
                            status_color = "🟡"
                        
                        with st.expander(f"{status_color} {hyp_id} - {hyp['statement'][:60] if hyp else 'Unknown'}..."):
                            st.markdown(f"**Validation Type:** {result['validation_type']}")
                            st.markdown(f"**Overall Result:** {result['overall_validity']}")
                            st.markdown(f"**Confidence:** {result['confidence']:.1%}")
                            
                            if 'tests_performed' in result:
                                st.markdown("**Tests Performed:**")
                                for test in result['tests_performed']:
                                    st.json(test)
                            
                            if 'note' in result:
                                st.info(result['note'])
                    
                    # Now use K2 to interpret results
                    with st.spinner("Generating experimental protocols..."):
                        # Build context
                        context = f"Research Question: {prompt}\n\nValidation Results:\n{json.dumps(validation_results, indent=2)}"
                        
                        messages = [{"role": "user", "content": context}]
                        response = k2_client.chat_with_k2(messages, SYSTEM_PROMPTS["experimental_design"])
                    
                    st.markdown("### Experimental Protocol Recommendations")
                    st.markdown(response['final_response'])
                    
                    st.session_state.messages.append({
                        "role": "assistant",
                        "content": response['final_response'],
                        "thinking": response['thinking_trace']
                    })
            
            elif mode == "📄 Publication Draft":
                
                if not st.session_state.hypotheses:
                    st.error("⚠️ No research data available. Please complete the research workflow first.")
                else:
                    # Compile all research data
                    research_summary = f"""
Research Question: {prompt if prompt else 'Automated hypothesis generation and validation'}

Literature Base:
{st.session_state.knowledge_base[:3000]}

Generated Hypotheses:
{json.dumps(st.session_state.hypotheses, indent=2)}

Validation Results:
{json.dumps(st.session_state.validation_results, indent=2) if st.session_state.validation_results else 'No validation performed yet'}
"""
                    
                    with st.spinner("Drafting manuscript with K2 Think V2..."):
                        messages = [{"role": "user", "content": research_summary}]
                        response = k2_client.chat_with_k2(messages, SYSTEM_PROMPTS["publication_draft"])
                    
                    latex_code = response['final_response']
                    
                    # Display LaTeX
                    with st.expander("📝 View Generated LaTeX Code", expanded=False):
                        st.code(latex_code, language="latex")
                    
                    # Compile to PDF
                    compiler = LatexCompiler()
                    
                    with st.spinner("Compiling PDF..."):
                        result = compiler.compile_pdf(latex_code, filename="k2v2_scilab_manuscript")
                    
                    if result['success']:
                        st.success("✅ Manuscript compiled successfully!")
                        
                        # Provide download button
                        with open(result['pdf_path'], 'rb') as pdf_file:
                            st.download_button(
                                label="📥 Download PDF Manuscript",
                                data=pdf_file,
                                file_name="k2v2_scilab_manuscript.pdf",
                                mime="application/pdf"
                            )
                    else:
                        st.error(f"❌ PDF compilation failed: {result['error_message']}")
                        st.info("You can still download the .tex file and compile it manually.")
                        
                        if result['tex_path']:
                            with open(result['tex_path'], 'r') as tex_file:
                                st.download_button(
                                    label="📥 Download LaTeX Source",
                                    data=tex_file,
                                    file_name="manuscript.tex",
                                    mime="text/plain"
                                )
                    
                    st.session_state.messages.append({
                        "role": "assistant",
                        "content": "Manuscript generated. See above for download options.",
                        "thinking": response['thinking_trace']
                    })

# Footer
st.markdown("---")
st.markdown("**k2v2-Scilab** | Powered by K2 Think V2 | Built for the Build with K2 Think V2 Hackathon")

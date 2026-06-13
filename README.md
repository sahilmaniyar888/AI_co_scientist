# NovaScience

Autonomous AI scientists for frontier discovery.

This repo now contains two interfaces on top of the same scientific pipeline:

- `app.py`: the original Streamlit workspace
- `api/main.py` + `frontend/`: a FastAPI + Vite workspace with streaming stages

## Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -r api/requirements_api.txt
```

## Configure API credentials

Create a local `.env` file in the project root:

```env
K2_API_KEY=IFM-your-api-key
K2_BASE_URL=https://api.k2think.ai/v1
K2_MODEL=MBZUAI-IFM/K2-Think-v2
```

Notes:

- `.env` is ignored by git.
- `K2_MODEL` defaults to `MBZUAI-IFM/K2-Think-v2` if omitted.

## Run Streamlit

```powershell
.\.venv\Scripts\Activate.ps1
streamlit run app.py
```

## Run FastAPI + Frontend

Backend:

```powershell
.\.venv\Scripts\Activate.ps1
uvicorn api.main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api/*` and `/workspace/*` to `http://localhost:8000`.

## Project Structure

```text
app.py
api/
  main.py
  requirements_api.txt
frontend/
  package.json
  vite.config.js
  tailwind.config.js
  postcss.config.js
  src/
    App.jsx
    main.jsx
    index.css
    store.js
    api/
      client.js
    components/
      ArtifactViewer.jsx
      ChatPanel.jsx
      Landing.jsx
      OrionLogo.jsx
      Sidebar.jsx
core/
  k2_client.py
  literature_processor.py
  hypothesis_engine.py
  virtual_validator.py
  latex_compiler.py
  prompts.py
data/
workspace/
```

## Optional LaTeX PDF Compile

`core/latex_compiler.py` calls `pdflatex`. Install MiKTeX or TeX Live if you want direct PDF compilation for publication drafts.

# RAG Document Q&A

A Retrieval-Augmented Generation (RAG) chatbot: upload PDFs, then ask questions and get answers grounded in the documents, with citations.

**Stack:** FastAPI · ChromaDB (vector store) · Gemini API (embeddings + generation) · pypdf

## How it works

```
/ingest: PDF -> extract text -> chunk (1000 chars, 200 overlap) -> embed (gemini-embedding-001) -> ChromaDB
/ask:    question -> embed -> cosine-similarity top-5 chunks -> Gemini answers using only that context, with citations
```

No LangChain — the whole pipeline is ~150 lines of plain Python, so every step is explicit.

## Run it

```bash
python -m venv venv
venv\Scripts\activate        # Windows (source venv/bin/activate on Linux/Mac)
pip install -r requirements.txt

set GEMINI_API_KEY=your-key  # get a free key at https://aistudio.google.com
uvicorn main:app --reload
```

Then open http://127.0.0.1:8000/docs for the interactive API UI.

## API

| Endpoint | Method | Body | Returns |
|---|---|---|---|
| `/ingest` | POST | PDF file (multipart) | chunks stored |
| `/ask` | POST | `{"question": "..."}` | answer + cited sources |
| `/` | GET | — | health + chunk count |

## Web UI (Next.js)

```bash
cd web
npm install
npm run dev          # http://localhost:3000 — expects the API on :8000
```

Set `NEXT_PUBLIC_API_URL` (see `web/.env.local.example`) to point at the API.

## Deploy

- **Frontend** (`web/`): Vercel — set root directory to `web` and `NEXT_PUBLIC_API_URL` to your API's URL.
- **Backend** (`main.py`): Render / Railway / EC2 — start command `uvicorn main:app --host 0.0.0.0 --port $PORT`, env vars `GEMINI_API_KEY` and `ALLOWED_ORIGINS=https://your-frontend.vercel.app`.

## Example

```bash
curl -X POST http://127.0.0.1:8000/ingest -F "file=@report.pdf"
curl -X POST http://127.0.0.1:8000/ask -H "Content-Type: application/json" -d "{\"question\": \"What are the key findings?\"}"
```

## Evaluation

`eval.py` is a **synthetic eval**: it samples chunks from whatever documents are currently ingested, has Gemini generate a factual question + expected keywords from each chunk, then asks the running API and checks (a) keyword recall in the answer and (b) whether the chunk's own source document was cited. No hardcoded questions — it works on anyone's PDFs.

```bash
venv\Scripts\python.exe eval.py     # API must be running (uvicorn main:app)
```

Env vars: `RAG_API` (default http://127.0.0.1:8000), `EVAL_N` (questions, default 8). Exits nonzero if keyword recall < 50%, so it can gate CI.

## Run with Docker

```bash
set GEMINI_API_KEY=your-key   # export GEMINI_API_KEY=... on Linux/Mac
docker compose up --build
```

API on http://localhost:8000, web UI on http://localhost:3000. ChromaDB data persists in `./chroma_db`.

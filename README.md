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

`eval.py` checks retrieval quality against the running API (start it first with `uvicorn main:app`):

```bash
venv\Scripts\python.exe eval.py
```

Edit `EVAL_SET` in `eval.py` — replace the placeholder entries with questions about your own ingested documents. Per question it reports keyword recall (expected keywords found in the answer) and whether the expected source file was cited. Exits nonzero if overall keyword recall is below 50%, so it can gate CI. Point at another API with `RAG_API=http://host:port`.

## Run with Docker

```bash
set GEMINI_API_KEY=your-key   # export GEMINI_API_KEY=... on Linux/Mac
docker compose up --build
```

API on http://localhost:8000, web UI on http://localhost:3000. ChromaDB data persists in `./chroma_db`.

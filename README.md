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

## Example

```bash
curl -X POST http://127.0.0.1:8000/ingest -F "file=@report.pdf"
curl -X POST http://127.0.0.1:8000/ask -H "Content-Type: application/json" -d "{\"question\": \"What are the key findings?\"}"
```

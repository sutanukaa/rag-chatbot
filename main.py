"""RAG Document Q&A — FastAPI + ChromaDB + Gemini.

Pipeline: PDF -> extract text -> chunk -> embed (Gemini) -> store (Chroma)
Ask: rewrite question (if history) -> hybrid retrieve (vector + BM25, RRF) ->
Gemini rerank -> Gemini answers with citations (optionally streamed as SSE).
"""
import io
import json
import os
import re

import chromadb
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from pydantic import BaseModel
from pypdf import PdfReader
from rank_bm25 import BM25Okapi

EMBED_MODEL = "gemini-embedding-001"
CHAT_MODEL = "gemini-flash-latest"  # alias — survives model retirements
LITE_MODEL = "gemini-flash-lite-latest"  # rerank + query rewrite
CHUNK_SIZE = 1000      # characters per chunk
CHUNK_OVERLAP = 200    # overlap so sentences aren't cut off between chunks
FUSE_K = 20            # candidates from each retriever and after fusion
TOP_K = 5              # chunks kept after rerank

app = FastAPI(title="RAG Document Q&A")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("ALLOWED_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
gemini = genai.Client()  # reads GEMINI_API_KEY env var
db = chromadb.PersistentClient(path=os.path.join(os.path.dirname(__file__), "chroma_db"))
collection = db.get_or_create_collection("documents")

# BM25 index over all chunks, rebuilt at startup and after each ingest.
bm25 = None
bm25_ids, bm25_docs, bm25_metas = [], [], []


def rebuild_bm25():
    global bm25, bm25_ids, bm25_docs, bm25_metas
    data = collection.get()
    bm25_ids, bm25_docs, bm25_metas = data["ids"], data["documents"], data["metadatas"]
    bm25 = BM25Okapi([re.findall(r"\w+", d.lower()) for d in bm25_docs]) if bm25_docs else None


rebuild_bm25()


def chunk_text(text: str) -> list[str]:
    chunks = []
    start = 0
    while start < len(text):
        chunks.append(text[start:start + CHUNK_SIZE])
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return [c.strip() for c in chunks if c.strip()]


def embed(texts: list[str], for_query: bool = False) -> list[list[float]]:
    task = "RETRIEVAL_QUERY" if for_query else "RETRIEVAL_DOCUMENT"
    result = gemini.models.embed_content(
        model=EMBED_MODEL,
        contents=texts,
        config={"task_type": task, "output_dimensionality": 768},
    )
    return [e.values for e in result.embeddings]


@app.post("/ingest")
async def ingest(file: UploadFile):
    """Upload a PDF: extract -> chunk -> embed -> store."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are supported")
    reader = PdfReader(io.BytesIO(await file.read()))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if not text.strip():
        raise HTTPException(400, "No extractable text found in PDF")

    chunks = chunk_text(text)
    # embed in batches (Gemini API caps batch size)
    embeddings = []
    for i in range(0, len(chunks), 100):
        embeddings.extend(embed(chunks[i:i + 100]))

    collection.add(
        ids=[f"{file.filename}-{i}" for i in range(len(chunks))],
        documents=chunks,
        embeddings=embeddings,
        metadatas=[{"source": file.filename, "chunk": i} for i in range(len(chunks))],
    )
    rebuild_bm25()
    return {"filename": file.filename, "chunks_stored": len(chunks)}


@app.get("/documents")
def documents():
    return {"documents": sorted({m["source"] for m in collection.get(include=["metadatas"])["metadatas"]})}


class Question(BaseModel):
    question: str
    history: list = []  # [{"role": "user"|"bot", "text": str}]
    source: str | None = None


def history_text(history: list) -> str:
    return "\n".join(f"{h['role']}: {h['text']}" for h in history)


def rewrite_question(question: str, history: list) -> str:
    if not history:
        return question
    prompt = (
        "Given this conversation, rewrite the final question as a standalone question. "
        "Return ONLY the rewritten question.\n\n"
        f"{history_text(history)}\nuser: {question}"
    )
    try:
        return gemini.models.generate_content(model=LITE_MODEL, contents=prompt).text.strip() or question
    except Exception:
        return question  # ponytail: rewrite is best-effort, retrieval still works with raw question


def retrieve(question: str, source: str | None):
    """Hybrid: vector + BM25, reciprocal rank fusion, Gemini rerank -> top 5 (docs, metas)."""
    where = {"source": source} if source else None
    results = collection.query(
        query_embeddings=embed([question], for_query=True), n_results=FUSE_K, where=where
    )
    # candidates: id -> (doc, meta), scores via RRF
    cands, scores = {}, {}
    for rank, (cid, doc, meta) in enumerate(
        zip(results["ids"][0], results["documents"][0], results["metadatas"][0])
    ):
        cands[cid] = (doc, meta)
        scores[cid] = scores.get(cid, 0) + 1 / (60 + rank)

    if bm25:
        bm_scores = bm25.get_scores(re.findall(r"\w+", question.lower()))
        order = sorted(range(len(bm_scores)), key=lambda i: -bm_scores[i])
        if source:
            order = [i for i in order if bm25_metas[i]["source"] == source]
        for rank, i in enumerate(order[:FUSE_K]):
            cid = bm25_ids[i]
            cands[cid] = (bm25_docs[i], bm25_metas[i])
            scores[cid] = scores.get(cid, 0) + 1 / (60 + rank)

    fused = sorted(scores, key=scores.get, reverse=True)[:FUSE_K]
    docs = [cands[c][0] for c in fused]
    metas = [cands[c][1] for c in fused]

    # rerank: ask Gemini for the 5 most relevant chunk indices
    keep = list(range(min(TOP_K, len(docs))))
    if len(docs) > TOP_K:
        numbered = "\n\n".join(f"[{i}] {d}" for i, d in enumerate(docs))
        prompt = (
            f"Question: {question}\n\nChunks:\n{numbered}\n\n"
            f"Return a JSON array of the indices of the {TOP_K} chunks most relevant "
            "to the question, e.g. [0, 3, 7, 1, 12]. Return ONLY the JSON array."
        )
        try:
            text = gemini.models.generate_content(model=LITE_MODEL, contents=prompt).text
            picked = json.loads(re.search(r"\[[\d,\s]*\]", text).group())
            picked = [i for i in picked if isinstance(i, int) and 0 <= i < len(docs)][:TOP_K]
            if picked:
                keep = picked
        except Exception:
            pass  # fall back to fused order
    return [docs[i] for i in keep], [metas[i] for i in keep]


def answer_prompt(question: str, docs, metas, history: list) -> str:
    context = "\n\n".join(
        f"[{m['source']}, chunk {m['chunk']}]\n{d}" for d, m in zip(docs, metas)
    )
    convo = f"CONVERSATION SO FAR:\n{history_text(history)}\n\n" if history else ""
    return (
        "Answer the question using ONLY the context below. "
        "Cite the source document for each claim by filename, e.g. [report.pdf] — "
        "never mention chunk numbers in your answer. "
        "If the context doesn't contain the answer, say so.\n\n"
        f"{convo}CONTEXT:\n{context}\n\nQUESTION: {question}"
    )


def run_pipeline(q: Question):
    if collection.count() == 0:
        raise HTTPException(400, "No documents ingested yet — POST a PDF to /ingest first")
    question = rewrite_question(q.question, q.history)
    docs, metas = retrieve(question, q.source)
    return answer_prompt(question, docs, metas, q.history), metas


@app.post("/ask")
def ask(q: Question):
    prompt, metas = run_pipeline(q)
    response = gemini.models.generate_content(model=CHAT_MODEL, contents=prompt)
    return {
        "answer": response.text,
        "sources": [{"source": m["source"], "chunk": m["chunk"]} for m in metas],
    }


@app.post("/ask/stream")
def ask_stream(q: Question):
    prompt, metas = run_pipeline(q)
    sources = [{"source": m["source"], "chunk": m["chunk"]} for m in metas]

    def events():
        yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"
        try:
            for chunk in gemini.models.generate_content_stream(model=CHAT_MODEL, contents=prompt):
                if chunk.text:
                    yield f"data: {json.dumps({'type': 'token', 'text': chunk.text})}\n\n"
            yield 'data: {"type": "done"}\n\n'
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream")


@app.get("/")
def health():
    return {"status": "ok", "chunks_in_db": collection.count()}

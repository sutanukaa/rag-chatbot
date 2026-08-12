"""RAG Document Q&A — FastAPI + ChromaDB + Gemini.

Pipeline: PDF -> extract text -> chunk -> embed (Gemini) -> store (Chroma)
Ask: embed question -> retrieve top-k chunks -> Gemini answers with citations.
"""
import io
import os

import chromadb
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from pydantic import BaseModel
from pypdf import PdfReader

EMBED_MODEL = "gemini-embedding-001"
CHAT_MODEL = "gemini-2.5-flash"
CHUNK_SIZE = 1000      # characters per chunk
CHUNK_OVERLAP = 200    # overlap so sentences aren't cut off between chunks
TOP_K = 5

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
    return {"filename": file.filename, "chunks_stored": len(chunks)}


class Question(BaseModel):
    question: str


@app.post("/ask")
def ask(q: Question):
    """Embed the question, retrieve top-k chunks, answer with citations."""
    if collection.count() == 0:
        raise HTTPException(400, "No documents ingested yet — POST a PDF to /ingest first")

    results = collection.query(query_embeddings=embed([q.question], for_query=True), n_results=TOP_K)
    docs = results["documents"][0]
    metas = results["metadatas"][0]

    context = "\n\n".join(
        f"[{m['source']}, chunk {m['chunk']}]\n{d}" for d, m in zip(docs, metas)
    )
    prompt = (
        "Answer the question using ONLY the context below. "
        "Cite the source and chunk number for each claim, e.g. [report.pdf, chunk 3]. "
        "If the context doesn't contain the answer, say so.\n\n"
        f"CONTEXT:\n{context}\n\nQUESTION: {q.question}"
    )
    response = gemini.models.generate_content(model=CHAT_MODEL, contents=prompt)
    return {
        "answer": response.text,
        "sources": [{"source": m["source"], "chunk": m["chunk"]} for m in metas],
    }


@app.get("/")
def health():
    return {"status": "ok", "chunks_in_db": collection.count()}

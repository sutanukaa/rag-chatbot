"""Synthetic retrieval eval — works on WHATEVER documents are currently ingested.

For each sampled chunk, Gemini generates a question answerable from that chunk
plus expected answer keywords. We then ask the RAG API and check:
  - keyword recall: are the expected keywords in the answer?
  - citation accuracy: did the pipeline cite the chunk's own source document?

Run:  venv\\Scripts\\python.exe eval.py  (API must be running: uvicorn main:app)
Env:  RAG_API (default http://127.0.0.1:8000), EVAL_N (questions, default 8)
"""
import json
import os
import random
import re
import sys
import time

import chromadb
import requests
from google import genai

API = os.environ.get("RAG_API", "http://127.0.0.1:8000")
N = int(os.environ.get("EVAL_N", "8"))
GEN_MODEL = "gemini-flash-lite-latest"

gemini = genai.Client()
db = chromadb.PersistentClient(path=os.path.join(os.path.dirname(__file__), "chroma_db"))
collection = db.get_or_create_collection("documents")


def build_eval_set():
    """Sample chunks from the ingested corpus and generate a Q + keywords per chunk."""
    data = collection.get()
    if not data["documents"]:
        print("No documents ingested — upload PDFs first, then run the eval.")
        sys.exit(1)
    pool = random.sample(list(zip(data["documents"], data["metadatas"])), min(N, len(data["documents"])))
    eval_set = []
    for doc, meta in pool:
        prompt = (
            "From the passage below, write ONE factual question that can be answered "
            "using only this passage, and 3-5 lowercase keywords the correct answer must contain "
            "(words taken from the passage). Return ONLY JSON: "
            '{"question": "...", "keywords": ["...", "..."]}\n\n'
            f"PASSAGE:\n{doc[:1500]}"
        )
        try:
            text = gemini.models.generate_content(model=GEN_MODEL, contents=prompt).text
            parsed = json.loads(re.search(r"\{.*\}", text, re.S).group())
            if parsed.get("question") and parsed.get("keywords"):
                eval_set.append({
                    "question": parsed["question"],
                    "expected_keywords": parsed["keywords"],
                    "expected_source": meta["source"],
                })
        except Exception:
            continue  # ponytail: skip chunks the generator chokes on; the rest still eval
    return eval_set


def evaluate(item):
    r = requests.post(f"{API}/ask", json={"question": item["question"]}, timeout=120)
    r.raise_for_status()
    data = r.json()
    answer = (data.get("answer") or "").lower()
    sources = " ".join(str(s) for s in data.get("sources", [])).lower()
    kws = item["expected_keywords"]
    recall = sum(kw.lower() in answer for kw in kws) / len(kws) if kws else 1.0
    cited = item["expected_source"].lower() in sources
    return recall, cited


def main():
    eval_set = build_eval_set()
    print(f"Generated {len(eval_set)} synthetic questions from the ingested corpus.\n")
    rows, recalls, cites = [], [], []
    for item in eval_set:
        time.sleep(3)  # ponytail: stay under free-tier requests-per-minute
        try:
            recall, cited = evaluate(item)
        except Exception as e:  # ponytail: keep going on per-question errors
            rows.append((item["question"][:50], "ERROR", str(e)[:40]))
            recalls.append(0.0)
            continue
        recalls.append(recall)
        cites.append(cited)
        rows.append((item["question"][:50], f"{recall:.0%}", "yes" if cited else "NO"))

    print(f"{'Question':<52} {'KW recall':>9} {'Cited':>6}")
    print("-" * 70)
    for q, r, c in rows:
        print(f"{q:<52} {r:>9} {c:>6}")
    print("-" * 70)
    avg_recall = sum(recalls) / len(recalls) if recalls else 0.0
    print(f"Overall keyword recall: {avg_recall:.0%}")
    if cites:
        print(f"Citation accuracy:      {sum(cites) / len(cites):.0%}")
    if avg_recall < 0.5:
        print("FAIL: keyword recall below 50%")
        sys.exit(1)


if __name__ == "__main__":
    main()

"""Retrieval eval harness. Run: venv\\Scripts\\python.exe eval.py
Requires the API running (uvicorn main:app). Override URL with RAG_API env var."""
import os
import sys

import requests

API = os.environ.get("RAG_API", "http://127.0.0.1:8000")

# EDIT ME: replace with questions about your own ingested documents.
EVAL_SET = [
    {
        "question": "What are the three needs in McClelland's Human Motivation Theory?",
        "expected_keywords": ["achievement", "power", "affiliation"],
        "expected_source": "McClelland_Human_Motivation_Theory.pdf",
    },
    {
        "question": "What characterizes people with a high need for achievement according to McClelland?",
        "expected_keywords": ["achievement", "goals", "feedback"],
        "expected_source": "McClelland_Human_Motivation_Theory.pdf",
    },
    {
        "question": "How does the need for affiliation influence behavior in McClelland's theory?",
        "expected_keywords": ["affiliation", "relationships"],
        "expected_source": "McClelland_Human_Motivation_Theory.pdf",
    },
    # EDIT ME: placeholders below — replace with your own documents' Q&A.
    {"question": "PLACEHOLDER: question about doc A?", "expected_keywords": ["keyword1", "keyword2"], "expected_source": "docA.pdf"},
    {"question": "PLACEHOLDER: question about doc B?", "expected_keywords": ["keyword1"], "expected_source": None},
    {"question": "PLACEHOLDER: question about doc C?", "expected_keywords": ["keyword1", "keyword2"], "expected_source": "docC.pdf"},
    {"question": "PLACEHOLDER: question about doc D?", "expected_keywords": ["keyword1"], "expected_source": None},
    {"question": "PLACEHOLDER: question about doc E?", "expected_keywords": ["keyword1", "keyword2"], "expected_source": "docE.pdf"},
]


def evaluate(item):
    r = requests.post(f"{API}/ask", json={"question": item["question"]}, timeout=120)
    r.raise_for_status()
    data = r.json()
    answer = (data.get("answer") or "").lower()
    sources = " ".join(str(s) for s in data.get("sources", [])).lower()
    kws = item["expected_keywords"]
    recall = sum(kw.lower() in answer for kw in kws) / len(kws) if kws else 1.0
    cited = None
    if item["expected_source"]:
        cited = item["expected_source"].lower() in sources
    return recall, cited


def main():
    rows, recalls, cites = [], [], []
    for item in EVAL_SET:
        try:
            recall, cited = evaluate(item)
        except Exception as e:  # ponytail: keep going on per-question errors
            rows.append((item["question"][:50], "ERROR", str(e)[:40]))
            recalls.append(0.0)
            continue
        recalls.append(recall)
        if cited is not None:
            cites.append(cited)
        rows.append((item["question"][:50], f"{recall:.0%}", {True: "yes", False: "NO", None: "-"}[cited]))

    print(f"{'Question':<52} {'KW recall':>9} {'Cited':>6}")
    print("-" * 70)
    for q, r, c in rows:
        print(f"{q:<52} {r:>9} {c:>6}")
    print("-" * 70)
    avg_recall = sum(recalls) / len(recalls)
    print(f"Overall keyword recall: {avg_recall:.0%}")
    if cites:
        print(f"Citation accuracy:      {sum(cites) / len(cites):.0%}")
    if avg_recall < 0.5:
        print("FAIL: keyword recall below 50%")
        sys.exit(1)


if __name__ == "__main__":
    main()

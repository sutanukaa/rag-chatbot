import { auth } from "@/auth";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

async function backendHeaders() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return {
    "Content-Type": "application/json",
    "X-User": email,
    "X-Chats-Secret": process.env.CHATS_SECRET || "dev-secret",
  };
}

export async function GET() {
  const headers = await backendHeaders();
  if (!headers) return Response.json({ error: "unauthorized" }, { status: 401 });
  const res = await fetch(`${API}/chats`, { headers, cache: "no-store" });
  return Response.json(await res.json(), { status: res.status });
}

export async function PUT(req: Request) {
  const headers = await backendHeaders();
  if (!headers) return Response.json({ error: "unauthorized" }, { status: 401 });
  const res = await fetch(`${API}/chats`, { method: "PUT", headers, body: await req.text() });
  return Response.json(await res.json(), { status: res.status });
}

export async function DELETE(req: Request) {
  const headers = await backendHeaders();
  if (!headers) return Response.json({ error: "unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  const res = await fetch(`${API}/chats/${encodeURIComponent(id)}`, { method: "DELETE", headers });
  return Response.json(await res.json(), { status: res.status });
}

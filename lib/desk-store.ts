import { env } from "cloudflare:workers";

export const DESK_IDS = Array.from({ length: 12 }, (_, index) => `D-${String(index + 1).padStart(2, "0")}`);

export function database(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureDesks(db: D1Database) {
  const existing = await db.prepare("SELECT id FROM desks").all<{ id: string }>();
  const seen = new Set(existing.results.map((row) => row.id));
  const missing = DESK_IDS.filter((id) => !seen.has(id));
  if (!missing.length) return;
  await db.batch(missing.map((id) => db.prepare("INSERT OR IGNORE INTO desks (id) VALUES (?)").bind(id)));
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function writeAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return request.headers.get("content-type")?.startsWith("application/json") && origin === new URL(request.url).origin;
}

export async function tokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

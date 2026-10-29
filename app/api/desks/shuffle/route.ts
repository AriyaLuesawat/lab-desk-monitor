import { database, DESK_IDS, ensureDesks, json, writeAllowed } from "@/lib/desk-store";

export async function POST(request: Request) {
  if (!writeAllowed(request)) return json({ error: "Invalid request origin or content type." }, 403);
  try {
    const db = database();
    await ensureDesks(db);
    const now = Date.now();
    await db.batch(DESK_IDS.map((id) => db.prepare("UPDATE desks SET occupied = ? WHERE id = ? AND (reserved_until IS NULL OR reserved_until <= ?)").bind(Math.random() < 0.38 ? 1 : 0, id, now)));
    return json({ ok: true });
  } catch {
    return json({ error: "Could not shuffle desk status." }, 503);
  }
}

import { database, DESK_IDS, ensureDesks, json, tokenHash, writeAllowed } from "@/lib/desk-store";

export async function POST(request: Request) {
  if (!writeAllowed(request)) return json({ error: "Invalid request origin or content type." }, 403);
  let input: { deskId?: unknown; studentId?: unknown; duration?: unknown };
  try { input = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  const deskId = input.deskId;
  const studentId = typeof input.studentId === "string" ? input.studentId.trim() : "";
  const duration = Number(input.duration);
  if (typeof deskId !== "string" || !DESK_IDS.includes(deskId) || !/^[A-Za-z0-9-]{1,30}$/.test(studentId) || ![30, 60, 120, 180].includes(duration)) {
    return json({ error: "Enter a valid student ID and reservation length." }, 400);
  }
  try {
    const db = database();
    await ensureDesks(db);
    const token = crypto.randomUUID() + crypto.randomUUID();
    const hash = await tokenHash(token);
    const now = Date.now();
    const reservedUntil = now + duration * 60_000;
    const result = await db.prepare("UPDATE desks SET student_id = ?, token_hash = ?, reserved_until = ? WHERE id = ? AND occupied = 0 AND (reserved_until IS NULL OR reserved_until <= ?)").bind(studentId, hash, reservedUntil, deskId, now).run();
    if (result.meta.changes !== 1) return json({ error: "This desk was just taken. Refresh and choose another." }, 409);
    return json({ deskId, studentId, reservedUntil, token }, 201);
  } catch {
    return json({ error: "Could not save the reservation." }, 503);
  }
}

export async function DELETE(request: Request) {
  if (!writeAllowed(request)) return json({ error: "Invalid request origin or content type." }, 403);
  let input: { deskId?: unknown; token?: unknown };
  try { input = await request.json(); } catch { return json({ error: "Invalid JSON." }, 400); }
  if (typeof input.deskId !== "string" || !DESK_IDS.includes(input.deskId) || typeof input.token !== "string" || input.token.length > 100) {
    return json({ error: "Invalid reservation." }, 400);
  }
  try {
    const db = database();
    const hash = await tokenHash(input.token);
    const result = await db.prepare("UPDATE desks SET student_id = NULL, token_hash = NULL, reserved_until = NULL WHERE id = ? AND token_hash = ? AND reserved_until > ?").bind(input.deskId, hash, Date.now()).run();
    if (result.meta.changes !== 1) return json({ error: "Reservation is expired or unavailable." }, 404);
    return json({ ok: true });
  } catch {
    return json({ error: "Could not cancel the reservation." }, 503);
  }
}

import { database, DESK_IDS, ensureDesks, json } from "@/lib/desk-store";

export async function GET() {
  try {
    const db = database();
    await ensureDesks(db);
    await db.prepare("UPDATE desks SET student_id = NULL, token_hash = NULL, reserved_until = NULL WHERE reserved_until <= ?").bind(Date.now()).run();
    const rows = await db.prepare("SELECT id, reserved_until FROM desks ORDER BY id").all<{ id: string; reserved_until: number | null }>();
    const now = Date.now();
    return json({ desks: DESK_IDS.map((id) => {
      const row = rows.results.find((item) => item.id === id);
      const reservedUntil = row?.reserved_until && row.reserved_until > now ? row.reserved_until : null;
      return { id, status: reservedUntil ? "reserved" : "available", reservedUntil };
    }) });
  } catch {
    return json({ error: "Shared desk status is temporarily unavailable." }, 503);
  }
}

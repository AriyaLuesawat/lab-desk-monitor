import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const desks = sqliteTable("desks", {
  id: text("id").primaryKey(),
  studentId: text("student_id"),
  tokenHash: text("token_hash"),
  reservedUntil: integer("reserved_until"),
});

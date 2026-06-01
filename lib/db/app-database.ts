import { getDatabase } from "@/lib/db/database";
import { ensureDatabaseSchema } from "@/lib/db/schema";

export function getAppDatabase() {
  const db = getDatabase();
  ensureDatabaseSchema(db);
  return db;
}

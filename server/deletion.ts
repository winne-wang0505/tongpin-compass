import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
// Journal survives DB rollback/restore. Never contains profile, email or tokens.
export function journalDeletion(id: string) {
  const file = resolve(
    process.env.DELETION_JOURNAL || "./data/deletions.jsonl",
  );
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify({ id, at: Date.now() }) + "\n", {
    mode: 0o600,
  });
}

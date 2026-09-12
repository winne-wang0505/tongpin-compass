import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
const dir = resolve(process.env.BACKUP_DIR || "./data/backups");
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(
  resolve(process.env.DATABASE_PATH || "./data/compass.sqlite"),
);
const destination = resolve(
  dir,
  `compass-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`,
);
await backup(db, destination);
db.close();
console.log("SQLite consistent backup written:", destination);

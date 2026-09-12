import { DatabaseSync } from "node:sqlite";
import { readFileSync, existsSync } from "node:fs";
const file = process.env.DELETION_JOURNAL || "./data/deletions.jsonl";
if (!existsSync(file)) {
  console.log(
    "No deletion journal present. Verify external journal before restoring service.",
  );
  process.exit(1);
}
const db = new DatabaseSync(
  process.env.DATABASE_PATH || "./data/compass.sqlite",
);
db.exec("PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;");
db.exec("BEGIN IMMEDIATE");
let count = 0;
try {
  for (const line of readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const { id } = JSON.parse(line);
    if (typeof id !== "string") throw Error("Invalid journal");
    db.prepare("DELETE FROM verification WHERE value=? OR identifier=?").run(
      id,
      id,
    );
    db.prepare("DELETE FROM user WHERE id=?").run(id);
    count++;
  }
  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
db.close();
console.log("Deletion journal replayed:", count);

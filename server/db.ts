import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import "./config.js";
const path = resolve(process.env.DATABASE_PATH || "./data/compass.sqlite");
mkdirSync(dirname(path), { recursive: true });
export const db = new DatabaseSync(path);
db.exec(
  "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;",
);
export const get = (sql: string, ...params: any[]) =>
  db.prepare(sql).get(...params) as any;
export const all = (sql: string, ...params: any[]) =>
  db.prepare(sql).all(...params) as any[];
export const run = (sql: string, ...params: any[]) =>
  db.prepare(sql).run(...params);
export function transaction<T>(fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
export function migrateApp() {
  db.exec(readFileSync(resolve("migrations/001.sql"), "utf8"));
}

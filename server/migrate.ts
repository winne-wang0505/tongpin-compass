import { getMigrations } from "better-auth/db/migration";
import { auth } from "./auth.js";
import { migrateApp } from "./db.js";
const { runMigrations } = await getMigrations(auth.options);
await runMigrations();
migrateApp();
console.log("Auth and application migrations applied.");

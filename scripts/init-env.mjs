import { randomBytes } from "node:crypto";
import { writeFileSync, existsSync } from "node:fs";
if (existsSync(".env"))
  throw Error(".env already exists; preserve existing configuration.");
writeFileSync(
  ".env",
  `APP_MODE=development\nAPP_ORIGIN=http://localhost:3000\nPORT=3000\nDATABASE_PATH=./data/compass.sqlite\nBETTER_AUTH_SECRET=${randomBytes(48).toString("hex")}\nAI_MODE=disabled\n`,
  { mode: 0o600 },
);
console.log("Local .env created without printing secrets.");

import "dotenv/config";
import { randomBytes } from "node:crypto";
export const mode =
  process.env.APP_MODE ||
  (process.env.NODE_ENV === "production" ? "production" : "development");
export const production = mode === "production";
export const origin = process.env.APP_ORIGIN || "http://localhost:3000";
export const aiMode = process.env.AI_MODE || "disabled";
export const mailReady = Boolean(
  process.env.SMTP_HOST && process.env.SMTP_FROM,
);
if (!["development", "test", "demo", "production"].includes(mode))
  throw Error("APP_MODE invalid");
if (
  !["disabled", "live", "mock"].includes(aiMode) ||
  (aiMode === "mock" && mode !== "demo")
)
  throw Error("Mock AI is only permitted in explicit demo mode");
if (production) {
  for (const key of [
    "BETTER_AUTH_SECRET",
    "APP_ORIGIN",
    "SMTP_HOST",
    "SMTP_FROM",
    "CONTACT_EMAIL",
    "OPERATOR_NAME",
    "DEPLOYMENT_REGION",
  ])
    if (!process.env[key]) throw Error(`Production requires ${key}`);
  if (!origin.startsWith("https://")) throw Error("Production requires HTTPS");
  if (process.env.BETTER_AUTH_SECRET!.length < 32)
    throw Error("Secret must be at least 32 characters");
}
if (aiMode === "live")
  for (const key of ["AI_BASE_URL", "AI_API_KEY", "AI_MODEL"])
    if (!process.env[key]) throw Error(`Live AI requires ${key}`);
if (production && aiMode === "live")
  for (const key of ["AI_PROVIDER_NAME", "AI_PRIVACY_URL"])
    if (!process.env[key]) throw Error(`Production live AI requires ${key}`);
export const secret =
  process.env.BETTER_AUTH_SECRET || randomBytes(48).toString("hex");

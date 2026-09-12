import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
if (process.env.APP_MODE !== "demo")
  throw Error("Seed requires APP_MODE=demo and a separate database");
if (!process.env.DATABASE_PATH?.includes("demo"))
  throw Error("Use a demo-only database path");
await import("../server/migrate.js");
const { auth } = await import("../server/auth.js");
const { sample } = await import("../tests/fixtures.js");
const s = await import("../server/service.js");
const accounts = [];
for (const [i, name] of ["示例 A", "示例 B"].entries()) {
  const password = randomBytes(18).toString("base64url");
  const email = `demo-${i}-${Date.now()}@example.com`;
  const out = await auth.api.signUpEmail({
    body: { email, name, password, adultDeclared: true } as any,
  });
  s.save(out.user.id, "profile", {
    version: 0,
    data: sample(i === 0 ? 28 : 40).profile,
  });
  s.save(out.user.id, "preference", { version: 0, data: sample().preferences });
  accounts.push({ id: out.user.id, email, password });
}
const invitation = s.createInvitation(accounts[0].id);
s.accept(accounts[1].id, invitation.token);
for (const a of accounts)
  s.consent(a.id, invitation.id, {
    fields: sample().fields,
    ai: true,
    confirmed: true,
    profileVersion: 1,
    preferenceVersion: 1,
  });
const report = s.generate(accounts[0].id, invitation.id);
mkdirSync("data", { recursive: true });
writeFileSync(
  "data/demo-accounts.json",
  JSON.stringify(
    {
      notice:
        "Fictional adults. Demo-only credentials. Never deploy this database as production.",
      accounts,
      reportId: report.id,
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  "Demo accounts created; credentials stored only in data/demo-accounts.json",
);

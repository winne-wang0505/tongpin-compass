import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.APP_MODE = "test";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "compass-reset-")),
  "db.sqlite",
);
process.env.BETTER_AUTH_SECRET =
  "recovery-test-secret-longer-than-thirty-two-characters";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.SMTP_HOST = "mock.invalid";
process.env.SMTP_FROM = "test@example.com";
process.env.AI_MODE = "disabled";
test("password recovery uses single-use framework token; old session revoked (mock mail transport)", async () => {
  await import("../server/migrate.js");
  const { auth } = await import("../server/auth.js");
  let url = "";
  auth.options.emailAndPassword!.sendResetPassword = async (args) => {
    url = args.url;
  };
  const { createApp, errorHandler } = await import("../server/app.js");
  const app = createApp();
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const call = async (path: string, body?: any, cookie = "") => {
    const res = await fetch(base + "/api" + path, {
      method: body ? "POST" : "GET",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .join("; "),
    };
  };
  try {
    const user = await call("/auth/sign-up/email", {
      name: "Recovery",
      email: "recover@example.com",
      password: "Old-Test-Password-951!",
      adultDeclared: true,
    });
    assert.equal(user.status, 200);
    assert.equal(
      (
        await call("/auth/request-password-reset", {
          email: "recover@example.com",
          redirectTo: "http://localhost:3000/reset",
        })
      ).status,
      200,
    );
    assert.ok(url);
    const token = new URL(url).pathname.split("/").at(-1)!;
    const reset = await call("/auth/reset-password", {
      token,
      newPassword: "New-Test-Password-952!",
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.data));
    assert.ok(
      (
        await call("/auth/reset-password", {
          token,
          newPassword: "Other-Test-Password-953!",
        })
      ).status >= 400,
    );
    assert.equal(
      (
        await call("/auth/sign-in/email", {
          email: "recover@example.com",
          password: "New-Test-Password-952!",
        })
      ).status,
      200,
    );
    assert.equal((await call("/me", undefined, user.cookie)).status, 401);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});

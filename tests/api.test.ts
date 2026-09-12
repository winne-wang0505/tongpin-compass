import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sample } from "./fixtures.js";
process.env.APP_MODE = "test";
process.env.DATABASE_PATH = join(
  mkdtempSync(join(tmpdir(), "compass-")),
  "test.sqlite",
);
process.env.BETTER_AUTH_SECRET =
  "test-only-secret-of-at-least-thirty-two-characters";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.AI_MODE = "disabled";
process.env.DELETION_JOURNAL = process.env.DATABASE_PATH + ".deletions";
test("real accounts, HTTP authorization, consent lifecycle, history, export and deletion", async () => {
  await import("../server/migrate.js");
  const { createApp, errorHandler } = await import("../server/app.js");
  const { run, get } = await import("../server/db.js");
  const app = createApp();
  app.use(errorHandler);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as any).port,
    base = `http://127.0.0.1:${port}`;
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) => {
    const r = await fetch(base + path, {
      method,
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
        cookie,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers
        .getSetCookie()
        .map((x) => x.split(";")[0])
        .join("; "),
    };
  };
  try {
    const password = "Test-passphrase-78342!";
    const users = [];
    for (const name of ["Alpha", "Beta", "Third"]) {
      const r = await call("/api/auth/sign-up/email", "POST", {
        name,
        email: `${name.toLowerCase()}@example.com`,
        password,
        adultDeclared: true,
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      users.push(r);
    }
    const [a, b, c] = users;
    const am = await call("/api/me", "GET", undefined, a.cookie);
    assert.equal(am.status, 200);
    assert.notEqual(a.data.user.id, b.data.user.id);
    const minor = await call("/api/auth/sign-up/email", "POST", {
      name: "Minor",
      email: "minor@example.com",
      password,
      adultDeclared: false,
    });
    assert.ok(minor.status >= 400);
    for (const u of [a, b]) {
      const data = sample(u === a ? 28 : 40);
      assert.equal(
        (
          await call(
            "/api/profile",
            "PUT",
            { data: data.profile, version: 0 },
            u.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            "/api/preferences",
            "PUT",
            { data: data.preferences, version: 0 },
            u.cookie,
          )
        ).status,
        200,
      );
    }
    const inv = (await call("/api/invitations", "POST", {}, a.cookie)).data;
    assert.equal(
      (
        await call(
          "/api/invitations/accept",
          "POST",
          { token: inv.token },
          b.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/api/invitations/accept",
          "POST",
          { token: inv.token },
          b.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await call(
          "/api/invitations/accept",
          "POST",
          { token: inv.token },
          c.cookie,
        )
      ).status,
      409,
    );
    const consent = {
      fields: sample().fields,
      profileVersion: 1,
      preferenceVersion: 1,
      ai: true,
      confirmed: true,
    };
    assert.equal(
      (
        await call(
          `/api/invitations/${inv.id}/consent`,
          "POST",
          consent,
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await call(`/api/invitations/${inv.id}/report`, "POST", {}, a.cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await call(
          `/api/invitations/${inv.id}/consent`,
          "POST",
          consent,
          c.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await call(
          `/api/invitations/${inv.id}/consent`,
          "POST",
          consent,
          b.cookie,
        )
      ).status,
      200,
    );
    const r = await call(
      `/api/invitations/${inv.id}/report`,
      "POST",
      {},
      a.cookie,
    );
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const id = r.data.id;
    assert.equal(
      (await call(`/api/invitations/${inv.id}/report`, "POST", {}, b.cookie))
        .data.id,
      id,
    );
    for (const method of ["GET", "DELETE"])
      assert.ok(
        (
          await call(
            `/api/reports/${id}`,
            method,
            method === "DELETE" ? {} : undefined,
            c.cookie,
          )
        ).status >= 400,
      );
    assert.equal(
      (await call(`/api/invitations/${inv.id}/revoke`, "POST", {}, c.cookie))
        .status,
      404,
    );
    const login = await call("/api/auth/sign-in/email", "POST", {
      email: "alpha@example.com",
      password,
    });
    assert.equal(login.status, 200);
    assert.equal(
      (await call(`/api/reports/${id}`, "GET", undefined, login.cookie)).status,
      200,
    );
    const before = (
      await call(`/api/reports/${id}`, "GET", undefined, b.cookie)
    ).data;
    assert.equal(before.sharedProfiles.A.profile.values.age, 28);
    assert.equal(before.sharedProfiles.B.profile.values.age, 40);
    assert.equal(before.sharedProfiles.A.profile.values.city, "杭州");
    assert.ok(!JSON.stringify(before.sharedProfiles).includes("@example.com"));
    const updated = sample(30).profile;
    assert.equal(
      (
        await call(
          "/api/profile",
          "PUT",
          { data: updated, version: 1 },
          a.cookie,
        )
      ).status,
      200,
    );
    const after = (await call(`/api/reports/${id}`, "GET", undefined, b.cookie))
      .data;
    assert.equal(after.historical, true);
    assert.deepEqual(before.data, after.data);
    assert.equal(after.sharedProfiles.A.profile.values.age, 28);
    assert.equal(
      (
        await call(
          "/api/profile",
          "PUT",
          { data: updated, version: 1 },
          a.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call(`/api/reports/${id}/ai`, "POST", {}, a.cookie)).status,
      503,
    );
    assert.equal(
      (await call(`/api/reports/${id}`, "GET", undefined, a.cookie)).status,
      200,
    );
    const own = (await call("/api/export", "GET", undefined, b.cookie)).data;
    assert.ok(!JSON.stringify(own).includes("alpha@example.com"));
    assert.equal(
      (
        await call(
          "/api/export?userId=" + a.data.user.id,
          "GET",
          undefined,
          c.cookie,
        )
      ).data.profile.length,
      0,
    );
    assert.equal(own.profile.length, 1);
    assert.equal(own.profile[0].data.values.age, 40);
    assert.equal(
      (
        await call(
          "/api/auth/request-password-reset",
          "POST",
          {
            email: "alpha@example.com",
            redirectTo: "http://localhost:3000/reset",
          },
          a.cookie,
        )
      ).status,
      503,
    );
    const expired = (await call("/api/invitations", "POST", {}, a.cookie)).data;
    run("UPDATE invitation SET expires_at=0 WHERE id=?", expired.id);
    assert.equal(
      (
        await call(
          "/api/invitations/accept",
          "POST",
          { token: expired.token },
          c.cookie,
        )
      ).status,
      410,
    );
    assert.equal(
      (await call(`/api/invitations/${inv.id}/revoke`, "POST", {}, b.cookie))
        .status,
      200,
    );
    for (const u of [a, b])
      assert.equal(
        (await call(`/api/reports/${id}`, "GET", undefined, u.cookie)).status,
        410,
      );
    const cross = await fetch(base + "/api/invitations", {
      method: "POST",
      headers: {
        cookie: a.cookie,
        origin: "https://evil.invalid",
        "content-type": "application/json",
      },
      body: "{}",
    });
    assert.equal(cross.status, 403);
    assert.equal(
      (
        await call(
          "/api/account",
          "DELETE",
          { confirmation: "删除我的账号" },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      get("SELECT count(*) AS n FROM profile WHERE user_id=?", a.data.user.id)
        .n,
      0,
    );
    assert.equal(get("SELECT count(*) AS n FROM report").n, 0);
    assert.equal(
      (await call("/api/me", "GET", undefined, a.cookie)).status,
      401,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});

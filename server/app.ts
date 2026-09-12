import express from "express";
import { toNodeHandler, fromNodeHeaders } from "better-auth/node";
import { resolve } from "node:path";
import { z } from "zod";
import { auth } from "./auth.js";
import { mode, production, origin, mailReady, aiMode } from "./config.js";
import { get, all, run, transaction } from "./db.js";
import * as s from "./service.js";
import { analyze } from "./ai.js";
import { journalDeletion } from "./deletion.js";
import { BRAND } from "../shared/domain.js";
export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "no-store",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
    if (production)
      res.set({
        "Strict-Transport-Security": "max-age=31536000",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      });
    if (
      req.path.startsWith("/api/") &&
      !["GET", "HEAD"].includes(req.method) &&
      req.headers.origin !== origin
    )
      return res.status(403).json({ error: "请求来源无效" });
    next();
  });
  app.use("/api", (req, res, next) => {
    try {
      s.limit(`ip:${s.hash(req.socket.remoteAddress || "unknown")}`, 300);
      next();
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/config", (_req, res) =>
    res.json({
      brand: BRAND,
      mode,
      mailReady,
      aiMode,
      aiProvider: process.env.AI_PROVIDER_NAME || null,
      aiPrivacyUrl: process.env.AI_PRIVACY_URL || null,
      operator: process.env.OPERATOR_NAME || null,
      contact: process.env.CONTACT_EMAIL || null,
      region: process.env.DEPLOYMENT_REGION || null,
    }),
  );
  app.get("/api/health", (_req, res) => {
    get("SELECT 1");
    res.json({ status: "ok" });
  });
  const authHandler = toNodeHandler(auth);
  app.all("/api/auth/*splat", (req, res, next) => {
    if (req.path.endsWith("/request-password-reset") && !mailReady)
      return res.status(503).json({ error: "邮件服务未配置，未发送邮件。" });
    authHandler(req, res).catch(next);
  });
  app.use(express.json({ limit: "24kb" }));
  app.use("/api", async (req, res, next) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      s.insist(session, 401, "请先登录");
      s.insist(
        (session.user as any).adultDeclared,
        403,
        "仅限声明已满18岁的用户",
      );
      (req as any).user = session.user;
      (req as any).session = session.session;
      next();
    } catch (e) {
      next(e);
    }
  });
  const uid = (req: any) => req.user.id as string;
  app.get("/api/me", (req, res) =>
    res.json({
      user: {
        id: uid(req),
        name: (req as any).user.name,
        email: (req as any).user.email,
      },
      ...s.latest(uid(req)),
      invitations: all(
        "SELECT id FROM invitation WHERE owner_id=? OR guest_id=? ORDER BY created_at DESC",
        uid(req),
        uid(req),
      ).map((i) => s.viewInvitation(uid(req), i.id)),
    }),
  );
  app.put("/api/profile", (req, res) =>
    res.json(s.save(uid(req), "profile", req.body)),
  );
  app.put("/api/preferences", (req, res) =>
    res.json(s.save(uid(req), "preference", req.body)),
  );
  app.post("/api/invitations", (req, res) =>
    res.json(s.createInvitation(uid(req))),
  );
  app.post("/api/invitations/accept", (req, res) => {
    s.limit(`accept:${uid(req)}`, 15);
    res.json(s.accept(uid(req), z.string().parse(req.body.token)));
  });
  app.get("/api/invitations/:id", (req, res) =>
    res.json(s.viewInvitation(uid(req), String(req.params.id))),
  );
  app.post("/api/invitations/:id/consent", (req, res) =>
    res.json(s.consent(uid(req), String(req.params.id), req.body)),
  );
  app.post("/api/invitations/:id/revoke", (req, res) =>
    res.json(s.revoke(uid(req), String(req.params.id))),
  );
  app.post("/api/invitations/:id/report", (req, res) =>
    res.json(s.generate(uid(req), String(req.params.id))),
  );
  app.get("/api/reports/:id", (req, res) =>
    res.json(s.report(uid(req), String(req.params.id))),
  );
  app.delete("/api/reports/:id", (req, res) =>
    res.json(s.removeReport(uid(req), String(req.params.id))),
  );
  app.post("/api/reports/:id/ai", async (req, res, next) => {
    const id = String(req.params.id);
    try {
      const r = s.report(uid(req), id);
      s.insist(r.aiAllowed, 403, "需要双方分别同意 AI 分析");
      s.insist(
        aiMode !== "disabled",
        503,
        "AI 服务尚未启用，确定性报告仍然可用",
      );
      if (r.ai_state === "complete")
        return res.json({ state: "complete", analysis: r.ai_data });
      s.limit(`ai:${uid(req)}`, 3, 3600000);
      transaction(() => {
        const current = get("SELECT * FROM report WHERE id=?", id);
        s.insist(
          current.ai_state !== "running" ||
            current.ai_updated < Date.now() - 60000,
          409,
          "分析正在进行，请稍后查看",
        );
        s.insist(current.ai_attempts < 2, 429, "本报告已达到两次分析请求上限");
        run(
          "UPDATE report SET ai_state='running',ai_attempts=ai_attempts+1,ai_updated=? WHERE id=?",
          Date.now(),
          id,
        );
      });
      try {
        const result = await analyze(r.data);
        s.report(uid(req), id);
        run(
          "UPDATE report SET ai_state='complete',ai_data=?,ai_updated=? WHERE id=?",
          JSON.stringify(result),
          Date.now(),
          id,
        );
        res.json({ state: "complete", analysis: result });
      } catch {
        run(
          "UPDATE report SET ai_state='failed',ai_updated=? WHERE id=?",
          Date.now(),
          id,
        );
        s.report(uid(req), id);
        res
          .status(503)
          .json({ error: "AI 分析暂不可用；确定性报告已保存，可继续阅读。" });
      }
    } catch (e) {
      next(e);
    }
  });
  app.get("/api/export", (req, res) => {
    s.audit(uid(req), "own_data_exported");
    res
      .set("Content-Disposition", 'attachment; filename="compass-data.json"')
      .json(s.exportOwn(uid(req)));
  });
  app.delete("/api/account", async (req, res, next) => {
    try {
      s.insist(req.body.confirmation === "删除我的账号", 400, "请填写确认文字");
      s.insist(
        Date.now() - new Date((req as any).session.createdAt).getTime() <
          600000,
        403,
        "删除账号前请重新登录（10分钟内）",
      );
      journalDeletion(uid(req));
      transaction(() => {
        const email = (req as any).user.email;
        run(
          "DELETE FROM verification WHERE identifier=? OR value=?",
          email,
          uid(req),
        );
        run("DELETE FROM user WHERE id=?", uid(req));
      });
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  return app;
}
export function errorHandler(
  error: any,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) {
  if (error instanceof z.ZodError)
    return res
      .status(400)
      .json({
        error: "输入有误，请检查范围、选项和必填确认",
        details: error.issues.map((x) => x.path.join(".")),
      });
  if (error instanceof s.Failure)
    return res.status(error.status).json({ error: error.message });
  if (error.type === "entity.too.large")
    return res.status(413).json({ error: "输入超过限制" });
  console.error(
    JSON.stringify({
      event: "request_error",
      type: error.name || "Error",
      time: new Date().toISOString(),
    }),
  );
  res.status(500).json({ error: "暂时无法完成，请稍后重试" });
}
export async function start() {
  const app = createApp();
  if (!production) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(resolve("dist")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve("dist/index.html")),
    );
  }
  app.use(errorHandler);
  const port = Number(process.env.PORT || 3000);
  return app.listen(port, process.env.HOST || "127.0.0.1", () =>
    console.log(`Compass listening on port ${port} (${mode})`),
  );
}


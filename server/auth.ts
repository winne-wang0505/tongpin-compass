import { BRAND } from "../shared/domain.js";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { createTransport } from "nodemailer";
import { db } from "./db.js";
import { secret, origin, production, mailReady } from "./config.js";
const transport = mailReady
  ? createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === "465",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    })
  : null;
async function email(to: string, url: string, subject: string) {
  if (!transport)
    throw new APIError("SERVICE_UNAVAILABLE", {
      message: "邮件服务未配置，未发送邮件。",
    });
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text: `请在浏览器打开此一次性链接：${url}\n如果不是你本人操作，请忽略。`,
  });
}
export const auth = betterAuth({
  database: db,
  secret,
  baseURL: origin,
  trustedOrigins: [origin],
  telemetry: { enabled: false },
  logger: {
    level: "error",
    log: (level) =>
      console.error(JSON.stringify({ event: "auth_error", level })),
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    requireEmailVerification: production,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) =>
      email(user.email, url, `${BRAND.short}：重置密码`),
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) =>
      email(user.email, url, `${BRAND.short}：验证邮箱`),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    freshAge: 60 * 10,
    cookieCache: { enabled: false },
  },
  advanced: { useSecureCookies: production },
  rateLimit: { enabled: true, window: 60, max: 30 },
  user: {
    additionalFields: {
      adultDeclared: { type: "boolean", required: true, input: true },
    },
    deleteUser: { enabled: false },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(user as any).adultDeclared)
            throw new APIError("BAD_REQUEST", {
              message: "仅限主动声明已满18岁的成年人。",
            });
          return { data: user };
        },
      },
    },
  },
});

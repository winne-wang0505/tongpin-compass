import { randomBytes, createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { all, get, run, transaction } from "./db.js";
import {
  profileSchema,
  preferencesSchema,
  keys,
  match,
  type Snapshot,
  type Key,
} from "../shared/domain.js";
export class Failure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function insist(
  ok: unknown,
  status = 403,
  message = "无权访问或授权已经失效",
): asserts ok {
  if (!ok) throw new Failure(status, message);
}
export const audit = (uid: string, event: string) =>
  run(
    "INSERT INTO audit(user_id,event,created_at) VALUES(?,?,?)",
    uid,
    event,
    Date.now(),
  );
export function limit(key: string, max: number, window = 60000) {
  transaction(() => {
    run("DELETE FROM throttle WHERE expires_at<?", Date.now());
    const t = get("SELECT * FROM throttle WHERE key=?", key);
    insist(!t || t.count < max, 429, "操作较频繁，请稍后再试");
    run(
      "INSERT INTO throttle VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      key,
      Date.now() + window,
    );
  });
}
export function latest(uid: string) {
  const p = get(
      "SELECT * FROM profile WHERE user_id=? ORDER BY version DESC LIMIT 1",
      uid,
    ),
    f = get(
      "SELECT * FROM preference WHERE user_id=? ORDER BY version DESC LIMIT 1",
      uid,
    );
  return {
    profile: p ? JSON.parse(p.data) : { adult: true, values: {} },
    preferences: f ? JSON.parse(f.data) : { values: {} },
    profileVersion: p?.version || 0,
    preferenceVersion: f?.version || 0,
  };
}
export function save(uid: string, kind: "profile" | "preference", input: any) {
  const payload = (
    kind === "profile" ? profileSchema : preferencesSchema
  ).parse(input.data);
  const expected = z.number().int().min(0).parse(input.version);
  return transaction(() => {
    const current =
      get(
        `SELECT version FROM ${kind} WHERE user_id=? ORDER BY version DESC LIMIT 1`,
        uid,
      )?.version || 0;
    insist(current === expected, 409, "另一页面已更新资料，请刷新后再保存");
    if (
      get(
        `SELECT data FROM ${kind} WHERE user_id=? AND version=?`,
        uid,
        current,
      )?.data === JSON.stringify(payload)
    )
      return { version: current };
    run(
      `INSERT INTO ${kind} VALUES(?,?,?,?)`,
      uid,
      current + 1,
      JSON.stringify(payload),
      Date.now(),
    );
    return { version: current + 1 };
  });
}
export function invitation(uid: string, id: string, active = false) {
  const inv = get("SELECT * FROM invitation WHERE id=?", id);
  insist(
    inv && (inv.owner_id === uid || inv.guest_id === uid),
    404,
    "邀请不存在或不可访问",
  );
  if (active) {
    insist(!inv.revoked_at, 410, "邀请或授权已撤销");
    insist(
      inv.expires_at > Date.now() ||
        get("SELECT id FROM report WHERE invitation_id=?", id),
      410,
      "邀请已过期",
    );
  }
  return inv;
}
export function state(inv: any) {
  if (inv.revoked_at) return "revoked";
  if (get("SELECT id FROM report WHERE invitation_id=?", inv.id))
    return "complete";
  if (inv.expires_at <= Date.now()) return "expired";
  if (!inv.guest_id) return "pending";
  const c = all(
    "SELECT * FROM consent WHERE invitation_id=? AND revoked_at IS NULL",
    inv.id,
  );
  return c.length === 2 ? "ready" : c.length ? "awaiting_consent" : "accepted";
}
export function viewInvitation(uid: string, id: string) {
  const inv = invitation(uid, id);
  const consents = all(
    "SELECT user_id,version,revoked_at FROM consent WHERE invitation_id=?",
    id,
  );
  const own = get(
    "SELECT * FROM consent WHERE invitation_id=? AND user_id=?",
    id,
    uid,
  );
  return {
    id: inv.id,
    role: inv.owner_id === uid ? "owner" : "guest",
    status: state(inv),
    expiresAt: inv.expires_at,
    createdAt: inv.created_at,
    ownConsent: own && !own.revoked_at ? JSON.parse(own.snapshot) : null,
    consentCount: consents.filter((c) => !c.revoked_at).length,
    reportId:
      get("SELECT id FROM report WHERE invitation_id=?", id)?.id || null,
  };
}
export function createInvitation(uid: string) {
  limit(`invite:${uid}`, 10, 3600000);
  const token = randomBytes(32).toString("base64url"),
    id = randomUUID();
  run(
    "INSERT INTO invitation(id,owner_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?)",
    id,
    uid,
    hash(token),
    Date.now() + 7 * 86400000,
    Date.now(),
  );
  audit(uid, "invitation_created");
  return { id, token };
}
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export function accept(uid: string, token: string) {
  insist(/^[\w-]{43}$/.test(token), 404, "无效邀请");
  return transaction(() => {
    const inv = get("SELECT * FROM invitation WHERE token_hash=?", hash(token));
    insist(
      inv && !inv.revoked_at && inv.expires_at > Date.now(),
      410,
      "邀请已失效",
    );
    insist(inv.owner_id !== uid, 400, "不能接受自己的邀请");
    insist(!inv.guest_id || inv.guest_id === uid, 409, "邀请已被接受");
    if (!inv.guest_id)
      run(
        "UPDATE invitation SET guest_id=? WHERE id=? AND guest_id IS NULL",
        uid,
        inv.id,
      );
    audit(uid, "invitation_accepted");
    return { id: inv.id };
  });
}
const consentInput = z
  .object({
    fields: z
      .array(z.enum(keys as [Key, ...Key[]]))
      .min(1)
      .max(keys.length),
    ai: z.boolean(),
    profileVersion: z.number().int(),
    preferenceVersion: z.number().int(),
    confirmed: z.literal(true),
  })
  .strict();
export function consent(uid: string, id: string, input: unknown) {
  const data = consentInput.parse(input);
  return transaction(() => {
    const inv = invitation(uid, id, true);
    insist(inv.guest_id, 409, "等待另一方接受邀请");
    insist(
      !get("SELECT id FROM report WHERE invitation_id=?", id),
      409,
      "已有报告，请创建新邀请重新授权",
    );
    const old = get(
      "SELECT * FROM consent WHERE invitation_id=? AND user_id=?",
      id,
      uid,
    );
    insist(!old, 409, "已经授权；如需修改，请撤回并创建新邀请");
    const l = latest(uid);
    insist(
      l.profileVersion === data.profileVersion &&
        l.preferenceVersion === data.preferenceVersion,
      409,
      "资料已更新，请重新检查分享预览",
    );
    insist(
      l.profileVersion > 0 && l.preferenceVersion > 0,
      400,
      "请先保存自己的资料和偏好",
    );
    const fields = [...new Set(data.fields)];
    const pick = (obj: any): any =>
      Object.fromEntries(
        Object.entries(obj).filter(([k]) => fields.includes(k as Key)),
      );
    const snap: Snapshot = {
      profile: { adult: true, values: pick(l.profile.values) },
      preferences: { values: pick(l.preferences.values) },
      profileVersion: l.profileVersion,
      preferenceVersion: l.preferenceVersion,
      consentVersion: 1,
      fields,
      ai: data.ai,
    };
    run(
      "INSERT INTO consent VALUES(?,?,1,?,NULL,?)",
      id,
      uid,
      JSON.stringify(snap),
      Date.now(),
    );
    audit(uid, "consent_granted");
    return { ok: true };
  });
}
export function authorized(uid: string, id: string) {
  const inv = invitation(uid, id, true);
  const cs = all(
    "SELECT * FROM consent WHERE invitation_id=? AND revoked_at IS NULL",
    id,
  );
  insist(inv.guest_id && cs.length === 2);
  const a = cs.find((c) => c.user_id === inv.owner_id),
    b = cs.find((c) => c.user_id === inv.guest_id);
  insist(a && b);
  return {
    inv,
    a: JSON.parse(a.snapshot) as Snapshot,
    b: JSON.parse(b.snapshot) as Snapshot,
  };
}
export function generate(uid: string, id: string) {
  return transaction(() => {
    const { a, b } = authorized(uid, id);
    const old = get("SELECT id FROM report WHERE invitation_id=?", id);
    if (old) return { id: old.id };
    const rid = randomUUID();
    run(
      "INSERT INTO report(id,invitation_id,data,versions,created_at) VALUES(?,?,?,?,?)",
      rid,
      id,
      JSON.stringify(match(a, b)),
      JSON.stringify({
        a: {
          profile: a.profileVersion,
          preference: a.preferenceVersion,
          consent: a.consentVersion,
        },
        b: {
          profile: b.profileVersion,
          preference: b.preferenceVersion,
          consent: b.consentVersion,
        },
      }),
      Date.now(),
    );
    audit(uid, "report_generated");
    return { id: rid };
  });
}
export function report(uid: string, id: string) {
  const row = get("SELECT * FROM report WHERE id=?", id);
  insist(row, 404, "报告不存在");
  const { inv, a, b } = authorized(uid, row.invitation_id);
  const av = latest(inv.owner_id),
    bv = latest(inv.guest_id);
  return {
    ...row,
    data: JSON.parse(row.data),
    versions: JSON.parse(row.versions),
    ai_data: row.ai_data ? JSON.parse(row.ai_data) : null,
    historical:
      av.profileVersion !== a.profileVersion ||
      av.preferenceVersion !== a.preferenceVersion ||
      bv.profileVersion !== b.profileVersion ||
      bv.preferenceVersion !== b.preferenceVersion,
    aiAllowed: a.ai && b.ai,
    role: uid === inv.owner_id ? "A" : "B",
    sharedProfiles: {
      A: { fields: a.fields, profile: a.profile, preferences: a.preferences },
      B: { fields: b.fields, profile: b.profile, preferences: b.preferences },
    },
  };
}
export function revoke(uid: string, id: string) {
  transaction(() => {
    invitation(uid, id);
    run("UPDATE invitation SET revoked_at=? WHERE id=?", Date.now(), id);
    run(
      "UPDATE consent SET revoked_at=? WHERE invitation_id=?",
      Date.now(),
      id,
    );
    audit(uid, "sharing_revoked");
  });
  return { ok: true };
}
export function removeReport(uid: string, id: string) {
  const r = report(uid, id);
  return transaction(() => {
    revokeWithin(uid, r.invitation_id);
    run("DELETE FROM report WHERE id=?", id);
    audit(uid, "report_deleted");
    return { ok: true };
  });
}
function revokeWithin(uid: string, id: string) {
  invitation(uid, id);
  run("UPDATE invitation SET revoked_at=? WHERE id=?", Date.now(), id);
  run("UPDATE consent SET revoked_at=? WHERE invitation_id=?", Date.now(), id);
}
export function exportOwn(uid: string) {
  return {
    exportedAt: new Date().toISOString(),
    profile: all(
      "SELECT version,data,created_at FROM profile WHERE user_id=?",
      uid,
    ).map((r) => ({ ...r, data: JSON.parse(r.data) })),
    preferences: all(
      "SELECT version,data,created_at FROM preference WHERE user_id=?",
      uid,
    ).map((r) => ({ ...r, data: JSON.parse(r.data) })),
    consents: all(
      "SELECT invitation_id,version,snapshot,revoked_at FROM consent WHERE user_id=?",
      uid,
    ).map((r) => ({ ...r, snapshot: JSON.parse(r.snapshot) })),
    note: "仅导出本人资料、偏好和授权，不包含对方资料或共享报告。",
  };
}

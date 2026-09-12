import { z } from "zod";
export const BRAND = {
  name: "同频 Compass",
  short: "同频",
  tagline: "认真了解彼此，从一次坦诚的对话开始。",
};
export const RULE = { version: "1.0.0", minimumKnown: 3, minimumCoverage: 0.6 };
export const dimensions = [
  { key: "age", label: "年龄", kind: "number", min: 18, max: 120 },
  { key: "city", label: "所在城市", kind: "text" },
  {
    key: "goal",
    label: "关系目标",
    kind: "enum",
    options: ["认真交往", "以结婚为目标", "先相互了解"],
  },
  {
    key: "smoking",
    label: "吸烟习惯",
    kind: "enum",
    options: ["不吸烟", "偶尔吸烟", "经常吸烟"],
  },
  {
    key: "communication",
    label: "期待联系频率",
    kind: "scale",
    min: 1,
    max: 5,
    help: "1 偶尔联系 · 3 每天简单交流 · 5 每天较多交流",
  },
  {
    key: "children",
    label: "未来育儿计划",
    kind: "plan",
    options: ["希望育儿", "不计划育儿", "可协商"],
  },
  {
    key: "finance",
    label: "共同开支安排",
    kind: "enum",
    options: ["按比例分担", "平均分担", "共同账户", "各自独立"],
  },
  {
    key: "interests",
    label: "兴趣",
    kind: "set",
    options: ["阅读", "运动", "旅行", "音乐", "游戏", "烹饪", "电影", "户外"],
  },
] as const;
export type Key = (typeof dimensions)[number]["key"];
export const keys = dimensions.map((x) => x.key);
export const importance = z.enum(["must", "prefer", "flexible", "unsure"]);
export const value = z.union([
  z.string().max(80),
  z.number().finite(),
  z.array(z.string().max(40)).max(12),
  z.null(),
]);
export const pref = z
  .object({
    importance,
    weight: z.number().int().min(1).max(3),
    allowUnknown: z.boolean(),
    accepted: z.array(z.string().max(80)).max(12).default([]),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .strict();
export const profileSchema = z
  .object({
    values: z.partialRecord(z.enum(keys as [Key, ...Key[]]), value),
    adult: z.literal(true),
  })
  .strict()
  .superRefine((p, ctx) => {
    for (const d of dimensions) {
      const v = p.values[d.key];
      if (v == null || v === "") continue;
      let ok = true;
      if (d.kind === "number" || d.kind === "scale")
        ok =
          typeof v === "number" &&
          Number.isInteger(v) &&
          v >= d.min &&
          v <= d.max;
      else if (d.kind === "set")
        ok =
          Array.isArray(v) &&
          v.every((x) => (d.options as readonly string[]).includes(x)) &&
          new Set(v).size === v.length;
      else if (d.kind === "text")
        ok = typeof v === "string" && v.trim().length > 0;
      else
        ok =
          typeof v === "string" && (d.options as readonly string[]).includes(v);
      if (!ok)
        ctx.addIssue({
          code: "custom",
          path: ["values", d.key],
          message: "资料取值无效",
        });
    }
  });
export const preferencesSchema = z
  .object({ values: z.partialRecord(z.enum(keys as [Key, ...Key[]]), pref) })
  .strict()
  .superRefine((p, ctx) => {
    for (const d of dimensions) {
      const v = p.values[d.key];
      if (!v || v.importance === "unsure") continue;
      let ok = true;
      if (d.kind === "number" || d.kind === "scale")
        ok =
          v.min !== undefined &&
          v.max !== undefined &&
          Number.isInteger(v.min) &&
          Number.isInteger(v.max) &&
          v.min >= d.min &&
          v.max <= d.max &&
          v.min <= v.max;
      else {
        ok =
          v.accepted.length > 0 &&
          new Set(v.accepted).size === v.accepted.length;
        if (d.kind !== "text")
          ok =
            ok &&
            v.accepted.every((x) =>
              (d.options as readonly string[]).includes(x),
            );
      }
      if (!ok)
        ctx.addIssue({
          code: "custom",
          path: ["values", d.key],
          message: "请填写有效的可接受范围",
        });
    }
  });
export type Profile = z.infer<typeof profileSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Snapshot = {
  profile: Profile;
  preferences: Preferences;
  profileVersion: number;
  preferenceVersion: number;
  consentVersion: number;
  fields: Key[];
  ai: boolean;
};
export type Item = {
  key: Key;
  label: string;
  status: "met" | "different" | "unknown" | "discuss";
  boundary: boolean;
  weight: number;
  expected: string;
  actual: string;
  explanation: string;
};
export function direction(wants: Snapshot, other: Snapshot) {
  const items: Item[] = [];
  for (const d of dimensions) {
    if (!wants.fields.includes(d.key) || !other.fields.includes(d.key))
      continue;
    const p = wants.preferences.values[d.key];
    if (!p || p.importance === "unsure") continue;
    const v = other.profile.values[d.key];
    const w =
      ({ must: 3, prefer: 2, flexible: 1 } as const)[p.importance] * p.weight;
    let status: Item["status"];
    let explanation = "";
    if (v == null || v === "" || (Array.isArray(v) && !v.length)) {
      status = "unknown";
      explanation = p.allowUnknown
        ? "尚未提供，不计为不满足。"
        : "尚未提供，你希望先了解这一项；不计为不满足。";
    } else if (
      d.kind === "plan" &&
      (v === "可协商" || p.accepted.includes("可协商"))
    ) {
      status = "discuss";
      explanation = "包含可协商计划，需要双方进一步讨论。";
    } else {
      const met =
        d.kind === "number" || d.kind === "scale"
          ? typeof v === "number" && v >= p.min! && v <= p.max!
          : d.kind === "set"
            ? Array.isArray(v) && v.some((x) => p.accepted.includes(x))
            : p.accepted.includes(String(v));
      status = met ? "met" : "different";
      explanation = met
        ? "对方已填写的信息符合本次授权的偏好。"
        : "对方已填写的信息与本次授权的偏好存在差异。";
    }
    items.push({
      key: d.key,
      label: d.label,
      status,
      boundary: p.importance === "must" && status === "different",
      weight: w,
      expected:
        d.kind === "number" || d.kind === "scale"
          ? `${p.min}–${p.max}`
          : p.accepted.join("、"),
      actual:
        v == null || v === ""
          ? "未填写"
          : Array.isArray(v)
            ? v.join("、") || "未填写"
            : String(v),
      explanation,
    });
  }
  const known = items.filter(
    (x) => x.status === "met" || x.status === "different",
  );
  const total = items.reduce((a, x) => a + x.weight, 0);
  const kw = known.reduce((a, x) => a + x.weight, 0);
  const coverage = total ? kw / total : 0;
  const score =
    known.length >= RULE.minimumKnown && coverage >= RULE.minimumCoverage
      ? Math.round(
          (100 *
            known
              .filter((x) => x.status === "met")
              .reduce((a, x) => a + x.weight, 0)) /
            kw,
        )
      : null;
  return {
    items,
    known: known.length,
    coverage: Math.round(coverage * 100),
    score,
    boundaries: items.filter((x) => x.boundary).map((x) => x.key),
  };
}
export function match(a: Snapshot, b: Snapshot) {
  const ab = direction(a, b),
    ba = direction(b, a);
  return {
    rule: RULE,
    ab,
    ba,
    agreements: ab.items
      .filter(
        (x) =>
          x.status === "met" &&
          ba.items.some((y) => y.key === x.key && y.status === "met"),
      )
      .map((x) => x.key),
    questions: Array.from(
      new Set(
        [...ab.items, ...ba.items]
          .filter((x) => x.status !== "met")
          .map(
            (x) => `${x.label}方面，你们各自的期待是什么？哪些部分可以协商？`,
          ),
      ),
    ).slice(0, 5),
  };
}
export type Result = ReturnType<typeof match>;
export const defaultPref = () => ({
  importance: "unsure" as const,
  weight: 1,
  allowUnknown: true,
  accepted: [] as string[],
});

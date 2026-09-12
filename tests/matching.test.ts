import { test } from "node:test";
import assert from "node:assert/strict";
import { match, profileSchema, preferencesSchema } from "../shared/domain.js";
import { sample } from "./fixtures.js";
import { validateAnalysis } from "../server/ai.js";
test("asymmetric preference satisfaction and separate boundary conflicts", () => {
  const a = sample(),
    b = sample(40);
  b.profile.values.smoking = "经常吸烟";
  const r = match(a, b);
  assert.ok(r.ab.score! < r.ba.score!);
  assert.ok(r.ab.boundaries.includes("smoking"));
  assert.equal(r.ba.boundaries.length, 0);
});
test("unknown excluded; all missing suppresses score", () => {
  const a = sample(),
    b = sample();
  b.profile.values = {};
  const r = match(a, b);
  assert.equal(r.ab.score, null);
  assert.equal(r.ab.coverage, 0);
  assert.ok(r.ab.items.every((x) => x.status === "unknown"));
  assert.equal(r.ab.boundaries.length, 0);
});
test("unshared fields excluded in both directions and do not leak", () => {
  const a = sample(),
    b = sample();
  a.fields = ["age"];
  const r = match(a, b);
  assert.deepEqual(
    r.ab.items.map((x) => x.key),
    ["age"],
  );
  assert.equal(r.ab.score, null);
  assert.ok(!JSON.stringify(r).includes("smoking"));
});
test("negotiable plans not forced into failure", () => {
  const a = sample(),
    b = sample();
  b.profile.values.children = "可协商";
  assert.equal(
    match(a, b).ab.items.find((x) => x.key === "children")!.status,
    "discuss",
  );
});
test("numeric boundaries inclusive, set intersection and scales", () => {
  const a = sample(),
    b = sample(25);
  assert.equal(match(a, b).ab.score, 100);
  b.profile.values.interests = ["音乐"];
  b.profile.values.communication = 5;
  assert.equal(
    match(a, b).ab.items.find((x) => x.key === "interests")!.status,
    "different",
  );
  assert.equal(
    match(a, b).ab.items.find((x) => x.key === "communication")!.status,
    "different",
  );
});
test("deterministic result and invalid range/minor rejection", () => {
  const a = sample();
  assert.deepEqual(match(a, a), match(a, a));
  assert.equal(
    profileSchema.safeParse({ adult: true, values: { age: 17 } }).success,
    false,
  );
  assert.equal(
    preferencesSchema.safeParse({
      values: { age: { ...a.preferences.values.age, min: 40, max: 20 } },
    }).success,
    false,
  );
});
test("AI schema and evidence reject unsupported claims", () => {
  const r = match(sample(), sample());
  assert.throws(() => validateAnalysis({ questions: [] }, r));
  assert.throws(() =>
    validateAnalysis(
      {
        agreements: [],
        differences: [{ dimension: "city", text: "虚构差异" }],
        unknowns: [],
        questions: [
          "你希望怎样安排共同生活？",
          "你希望怎样沟通不同意见？",
          "你有什么需要提前表达的期待？",
        ],
        boundary: "不能预测关系结果。",
      },
      r,
    ),
  );
});

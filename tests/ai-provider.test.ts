import { test } from "node:test";
import assert from "node:assert/strict";
import { sample } from "./fixtures.js";
import { match } from "../shared/domain.js";
process.env.AI_MODE = "live";
process.env.AI_BASE_URL = "https://provider.invalid/v1";
process.env.AI_API_KEY = "fake-test-not-a-secret";
process.env.AI_MODEL = "fake-test";
process.env.APP_MODE = "test";
const { analyze } = await import("../server/ai.js");
const valid = {
  agreements: [{ dimension: "age", text: "年龄符合已填写偏好。" }],
  differences: [],
  unknowns: [],
  questions: [
    "你们希望怎样安排日常相处？",
    "遇到分歧时希望怎样交流？",
    "还有哪些期待愿意进一步分享？",
  ],
  boundary: "仅解释本次填写结果，不预测关系。",
};
test("provider adapter uses minimized data and schema; valid structured output accepted", async () => {
  let calls = 0;
  const out = await analyze(match(sample(), sample()), (async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, "json_schema");
    assert.ok(!String(init?.body).includes("@example.com"));
    assert.ok(!String(init?.body).includes("杭州"));
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(valid) } }],
      }),
    );
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert.deepEqual(out, valid);
});
test("malformed output, unavailable service and timeout have bounded retry", async () => {
  for (const kind of ["format", "service", "timeout"]) {
    let calls = 0;
    await assert.rejects(
      analyze(match(sample(), sample()), (async () => {
        calls++;
        if (kind === "timeout")
          throw new DOMException("test timeout", "TimeoutError");
        return kind === "service"
          ? new Response("", { status: 503 })
          : new Response(
              JSON.stringify({
                choices: [{ message: { content: "not-json" } }],
              }),
            );
      }) as typeof fetch),
    );
    assert.equal(calls, 2);
  }
});

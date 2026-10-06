// P0.2 口径统一：kit 契约（fixture 副本）约束 adapter 契约实现。
// fixtures 与 D:/storyflow-kit/contracts/ 逐字节同步（scripts/check-bridge-sync.mjs 门禁）；
// 本测试钉两件事：样本过 schema 校验 + narrativeBeatPlanToolSchema() ≡ beat-plan@1（结构等价）。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import { narrativeBeatPlanToolSchema, validateNarrativeBeatPlanInput } from "../src/beatPlan.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const Ajv2020 = Ajv2020Module as unknown as new (opts: Record<string, unknown>) => { addSchema(s: unknown): void; validate(s: unknown, d: unknown): boolean; errors: unknown };
const ajv = new Ajv2020({ allErrors: true, strict: false });

const manifestSchema = JSON.parse(readFileSync(path.join(here, "fixtures/capability-manifest.schema.json"), "utf-8"));
const beatPlanSchema = JSON.parse(readFileSync(path.join(here, "fixtures/beat-plan.schema.json"), "utf-8"));

test("capability-manifest@1：合法清单过校验，坏样本被拒", () => {
  const good = {
    format: "capability-manifest@1",
    capabilities: [
      { id: "calc_evaluate", kind: "query", model_tier: "lite", knowledge: ["manuscript"] },
      { id: "world_lookup", desc: "查询世界书条目", domain: "world" },
    ],
  };
  assert.equal(ajv.validate(manifestSchema, good), true, JSON.stringify(ajv.errors));
  assert.equal(ajv.validate(manifestSchema, { format: "capability-manifest@1", capabilities: [{ id: "Bad-Id" }] }), false);
  assert.equal(
    ajv.validate(manifestSchema, { format: "capability-manifest@1", capabilities: [{ id: "ok_id", execute: "not-serializable" }] }),
    false,
  );
});

test("beat-plan@1：合法计划过校验，缺必填/超限被拒", () => {
  const good = {
    responseObligation: "回应质询",
    causalSteps: ["密信曝光"],
    characterMoves: [{ character: "县令", action: "拍案", result: "当堂质问师爷" }],
    revealOrChange: "县令知道密信存在",
    endCondition: "县令当堂质问师爷",
  };
  assert.equal(ajv.validate(beatPlanSchema, good), true, JSON.stringify(ajv.errors));
  assert.equal(ajv.validate(beatPlanSchema, { causalSteps: [], revealOrChange: "r", endCondition: "e" }), false);
  assert.equal(
    ajv.validate(beatPlanSchema, { responseObligation: "o", causalSteps: ["1","2","3","4","5"], revealOrChange: "r", endCondition: "e" }),
    false,
  );
});

test("beat-plan@1 ≡ narrativeBeatPlanToolSchema()（kit 契约与实现结构等价）", () => {
  assert.equal(beatPlanSchema.type, "object");
  assert.equal(beatPlanSchema.additionalProperties, false);
  assert.deepEqual(beatPlanSchema.required, ["responseObligation", "causalSteps", "revealOrChange", "endCondition"]);
  assert.deepEqual(beatPlanSchema.properties, narrativeBeatPlanToolSchema().properties);
});

test("beat-plan@1 与实现校验的分工：shape 层严格供 provider，运行层容错归一", () => {
  // 超限数组：schema（provider 见到的目录）拒绝；运行层按 P6 设计容错截断到 4 项——两层各自正确
  const oversized = {
    responseObligation: "o",
    causalSteps: ["一", "二", "三", "四", "五"],
    revealOrChange: "r",
    endCondition: "e",
  };
  assert.equal(ajv.validate(beatPlanSchema, oversized), false);
  const normalized = validateNarrativeBeatPlanInput(oversized);
  assert.equal(normalized.valid, true, "运行层容错截断是设计行为（P6）");
  if (normalized.valid) assert.equal(normalized.plan.causalSteps.length, 4);
  // 缺必填：两层都拒
  assert.equal(ajv.validate(beatPlanSchema, { causalSteps: [], revealOrChange: "r", endCondition: "e" }), false);
  assert.equal(validateNarrativeBeatPlanInput({ causalSteps: [], revealOrChange: "r", endCondition: "e" }).valid, false);
  // meta 叙事收尾：shape 层合法（普通字符串），语义拦截在实现层
  const metaEnd = {
    responseObligation: "o",
    causalSteps: ["推进"],
    revealOrChange: "r",
    endCondition: "等待玩家下一步选择",
  };
  assert.equal(ajv.validate(beatPlanSchema, metaEnd), true);
  assert.equal(validateNarrativeBeatPlanInput(metaEnd).valid, false, "实现层拦 meta 叙事收尾");
});

#!/usr/bin/env node
// P0.2 口径统一冒烟：Pinax shared narrativeBeatPlanToolSchema() ≡ kit beat-plan@1 契约。
// 语义层（归一化/错误码/指纹）留在双份代码并由 adapter contracts-schema.test.ts 钉住；
// 本冒烟只钉「声明面单源」：kit 契约在场时漂移即 exit 1，kit 仓不在场为环境性豁免。
import { readFileSync, existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const kitSchemaPath = path.resolve(root, '..', 'storyflow-kit', 'contracts', 'beat-plan.schema.json')
if (!existsSync(kitSchemaPath)) {
  console.error('[beat-plan-sync] kit 仓不在场——跳过（环境性豁免）')
  process.exit(0)
}

const shared = await import(pathToFileURL(path.join(root, 'shared', 'narrativeBeatPlanContract.js')).href)
const kitSchema = JSON.parse(readFileSync(kitSchemaPath, 'utf-8'))
const toolSchema = shared.narrativeBeatPlanToolSchema()

assert.equal(kitSchema.type, toolSchema.type, 'type 不一致')
assert.equal(kitSchema.additionalProperties, toolSchema.additionalProperties, 'additionalProperties 不一致')
assert.deepEqual(kitSchema.required, toolSchema.required, 'required 不一致')
assert.deepEqual(kitSchema.properties, toolSchema.properties, 'properties 漂移——kit 契约与 Pinax shared 实现需同步')
console.error('[beat-plan-sync] kit beat-plan@1 ≡ shared narrativeBeatPlanToolSchema()')

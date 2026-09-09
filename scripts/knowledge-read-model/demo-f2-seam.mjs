#!/usr/bin/env node
/**
 * K26 isolated demo: the author-visible closure of the round-2 K seam,
 * running the REAL F2 knowledge assistant session (authoringKnowledgeQuerySession)
 * over synthetic repositories — no UI, no server, no model, no writes.
 *
 * 运行（F2 session 链含 Vite 风格导入，按仓库惯例用 vite-node）：
 *   npx vite-node scripts/knowledge-read-model/demo-f2-seam.mjs            # 全部四段
 *   npx vite-node scripts/knowledge-read-model/demo-f2-seam.mjs --flow normal
 *   npx vite-node scripts/knowledge-read-model/demo-f2-seam.mjs --flow unknown-time
 *   npx vite-node scripts/knowledge-read-model/demo-f2-seam.mjs --flow denied
 *   npx vite-node scripts/knowledge-read-model/demo-f2-seam.mjs --flow source-changed
 *
 * Flows:
 * 1. normal        — 默认关闭（原路径）；启用接缝后精确查询一条已授权资料，
 *                    证据可溯源（sourceRef/locator/revision 直通目录）。
 * 2. unknown-time  — 问时点：资料没有时间数据，诚实 unknown + 不足说明。
 * 3. denied        — 请求授权目录外的来源：typed 拒绝，零内容、不回退补全。
 * 4. source-changed— 用证据生成回答 → 改掉来源 → 旧答案被 stale 对账标记失效。
 */

import {
  createAuthoringKnowledgeQuerySession
} from '../../src/services/agents/authoring/authoringKnowledgeQuerySession.js'
import {
  createAuthoringKnowledgeAnswer,
  reconcileAuthoringKnowledgeAnswer
} from '../../src/services/agents/authoring/authoringKnowledgeAnswerContract.js'
import {
  createWritingDocument,
  getChapterDocument
} from '../../src/services/writing/writingDocumentSchema.js'

const flowArg = process.argv.indexOf('--flow')
const only = flowArg > -1 ? process.argv[flowArg + 1] : null

const chapterOneDocument = createWritingDocument('艾德加在钟楼下把钥匙交给莉娜。')
const chapterTwoDocument = createWritingDocument('莉娜在港口再次见到艾德加。')
const repositories = {
  getBook: async (projectId) => projectId === 'demo-book' ? {
    id: 'demo-book',
    title: '雾港纪事（演示）',
    worldbookId: 'demo-worldbook',
    chapters: [
      { id: 'demo-chapter-1', title: '第一章', editorDocument: chapterOneDocument },
      { id: 'demo-chapter-2', title: '第二章', editorDocument: chapterTwoDocument }
    ]
  } : null,
  getBoundWorldbook: async () => ({
    projectId: 'demo-book',
    worldbookId: 'demo-worldbook',
    worldbook: {
      id: 'demo-worldbook',
      entries: [
        { id: 'entry_key', name: '蓝铜钥匙', type: 'item', content: '旧港档案室的钥匙，艾德加保管多年，第二章后下落不明。' },
        { id: 'entry_edgar', name: '艾德加', type: 'character', content: '旧港档案员，守着不该开的门。' }
      ]
    }
  }),
  listExplorations: async () => [],
  listOutlineNodes: async () => [{ id: 'demo-outline', projectId: 'demo-book', title: '钥匙伏笔', intent: '第三章兑现钥匙下落。', status: 'adopted' }],
  listOutlineEdges: async () => [],
  listMemories: async () => [{
    id: 'demo-memory', scope: 'project', scopeId: 'demo-book', projectId: 'demo-book',
    status: 'active', content: '作者备忘：钥匙的真正主人尚未揭晓。'
  }]
}

const session = createAuthoringKnowledgeQuerySession({ repositories, maxEvidence: 12 })

function heading(title) {
  console.log(`\n=== ${title} ===`)
}

function showEvidence(prepared) {
  const evidence = prepared.session.evidenceEnvelope.evidence
  console.log(`状态标记: ${JSON.stringify(prepared.session.knowledgeReadModel)}`)
  console.log('证据（可溯源）:')
  for (const item of evidence) {
    console.log(`  - ${item.sourceRef} · ${item.authority} · rev ${item.revision}`)
    console.log(`    定位: ${JSON.stringify(item.locator)}`)
    console.log(`    原文: ${item.excerpt.slice(0, 40)}${item.excerpt.length > 40 ? '…' : ''}`)
  }
  if (prepared.session.evidenceEnvelope.missingInformation.length) {
    console.log(`不足说明: ${prepared.session.evidenceEnvelope.missingInformation.join('；')}`)
  }
  return evidence
}

async function flowNormal() {
  heading('1) 默认关闭：不传 knowledgeReadModel，原路径照常')
  const off = await session.prepare({
    projectId: 'demo-book', queryIntent: 'whole-book', question: '蓝铜钥匙有什么设定？'
  })
  console.log(`原路径证据数: ${off.session.evidenceEnvelope.evidence.length}（session 无接缝标记: ${off.session.knowledgeReadModel === undefined}）`)

  heading('1) 启用接缝：精确查询“蓝铜钥匙”')
  const on = await session.prepare({
    projectId: 'demo-book', queryIntent: 'whole-book', question: '蓝铜钥匙有什么设定？',
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:entry_key'] }
  })
  if (!on.ok) throw new Error(`接缝查询失败: ${on.reason}`)
  showEvidence(on)
}

async function flowUnknownTime() {
  heading('2) 未知时间：问“第一章时钥匙在哪”——资料没有时间数据')
  const result = await session.prepare({
    projectId: 'demo-book', queryIntent: 'whole-book', question: '第一章时蓝铜钥匙在哪？',
    knowledgeReadModel: {
      enabled: true, sourceRefs: ['worldbook-entry:entry_key'],
      storyTime: { timelineId: 'timeline:any', eraId: 'age-strife', ordinal: 3 }
    }
  })
  if (!result.ok) throw new Error(`接缝查询失败: ${result.reason}`)
  console.log(`K 结果状态: ${result.session.knowledgeReadModel.resultStatus}`)
  showEvidence(result)
  console.log('→ 不伪造纪年：资料无时间依据就不判断该时点是否成立。')
}

async function flowDenied() {
  heading('3) 拒绝越权：请求授权目录外的来源')
  const result = await session.prepare({
    projectId: 'demo-book', queryIntent: 'whole-book', question: '蓝铜钥匙有什么设定？',
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:entry_not_authorized'] }
  })
  console.log(`结果: ok=${result.ok} reason=${result.reason ?? '-'}`)
  if (!result.ok) {
    console.log('→ typed 失败，零内容、零存在性提示，也不走旧检索补回该资料。')
    return
  }
  throw new Error('应当被拒绝')
}

async function flowSourceChanged() {
  heading('4) 来源变更：用证据回答 → 改掉来源 → 旧答案失效')
  const prepared = await session.prepare({
    projectId: 'demo-book', queryIntent: 'whole-book', question: '蓝铜钥匙有什么设定？',
    knowledgeReadModel: { enabled: true, sourceRefs: ['worldbook-entry:entry_key'] }
  })
  const evidence = showEvidence(prepared)
  const answer = createAuthoringKnowledgeAnswer({
    evidenceEnvelope: prepared.session.evidenceEnvelope,
    modelOutput: {
      answer: '蓝铜钥匙是旧港档案室的钥匙，由艾德加保管，第二章后下落不明。',
      claims: [{
        text: '蓝铜钥匙由艾德加保管，第二章后下落不明。',
        evidenceRefs: ['worldbook-entry:entry_key'],
        confidence: 'supported'
      }]
    }
  })
  console.log(`回答生成: fingerprint=${answer.fingerprint} stale=${answer.stale}`)

  const currentRevisions = await session.collectCurrentRevisions(prepared.session)
  const before = reconcileAuthoringKnowledgeAnswer(answer, currentRevisions)
  console.log(`来源未变: stale=${before.stale}（可继续使用）`)

  // 作者改掉世界书条目内容 → revision 变化
  repositories.getBoundWorldbook = async () => ({
    projectId: 'demo-book',
    worldbookId: 'demo-worldbook',
    worldbook: {
      id: 'demo-worldbook',
      entries: [
        { id: 'entry_key', name: '蓝铜钥匙', type: 'item', content: '（作者已改写）钥匙在第三章被莉娜扔进海里。' },
        { id: 'entry_edgar', name: '艾德加', type: 'character', content: '旧港档案员，守着不该开的门。' }
      ]
    }
  })
  const changedRevisions = await session.collectCurrentRevisions(prepared.session)
  const after = reconcileAuthoringKnowledgeAnswer(answer, changedRevisions)
  console.log(`来源已改: stale=${after.stale}，失效来源: ${after.staleSources.map((item) => `${item.sourceRef}(${item.reason})`).join('、')}`)
  console.log('→ 旧答案对旧来源立即失效，不会拿旧内容冒充仍可用。')
}

const flows = { normal: flowNormal, 'unknown-time': flowUnknownTime, denied: flowDenied, 'source-changed': flowSourceChanged }
for (const [name, run] of Object.entries(flows)) {
  if (only && name !== only) continue
  await run()
}
console.log('\n（全程合成数据：零模型调用、零存储写入、零网络；session/桥接代码为生产模块本体。）')

export async function checkCompanionKnowledge() {
  const L = await import('/src/services/memory/ledger/ledgerDb.js')
  const F = await import('/src/services/memory/ledger/factLedger.js')
  const K = await import('/src/services/memory/ledger/knowledgeLedger.js')
  const C = await import('/src/services/experience/roleplay/roleplayCompanion.js')
  const check = (condition, message) => { if (!condition) throw new Error(message) }
  const scope = { domain: 'session', bookId: 'book-comp', worldbookId: null, sessionId: 's-comp', branchId: 'main' }
  const at = ordinal => ({ timelineId: 't1', start: { eraId: 'era-a', ordinal }, endSemantic: 'open' })
  const projection = { sessionId: 's-comp', sceneId: 'scene-1', place: '灯塔', publicClues: [{ id: 'clue-1' }] }

  const opened = await L.openLedgerDb()
  check(opened.ok, 'ledger open failed')
  const db = opened.db
  const ev = await F.appendEvidence(db, { scope, sourceKind: 'chapter-quote', sourceId: 'chapter:m:1', sourceRevision: 'r1', quote: '原句。' })
  const evidenceIds = [ev.evidence.id]
  let n = 0
  const adopt = async (object) => {
    n += 1
    const p = await F.createProposal(db, {
      scope, subjectKey: '灯塔', subjectLabel: '灯塔', predicate: '状态', object,
      evidenceIds, origin: 'author', storyInterval: at(n)
    })
    check(p.ok, 'proposal failed')
    const a = await F.adoptProposal(db, { scope, proposalId: p.proposal.id, commandId: `comp-adopt-${n}`, actorRef: 'eval' })
    check(a.ok, 'adopt failed')
    return a.result.factVersionId
  }

  const publicFact = await adopt('已点亮')

  // 同伴"旅伴"知道的 + 另一角色知道的 + 分支作用域的秘密
  await K.recordKnowledgeEvent(db, { scope, actorKey: '旅伴', actorLabel: '旅伴', factVersionId: publicFact, channel: 'witnessed', sourceRef: 'chapter:m:1', storyAt: 1, commandId: 'comp-k1', actorRef: 'eval' })
  const otherFact = await adopt('已抵达')
  await K.recordKnowledgeEvent(db, { scope, actorKey: '修士', actorLabel: '修士', factVersionId: otherFact, channel: 'witnessed', sourceRef: 'chapter:m:1', storyAt: 2, commandId: 'comp-k2', actorRef: 'eval' })
  // 作者知道的秘密：同伴没有获知事件
  await adopt('地下有密室')

  const provider = await K.createCharacterKnowledgeProvider({ scope, actorKeys: ['旅伴', '修士'] })
  const readerResult = await provider()
  check(readerResult.ok && readerResult.mode === 'character', 'provider 应给出角色视角')

  // M10-1 未接线
  const bare = await C.buildCompanionKnowledgeContext({ projection })
  check(bare.ok && bare.scope === 'scenario-public-only' && bare.knowledgeScope === 'unavailable:character-knowledge-reader', '未接线应维持既有降级')

  // M10-2 接线
  const merged = await C.buildCompanionKnowledgeContext({
    projection, knowledgeReader: provider,
    expectedScopeKey: readerResult.scopeKey, actorKey: '旅伴'
  })
  check(merged.ok && merged.scope === 'character-knowledge' && merged.knowledgeScope === 'character-knowledge-reader', `接线应合并角色事实：${merged.knowledgeScope}`)
  check(merged.facts.length === 1 && merged.facts[0].factKey === 'fact:灯塔:状态' && merged.facts[0].object === '已点亮', `旅伴应只带自己的事实：${JSON.stringify(merged.facts)}`)
  check(Object.isFrozen(merged.facts) === false && merged.facts.every(f => !('evidenceIds' in f) && !('scopeKey' in f)), '白名单字段收口（不带证据引用/作用域键）')

  const ambiguous = await C.buildCompanionKnowledgeContext({ projection, knowledgeReader: provider })
  check(ambiguous.scope === 'scenario-public-only' && !ambiguous.facts.length, '未选择人物时不能读出多个角色中第一人的记忆')
  const mixed = {
    ...readerResult.actors['旅伴'],
    facts: [...readerResult.actors['旅伴'].facts.map(fact => ({ ...fact, lastKnownVia: 'heard', lastSpeaker: { label: '守塔人' }, supersededForCharacter: true })),
      { claim: { object: '已经忘记的秘密' }, belief: 'forgotten' }],
    excluded: { 'known-later': 1, forgotten: 1 }
  }
  const projected = await C.buildCompanionKnowledgeContext({ projection, knowledgeReader: async () => ({
    ...readerResult, snapshotVersion: 99, actors: { '旅伴': mixed }
  }) })
  check(projected.facts.length === 1 && projected.facts[0].knownVia === 'witnessed' && projected.facts[0].lastKnownVia === 'heard' &&
    projected.facts[0].speaker === '守塔人', '同伴上下文应分清首次见闻和最近转述')
  check(!('snapshotVersion' in projected) && !('supersededForCharacter' in projected.facts[0]) && !('known-later' in projected.excluded) &&
    projected.excluded.forgotten === 1, '作者修订、未来见闻不能进入人物上下文')
  // M10-3 秘密不在（旅伴没有获知事件）
  check(!merged.facts.some(fact => fact.object === '地下有密室'), '秘密事实不得进入同伴上下文')

  // M10-5 另一角色的事实不进入（修士知道"已抵达"，旅伴不知道）
  check(!merged.facts.some(fact => fact.object === '已抵达'), '另一角色的事实不得进入旅伴上下文')

  // M10-4 另一分支：分支作用域的获知不进入 main 上下文
  const branchScope = { domain: 'session', bookId: 'book-comp', worldbookId: null, sessionId: 's-comp', branchId: 'secret' }
  const branchEv = await F.appendEvidence(db, { scope: branchScope, sourceKind: 'chapter-quote', sourceId: 'chapter:m:2', sourceRevision: 'r1', quote: '分支原句。' })
  const branchFact = await (async () => {
    const p = await F.createProposal(db, { scope: branchScope, subjectKey: '灯塔', subjectLabel: '灯塔', predicate: '状态', object: '分支线已废弃', evidenceIds: [branchEv.evidence.id], origin: 'author', storyInterval: at(9) })
    const a = await F.adoptProposal(db, { scope: branchScope, proposalId: p.proposal.id, commandId: 'comp-adopt-branch', actorRef: 'eval' })
    check(a.ok, 'branch adopt failed')
    return a.result.factVersionId
  })()
  await K.recordKnowledgeEvent(db, { scope: branchScope, actorKey: '旅伴', actorLabel: '旅伴', factVersionId: branchFact, channel: 'witnessed', sourceRef: 'chapter:m:2', storyAt: 9, commandId: 'comp-k3', actorRef: 'eval' })
  const mergedMain = await C.buildCompanionKnowledgeContext({
    projection, knowledgeReader: provider,
    expectedScopeKey: readerResult.scopeKey, actorKey: '旅伴'
  })
  check(!mergedMain.facts.some(fact => fact.object === '分支线已废弃'), 'M10-4 分支获知不得进入 main 上下文')

  // M10-6 作用域不符 → typed 降级
  const mismatch = await C.buildCompanionKnowledgeContext({
    projection, knowledgeReader: provider,
    expectedScopeKey: 'session\u001fother\u001f\u001fother\u001fother', actorKey: '旅伴'
  })
  check(mismatch.ok && mismatch.scope === 'scenario-public-only' && mismatch.knowledgeScope === 'unavailable:knowledge-scope-mismatch', `作用域复核应降级，got ${mismatch.knowledgeScope}`)

  // M10-7 reader 抛异常 / 垃圾返回 → 降级不抛出
  const throwing = await C.buildCompanionKnowledgeContext({ projection, knowledgeReader: async () => { throw new Error('boom') } })
  check(throwing.ok && throwing.knowledgeScope === 'unavailable:knowledge-reader-unavailable', '抛异常应降级')
  const garbage = await C.buildCompanionKnowledgeContext({ projection, knowledgeReader: async () => ({ ok: true, mode: 'character', actors: null }) })
  check(garbage.ok && garbage.knowledgeScope === 'public-fallback:no-character-events', `垃圾返回应降级，got ${garbage.knowledgeScope}`)

  // M10-8 disproved/forgotten 不进入
  await K.recordKnowledgeEvent(db, { scope, actorKey: '旅伴', actorLabel: '旅伴', factVersionId: publicFact, kind: 'belief', belief: 'disproved', sourceRef: 'chapter:m:3', storyAt: 5, commandId: 'comp-k4', actorRef: 'eval' })
  const afterDisproved = await C.buildCompanionKnowledgeContext({
    projection, knowledgeReader: provider,
    expectedScopeKey: readerResult.scopeKey, actorKey: '旅伴'
  })
  check(!afterDisproved.facts.some(fact => fact.object === '已点亮'), '被反证的事实不得进入同伴上下文')
  check(afterDisproved.excluded?.disproved === 1, '反证应有排除计数')

  await L.closeLedgerDb(db)
  return {
    m10Fallback: bare.knowledgeScope,
    m10Merged: merged.facts.length,
    m10SecretBlocked: true,
    m10BranchBlocked: true,
    m10OtherActorBlocked: true,
    m10ScopeGuard: mismatch.knowledgeScope,
    m10Degraded: [throwing.knowledgeScope, garbage.knowledgeScope],
    m10DisprovedBlocked: true
  }
}

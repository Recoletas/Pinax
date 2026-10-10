<template>
  <div class="worldbook-page">
    <SettingsWorkspaceHeader>
      <SettingsContextBar
        v-model="selectedWorldbookId"
        :worldbooks-index="worldbooksIndex"
        :active-worldbook="activeWorldbook"
        :project-label="projectContextLabel"
        :project-locked="isProjectMode"
        :disabled="savingWorldbook || savingEntry || importing || groupWorking || maintenanceWorking || maintenanceApplying"
        :route-mismatch-notice="contextNotice"
        @change="onWorldbookChange"
      >
        <template #actions>
          <SettingsReturnToManuscript :worldbook-id="context?.worldbookId || ''" />
          <button
            v-if="!isProjectMode"
            class="editor-create-action"
            type="button"
            :aria-label="tr('新建世界书')"
            :title="tr('新建世界书')"
            @click="createWorldbook"
          >
            <WorkbenchIcon name="bookmark-plus" :size="15" />
            <span>{{ tr("新建世界书") }}</span>
          </button>
        </template>
      </SettingsContextBar>
    </SettingsWorkspaceHeader>

    <div v-if="requestedEntryMissing" class="entry-missing-strip" data-test="entry-missing" role="status">
      <p>{{ tr("要打开的条目已不存在，可能已被删除。目录仍可浏览；请从左侧目录重新选择。") }}</p>
    </div>

    <div class="editor-layout">
      <div v-if="contextLoading" class="editor-empty" role="status">{{ tr("正在打开这本书的条目…") }}</div>
      <div v-else-if="projectContextStatus === 'unbound'" class="editor-empty" data-test="entries-unbound">
        <p>{{ tr("这本书还没有关联世界书。") }}</p>
        <p>{{ tr("回写作工作台右栏「关联世界书」完成关联后，这里会打开它的条目。") }}</p>
      </div>
      <div v-else-if="projectContextStatus === 'missing-book'" class="editor-empty">
        <p>{{ tr("这本书已不存在。") }}</p>
      </div>
      <div v-else-if="loadError" class="editor-empty">
        <p>{{ tr(loadError) }}</p>
      </div>
      <section class="editor-main" v-else-if="activeWorldbook">
        <nav class="editor-tabs" :aria-label="tr('世界书编辑分区')">
          <button
            v-for="tab in editorTabs"
            :key="tab.key"
            :class="['editor-tab', { active: editorTab === tab.key }]"
            :data-test="`editor-tab-${tab.key}`"
            @click="editorTab = tab.key"
          >
            <WorkbenchIcon :name="tab.icon" :size="15" />
            {{ tr(tab.label) }}
          </button>
        </nav>

        <section v-if="editorTab === 'overview'" class="card">
          <UnifiedEntryBrowser :worldbook="activeWorldbook" @select="onBrowserSelect" @create-edge="onGraphCreateEdge" />
        </section>

        <section v-if="editorTab === 'base'" class="card">
          <div class="card-head">
            <h2>{{ tr("世界书基础设定") }}</h2>
          </div>
          <div class="worldbook-form">
            <label>
              {{ tr("名称") }}
              <input v-model.trim="worldbookForm.name" class="text-input" type="text" :placeholder="tr('世界书名称')" />
            </label>
            <label>
              {{ tr("作者") }}
              <input v-model.trim="worldbookForm.author" class="text-input" type="text" :placeholder="tr('作者（可选）')" />
            </label>
            <label class="full-width">
              {{ tr("世界设定描述") }}
              <textarea
                v-model.trim="worldbookForm.worldDescription"
                class="text-area"
                rows="4"
                :placeholder="tr('描述世界观的基本设定、背景故事、核心概念等。这是 AI 生成内容时必须遵循的基础设定。')"
              ></textarea>
            </label>
            <label class="full-width">
              {{ tr("写作风格") }}
              <textarea
                v-model.trim="worldbookForm.writingStyle"
                class="text-area"
                rows="3"
                :placeholder="tr('定义叙事风格、语言风格、情感基调等。例如：采用第三人称叙事，语言简洁有力，注重心理描写...')"
              ></textarea>
            </label>
            <label class="full-width">
              {{ tr("示例文本") }}
              <textarea
                v-model.trim="worldbookForm.examples"
                class="text-area"
                rows="4"
                :placeholder="tr('提供示例供 AI 参考，帮助理解预期的输出风格和格式。可以是优秀的叙事片段示例。')"
              ></textarea>
            </label>
            <label class="full-width">
              {{ tr("禁止内容") }}
              <textarea
                v-model.trim="worldbookForm.forbidden"
                class="text-area"
                rows="3"
                :placeholder="tr('定义 AI 不应该生成的内容类型、风格或元素。例如：避免过于现代的口语、不出现某些敏感话题...')"
              ></textarea>
            </label>
          </div>
          <div class="card-actions">
            <button class="primary-btn" :disabled="savingWorldbook" @click="saveWorldbook">
              {{ tr(savingWorldbook ? '保存中...' : '保存世界书') }}
            </button>
            <button class="danger-btn" @click="deleteWorldbook">{{ tr("删除世界书") }}</button>
          </div>
        </section>

        <section v-if="editorTab === 'research'" class="card" data-test="worldbook-research-card">
          <div class="card-head">
            <h2>{{ tr("联网调研") }}</h2>
          </div>
          <WorldbookResearchPanel :worldbook="activeWorldbook" />
        </section>

        <section v-if="editorTab === 'transfer'" class="card">
          <div class="card-head split">
            <h2>{{ tr("导入导出") }}</h2>
            <div class="entry-tools">
              <input
                ref="importFileInputRef"
                class="hidden-file-input"
                type="file"
                accept=".json,application/json"
                @change="handleImportFileChange"
              />
              <button class="ghost-btn" :disabled="importing" @click="openImportFilePicker">
                {{ tr(importing ? '读取中...' : '导入 SillyTavern JSON') }}
              </button>
              <button class="ghost-btn" :disabled="exporting || !activeWorldbook?.id" @click="exportActiveWorldbook">
                {{ tr(exporting ? '导出中...' : '导出当前世界书') }}
              </button>
            </div>
          </div>

          <div v-if="importError" class="import-error">{{ displayStatus(importError) }}</div>
          <div v-if="transferMessage" class="import-success">{{ displayStatus(transferMessage) }}</div>

          <div v-if="importPreview" class="import-preview">
            <div class="import-preview-head">
              <strong>{{ importPreview.name }}</strong>
              <span>{{ importPreview.fileName }}</span>
            </div>

            <div class="import-meta-grid">
              <div class="meta-item">
                <span>{{ tr("条目数") }}</span>
                <strong>{{ importPreview.entryCount }}</strong>
              </div>
              <div class="meta-item">
                <span>{{ tr("分组数") }}</span>
                <strong>{{ importPreview.groupCount }}</strong>
              </div>
              <div class="meta-item">
                <span>{{ tr("作者") }}</span>
                <strong>{{ importPreview.author || tr('未知') }}</strong>
              </div>
            </div>

            <div v-if="importPreview.typeStats.length" class="import-type-list">
              <span v-for="stat in importPreview.typeStats" :key="stat.type" class="type-chip">
                {{ entryTypeLabel(stat.type) }} {{ stat.count }}
              </span>
            </div>

            <div v-if="importPreview.previewEntries.length" class="preview-entry-list">
              <div
                v-for="previewEntry in importPreview.previewEntries"
                :key="previewEntry.uid"
                class="preview-entry-item"
              >
                <span class="preview-entry-name">{{ previewEntry.name }}</span>
                <span class="preview-entry-meta">{{ entryTypeLabel(previewEntry.type) }} / {{ entryModeLabel(previewEntry.mode) }}</span>
              </div>
            </div>

            <div class="card-actions">
              <button class="primary-btn" :disabled="importing" @click="confirmImportFromPreview">
                {{ tr(importing ? '导入中...' : '确认导入为新世界书') }}
              </button>
              <button class="ghost-btn" @click="clearImportPreview">{{ tr("取消预览") }}</button>
            </div>
          </div>

          <div v-else class="empty-hint">
            {{ tr("导入前会先显示摘要预览，确认后再创建新世界书。") }}
          </div>
        </section>

        <section v-if="editorTab === 'groups'" class="card">
          <div class="card-head split">
            <h2>{{ tr("分组管理") }}</h2>
            <button class="ghost-btn small" :disabled="groupWorking" @click="pruneEmptyGroups">
              {{ tr("清理空分组") }}
            </button>
          </div>

          <div v-if="groupError" class="import-error">{{ displayStatus(groupError) }}</div>
          <div v-if="groupSuccess" class="import-success">{{ displayStatus(groupSuccess) }}</div>

          <div v-if="groupStats.length" class="group-overview">
            <div
              v-for="group in groupStats"
              :key="group.name"
              class="group-overview-item"
              :class="{ empty: group.entryCount === 0 }"
            >
              <span>{{ group.name }}</span>
              <strong>{{ tr('条目：{count}', { count: group.entryCount }) }}</strong>
            </div>
          </div>
          <div v-else class="empty-hint">{{ tr("当前没有分组，可先创建。") }}</div>

          <div class="group-manager-grid">
            <section class="group-manager-block">
              <h3>{{ tr("创建分组") }}</h3>
              <div class="group-form-row">
                <input
                  v-model.trim="groupDraftName"
                  class="text-input"
                  type="text"
                  list="worldbook-group-options"
                  :placeholder="tr('输入新分组名称')"
                />
                <button class="ghost-btn" :disabled="groupWorking" @click="createGroup">
                  {{ tr("创建") }}
                </button>
              </div>
            </section>

            <section class="group-manager-block" v-if="groupStats.length">
              <h3>{{ tr("重命名分组") }}</h3>
              <div class="group-form-row">
                <select v-model="groupRenameSource" class="select-input" :aria-label="tr('选择要重命名的分组')">
                  <option v-for="group in groupStats" :key="`rename-${group.name}`" :value="group.name">
                    {{ group.name }}
                  </option>
                </select>
                <input
                  v-model.trim="groupRenameTarget"
                  class="text-input"
                  type="text"
                  list="worldbook-group-options"
                  :placeholder="tr('新分组名称')"
                />
                <button class="ghost-btn" :disabled="groupWorking" @click="renameGroup">
                  {{ tr("重命名") }}
                </button>
              </div>
            </section>

            <section class="group-manager-block" v-if="groupStats.length">
              <h3>{{ tr("迁移条目") }}</h3>
              <div class="group-form-row">
                <select v-model="groupMoveSource" class="select-input" :aria-label="tr('选择要移动的分组')">
                  <option v-for="group in groupStats" :key="`move-${group.name}`" :value="group.name">
                    {{ group.name }}
                  </option>
                </select>
                <input
                  v-model.trim="groupMoveTarget"
                  class="text-input"
                  type="text"
                  list="worldbook-group-options"
                  :placeholder="tr('迁移到分组')"
                />
                <label class="checkbox-line inline">
                  <input v-model="groupDropSourceAfterMove" type="checkbox" />
                  <span>{{ tr("迁移后删除源分组") }}</span>
                </label>
                <button class="ghost-btn" :disabled="groupWorking" @click="migrateGroupEntries">
                  {{ tr("迁移") }}
                </button>
              </div>
            </section>

            <section class="group-manager-block danger" v-if="groupStats.length">
              <h3>{{ tr("删除分组") }}</h3>
              <div class="group-form-row">
                <select v-model="groupDeleteSource" class="select-input" :aria-label="tr('选择要删除的分组')">
                  <option v-for="group in groupStats" :key="`delete-${group.name}`" :value="group.name">
                    {{ group.name }}
                  </option>
                </select>
                <button class="danger-btn" :disabled="groupWorking" @click="deleteGroup">
                  {{ tr("删除并清空条目分组") }}
                </button>
              </div>
            </section>
          </div>

          <datalist id="worldbook-group-options">
            <option v-for="group in availableGroups" :key="`opt-${group}`" :value="group"></option>
          </datalist>
        </section>

        <section v-if="editorTab === 'settlement'" class="card settlement-card">
          <div class="card-head split">
            <div>
              <h2>{{ tr("章回结算") }}</h2>
              <p class="settlement-lede">{{ tr("每章交稿后结算五件：章卡、人物状态、交接、伏笔台账、世界揭示。草案不落库，显式「写入」才生效；只写世界书侧，绝不碰正文。") }}</p>
            </div>
            <span class="settlement-channel" :class="{ online: fileChannelOnline }" data-test="settlement-channel">
              {{ fileChannelOnline ? tr("文件通道：已连接") : tr("文件通道：离线（本地编辑继续，server 可达后自动落盘）") }}
            </span>
          </div>

          <div v-if="settlementError" class="import-error" role="alert">{{ displayStatus(settlementError) }}</div>
          <div v-if="settlementMessage" class="import-success" role="status">{{ displayStatus(settlementMessage) }}</div>

          <div class="settlement-draft-gen">
            <label>
              {{ tr("章节标题") }}
              <input v-model.trim="settlementDraft.chapterTitle" class="text-input" type="text" :placeholder="tr('例如：第 3 章 盐夜')" />
            </label>
            <label class="full-width">
              {{ tr("本章产出文本（仅用于本地抽取草案，不进入世界书或正文）") }}
              <textarea
                v-model="settlementDraft.sourceText"
                class="text-area"
                rows="4"
                :placeholder="tr('粘贴一轮生成或本章片段，点「生成结算草案」。')"
              ></textarea>
            </label>
            <div class="settlement-draft-actions">
              <button
                class="ghost-btn"
                :disabled="settlementBusy || !settlementDraft.sourceText.trim()"
                @click="generateSettlementDraft"
              >
                {{ tr("生成结算草案") }}
              </button>
              <span class="settlement-hint">{{ tr("草案=本地确定性抽取（提及人物/新名目/首句），逐项确认后才写入。") }}</span>
            </div>
          </div>

          <details class="settlement-piece">
            <summary>{{ tr("① 章卡 → 章账（一句话+梗点+钩型+新名目）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
            <div class="settlement-grid">
              <label>
                {{ tr("一句话") }}
                <input v-model.trim="settlementDraft.card.summary" class="text-input" type="text" />
              </label>
              <label>
                {{ tr("梗点/钩子") }}
                <input v-model.trim="settlementDraft.card.hook" class="text-input" type="text" :placeholder="tr('钩型+梗点，一句话')" />
              </label>
              <label class="full-width">
                {{ tr("新名目（逗号分隔；成长阶/招式等先登记再进正文）") }}
                <input v-model.trim="settlementDraft.card.newTermsText" class="text-input" type="text" />
              </label>
            </div>
            <div class="settlement-piece-actions">
              <span class="settlement-hint">{{ tr("同名章节已结算过时再点写入不会重复追加。") }}</span>
              <button class="primary-btn" :disabled="settlementBusy || !settlementCardWriteReady" @click="writeChapterCard">
                {{ tr(settlementBusy ? '写入中...' : '写入章卡') }}
              </button>
            </div>
          </details>

          <details class="settlement-piece">
            <summary>{{ tr("③ 交接 → 章账末节（下一章 handoff，3-5 条）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
            <label class="full-width">
              {{ tr("交接清单（每行一条；下一章写手只读末节）") }}
              <textarea
                v-model="settlementDraft.handoffText"
                class="text-area"
                rows="4"
                :placeholder="tr('写下一章必知的事实与悬置钩子，不写过程。')"
              ></textarea>
            </label>
            <div class="settlement-piece-actions">
              <span class="settlement-hint">
                {{ settlementHandoffItems.length }}/{{ settlementHandoffMax }} 条
                <template v-if="settlementHandoffItems.length > 0 && settlementHandoffItems.length < settlementHandoffMin">（{{ tr("不足 3 条不会写入交接节") }}）</template>
              </span>
              <button class="primary-btn" :disabled="settlementBusy || !settlementHandoffWriteReady" @click="writeChapterHandoff">
                {{ tr(settlementBusy ? '写入中...' : '写入交接（末节）') }}
              </button>
            </div>
          </details>

          <details class="settlement-piece">
            <summary>{{ tr("② 人物状态推进 → 条目（当前状态改写+变动史追加）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
            <div v-if="!settlementDraft.characters.length" class="empty-hint">{{ tr("生成草案会带入正文提及的角色，也可在下方手动添加。") }}</div>
            <article v-for="(row, index) in settlementDraft.characters" :key="`char-${index}`" class="settlement-character" data-test="settlement-character">
              <div class="settlement-character-head">
                <select v-model="row.entryId" class="select-input" :aria-label="tr('选择人物条目')">
                  <option v-for="option in settlementCharacterOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <span v-if="row.written" class="settlement-written">{{ tr("已写入") }}</span>
                <button class="ghost-btn small" :disabled="settlementBusy" @click="removeCharacterRow(index)">{{ tr("移除") }}</button>
              </div>
              <div class="settlement-grid">
                <label>{{ tr("伤势") }} <input v-model.trim="row.deltas.injury" class="text-input" type="text" /></label>
                <label>{{ tr("财物") }} <input v-model.trim="row.deltas.money" class="text-input" type="text" /></label>
                <label>{{ tr("知情") }} <input v-model.trim="row.deltas.knowledge" class="text-input" type="text" /></label>
                <label>{{ tr("关系") }} <input v-model.trim="row.deltas.relations" class="text-input" type="text" /></label>
                <label>{{ tr("位置") }} <input v-model.trim="row.deltas.location" class="text-input" type="text" /></label>
                <label>{{ tr("备注（记入变动史）") }} <input v-model.trim="row.deltas.note" class="text-input" type="text" /></label>
              </div>
              <div class="settlement-piece-actions">
                <span class="settlement-hint">{{ tr("只改【当前状态】并追加【变动史】；背景/性格/外貌等静态段不动。") }}</span>
                <button
                  class="primary-btn"
                  :disabled="settlementBusy || !row.entryId || !settlementRowHasDelta(row)"
                  @click="writeCharacterRow(row)"
                >
                  {{ tr("写入人物状态") }}
                </button>
              </div>
            </article>
            <div class="settlement-add-row">
              <select class="select-input" value="" :aria-label="tr('添加人物行')" @change="addCharacterRow">
                <option value="">{{ tr("＋ 添加人物行…") }}</option>
                <option v-for="option in settlementCharacterOptions" :key="`add-${option.value}`" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </div>
          </details>

          <details class="settlement-piece">
            <summary>{{ tr("④ 伏笔变动 → 台账（open/paid/retired 机器可读）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
            <div v-if="!settlementDraft.foreshadow.length" class="empty-hint">{{ tr("登记本章新埋/回收/顺期的伏笔；同 fid 行会被原位更新。") }}</div>
            <article v-for="(row, index) in settlementDraft.foreshadow" :key="`fb-${index}`" class="settlement-character">
              <div class="settlement-grid">
                <label>{{ tr("fid") }} <input v-model.trim="row.fid" class="text-input" type="text" :placeholder="tr('例如 F-012')" /></label>
                <label class="full-width">{{ tr("内容") }} <input v-model.trim="row.content" class="text-input" type="text" /></label>
                <label>{{ tr("埋点") }} <input v-model.trim="row.plantedAt" class="text-input" type="text" :placeholder="tr('章名/节点')" /></label>
                <label>{{ tr("预定回收") }} <input v-model.trim="row.dueBy" class="text-input" type="text" /></label>
                <label>
                  {{ tr("状态") }}
                  <select v-model="row.status" class="select-input">
                    <option v-for="status in settlementForeshadowStatuses" :key="status" :value="status">{{ status }}</option>
                  </select>
                </label>
              </div>
              <div class="settlement-piece-actions">
                <button class="ghost-btn small" :disabled="settlementBusy" @click="removeForeshadowRow(index)">{{ tr("移除") }}</button>
              </div>
            </article>
            <div class="settlement-piece-actions">
              <button class="ghost-btn small" :disabled="settlementBusy" @click="addForeshadowRow">{{ tr("＋ 添加伏笔行") }}</button>
              <button
                class="primary-btn"
                :disabled="settlementBusy || !settlementDraft.foreshadow.some((row) => row.fid.trim())"
                @click="writeForeshadowRows"
              >
                {{ tr(settlementBusy ? '写入中...' : '写入伏笔台账') }}
              </button>
            </div>
          </details>

          <details class="settlement-piece">
            <summary>{{ tr("⑤ 世界揭示 → 设定条目（逐条采纳）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
            <div class="settlement-add-row">
              <input
                v-model.trim="settlementDraft.revealText"
                class="text-input"
                type="text"
                :placeholder="tr('本章确立的新设定事实，例如：盐引制度由潮盐行会垄断')"
                @keyup.enter="addReveal"
              />
              <button class="ghost-btn small" :disabled="!settlementDraft.revealText.trim()" @click="addReveal">{{ tr("＋ 登记揭示") }}</button>
            </div>
            <div v-if="!settlementDraft.reveals.length" class="empty-hint">{{ tr("登记后逐条「采纳」，采纳会创建设定（lore）条目。") }}</div>
            <article v-for="(reveal, index) in settlementDraft.reveals" :key="`reveal-${index}`" class="settlement-character">
              <div class="settlement-grid">
                <label class="full-width">
                  {{ tr("揭示事实") }}
                  <input v-model.trim="reveal.text" class="text-input" type="text" />
                </label>
                <label>
                  {{ tr("条目名（可选）") }}
                  <input v-model.trim="reveal.name" class="text-input" type="text" :placeholder="tr('缺省用「世界揭示 N」')" />
                </label>
              </div>
              <div class="settlement-piece-actions">
                <span v-if="reveal.adopted" class="settlement-written">{{ tr("已采纳") }}</span>
                <button v-if="!reveal.adopted" class="primary-btn" :disabled="settlementBusy || !reveal.text.trim()" @click="adoptReveal(reveal)">
                  {{ tr("采纳为设定条目") }}
                </button>
                <button class="ghost-btn small" :disabled="settlementBusy" @click="removeReveal(index)">{{ tr("移除") }}</button>
              </div>
            </article>
          </details>

          <div class="settlement-views">
            <details class="settlement-piece view">
              <summary>{{ tr("章账（只读）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
              <pre class="settlement-ledger-view" data-test="chapter-ledger-view">{{ chapterLedgerText }}</pre>
            </details>
            <details class="settlement-piece view">
              <summary>{{ tr("伏笔台账（只读）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
              <pre class="settlement-ledger-view">{{ foreshadowLedgerText }}</pre>
            </details>
            <details class="settlement-piece view">
              <summary>{{ tr("底牌（作者专用 · 永不入正文）") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
              <p class="settlement-hint">{{ tr("status:draft 且带底牌标记的条目被注入端显式排除，任何激活路径都不会进入正文上下文。") }}</p>
              <div v-if="covertEntries.length" class="settlement-covert-list">
                <article v-for="entry in covertEntries" :key="entry.id" class="settlement-covert" data-test="covert-card">
                  <header>
                    <strong>{{ entry.name }}</strong>
                    <span class="settlement-covert-badge">{{ tr("永不入正文") }}</span>
                  </header>
                  <p>{{ entry.content }}</p>
                </article>
              </div>
              <div v-else class="empty-hint">{{ tr("暂无底牌条目；项目文件的 世界书/底牌/暗线底牌.md 为作者专用登记处。") }}</div>
            </details>
          </div>
        </section>

        <section v-if="editorTab === 'entries'" class="card entry-workspace-card">
          <div class="card-head split">
            <div><h2>{{ tr("条目管理") }}</h2></div>
            <div class="entry-tools">
              <input
                v-model.trim="entrySearch"
                class="search-input"
                :placeholder="tr('搜索条目...')"
                type="text"
                :aria-label="tr('搜索条目')"
              />
              <select v-model="entryTypeFilter" class="select-input" :aria-label="tr('按条目类型筛选')">
                <option value="all">{{ tr("全部类型") }}</option>
                <option v-for="type in entryTypes" :key="type.value" :value="type.value">
                  {{ tr(type.label) }}
                </option>
              </select>
              <select v-model="injectionModeFilter" class="select-input" :aria-label="tr('按注入模式筛选')">
                <option value="all">{{ tr("全部注入模式") }}</option>
                <option v-for="mode in injectionModes" :key="mode.value" :value="mode.value">
                  {{ tr(mode.label) }}
                </option>
              </select>
              <select v-model="entryGroupFilter" class="select-input" :aria-label="tr('按分组筛选')">
                <option value="all">{{ tr("全部分组") }}</option>
                <option value="__none">{{ tr("未分组") }}</option>
                <option v-for="group in availableGroups" :key="group" :value="group">
                  {{ group }}
                </option>
              </select>
              <button class="ghost-btn" :class="{ active: maintenanceOpen }" :aria-expanded="maintenanceOpen" @click="toggleMaintenance">
                <WorkbenchIcon name="assistant" :size="16" />
                {{ tr("AI 处理世界书") }}
              </button>
              <button class="ghost-btn" :class="{ active: migrationOpen }" :aria-expanded="migrationOpen" data-test="profile-migration-toggle" @click="toggleMigration">
                <WorkbenchIcon name="archive" :size="16" />
                {{ tr("档案迁移（预览）") }}
              </button>
              <button class="ghost-btn" @click="createEntry"><WorkbenchIcon name="plus" :size="16" />{{ tr("新增条目") }}</button>
            </div>
          </div>

          <section v-if="maintenanceOpen" class="worldbook-maintenance" aria-labelledby="worldbook-maintenance-title">
            <div class="maintenance-head">
              <div>
                <h3 id="worldbook-maintenance-title">{{ tr("用自然语言维护世界书") }}</h3>
                <p>{{ tr("模型只提出候选，确认后才会写入条目。") }}</p>
              </div>
            </div>
            <div class="maintenance-modes" role="tablist" :aria-label="tr('世界书处理模式')">
              <button
                v-for="mode in maintenanceModes"
                :key="mode.value"
                type="button"
                :class="['maintenance-mode', { active: maintenanceMode === mode.value }]"
                @click="maintenanceMode = mode.value"
              >
                <strong>{{ tr(mode.label) }}</strong>
                <span>{{ tr(mode.description) }}</span>
              </button>
            </div>
            <textarea
              v-model.trim="maintenanceBrief"
              class="text-area maintenance-brief"
              rows="3"
              :placeholder="tr(maintenancePlaceholder)"
              :disabled="maintenanceWorking"
            ></textarea>
            <div class="maintenance-actions">
              <span class="maintenance-scope">
                {{ maintenanceMode === 'audit'
                  ? tr('本地预筛 {count} 个审查目标', { count: maintenanceCandidateCount })
                  : maintenanceMode === 'refine'
                    ? tr('已选 {count} 条', { count: selectedEntryIds.length })
                    : tr('读取当前世界书相关条目') }}
              </span>
              <button
                type="button"
                class="primary-btn"
                :disabled="maintenanceWorking || !maintenanceCanRun"
                @click="runMaintenance"
              >
                {{ tr(maintenanceWorking ? '模型审阅中...' : maintenanceActionLabel) }}
              </button>
            </div>
            <div v-if="maintenanceError" class="maintenance-error" role="alert">{{ tr(maintenanceError) }}</div>
            <div v-if="maintenanceStale" class="maintenance-stale" role="status">
              {{ tr("世界书已在生成后发生变化，这批建议已过期。请重新运行审查，避免覆盖新的设定。") }}
            </div>
            <div v-if="maintenanceSummary || maintenanceCompleted" class="maintenance-summary">{{ maintenanceSummary || tr('已生成候选，请逐项审阅。') }}</div>
            <div v-if="maintenanceCandidates.length" class="maintenance-candidates">
              <article
                v-for="candidate in maintenanceCandidates"
                :key="candidate.id"
                :class="['maintenance-candidate', `is-${candidate.status}`]"
              >
                <div class="candidate-head">
                  <span class="candidate-action">{{ tr(maintenanceActionLabelFor(candidate.action)) }}</span>
                  <span :class="['candidate-confidence', `is-${candidate.confidence}`]">{{ candidate.confidence }}</span>
                  <span v-if="candidate.status === 'applied'" class="candidate-status">{{ tr("已采纳") }}</span>
                  <span v-else-if="candidate.status === 'ignored'" class="candidate-status">{{ tr("已忽略") }}</span>
                  <button
                    v-if="candidate.proposedEntry && candidate.status === 'pending'"
                    type="button"
                    class="ghost-btn small"
                    @click="toggleMaintenanceCandidateEdit(candidate)"
                  >
                    {{ tr(candidate.editing ? '收起编辑' : '编辑建议') }}
                  </button>
                </div>
                <p class="candidate-reason">{{ candidate.reason || tr('模型未提供额外说明。') }}</p>
                <div v-if="candidate.proposedEntry && !candidate.editing" class="candidate-proposal">
                  <strong>{{ candidate.proposedEntry.name }}</strong>
                  <span>{{ entryTypeLabel(candidate.proposedEntry.type) }} · {{ candidate.proposedEntry.group || tr('未分组') }}</span>
                  <p>{{ candidate.proposedEntry.content }}</p>
                </div>
                <div v-if="candidate.editor && candidate.editing" class="candidate-edit-form">
                  <input v-model.trim="candidate.editor.name" class="text-input" type="text" :placeholder="tr('条目名称')" />
                  <select v-model="candidate.editor.type" class="select-input">
                    <option v-for="type in entryTypes" :key="type.value" :value="type.value">{{ tr(type.label) }}</option>
                  </select>
                  <input v-model.trim="candidate.editor.keysText" class="text-input" type="text" :placeholder="tr('主触发词，逗号分隔')" />
                  <input v-model.trim="candidate.editor.keysSecondaryText" class="text-input" type="text" :placeholder="tr('次级触发词，逗号分隔')" />
                  <input v-model.trim="candidate.editor.group" class="text-input" type="text" :placeholder="tr('分组')" />
                  <textarea v-model.trim="candidate.editor.content" class="text-area" rows="5" :placeholder="tr('条目正文')"></textarea>
                </div>
                <div v-if="candidate.entryIds.length" class="candidate-links">
                {{ tr('涉及：{names}', { names: candidate.entryIds.map(entryName).join(uiLocale === 'en' ? ', ' : '、') }) }}
                </div>
                <div v-if="candidate.status === 'pending'" class="candidate-actions">
                  <button type="button" class="primary-btn small" :disabled="maintenanceApplying || maintenanceStale" @click="applyMaintenanceCandidate(candidate)">
                    {{ tr(candidate.action === 'ignore' || candidate.action === 'conflict' ? '标记已处理' : '采纳建议') }}
                  </button>
                  <button type="button" class="ghost-btn small" :disabled="maintenanceApplying" @click="ignoreMaintenanceCandidate(candidate)">{{ tr("忽略") }}</button>
                </div>
              </article>
            </div>
            <div v-else-if="maintenanceCompleted" class="maintenance-empty">{{ tr("没有需要处理的候选。") }}</div>
          </section>

          <!-- 档案迁移（预览）：扫描 profile 为空且正文带【标签】结构的条目；
               回填只写 profile 不改正文；重复条目只标记建议，不自动删除。 -->
          <section v-if="migrationOpen" class="worldbook-migration" aria-labelledby="worldbook-migration-title" data-test="profile-migration-panel">
            <div class="maintenance-head">
              <div>
                <h3 id="worldbook-migration-title">{{ tr("档案迁移（预览）") }}</h3>
                <p>{{ tr("回填只写档案字段，不改条目正文；模板必填缺失不阻塞，留给编辑器补。") }}</p>
              </div>
              <button type="button" class="ghost-btn small" :disabled="migrationWorking" @click="runMigrationScan">
                {{ tr(migrationWorking ? '扫描中...' : '重新扫描') }}
              </button>
            </div>
            <div v-if="migrationError" class="maintenance-error" role="alert">{{ tr(migrationError) }}</div>
            <template v-if="migrationScan">
              <h4 class="migration-subhead">{{ tr("待回填条目（{count}）", { count: migrationScan.needsMigration.length }) }}</h4>
              <p class="migration-hint">{{ tr("档案为空且正文含 3 个以上【标签】的条目；执行回填会把标签内容整理进档案字段。") }}</p>
              <ul v-if="migrationScan.needsMigration.length" class="migration-list">
                <li v-for="entry in migrationScan.needsMigration" :key="entry.id" class="migration-row">
                  <span class="entry-title">{{ entry.name || tr('未命名条目') }}</span>
                  <span class="entry-type">{{ entryTypeLabel(entry.type) }}</span>
                </li>
              </ul>
              <div v-else class="empty-hint">{{ tr("没有需要回填的条目。") }}</div>
              <div class="migration-actions">
                <button
                  type="button"
                  class="primary-btn"
                  data-test="profile-migration-apply"
                  :disabled="migrationApplying || migrationWorking || !migrationScan.needsMigration.length"
                  @click="applyMigrationBackfill"
                >
                  {{ tr(migrationApplying ? '回填中...' : '执行回填') }}
                </button>
              </div>
              <h4 class="migration-subhead">{{ tr("疑似重复（{count} 组）", { count: migrationScan.duplicates.length }) }}</h4>
              <p class="migration-hint">{{ tr("同名同类型的条目组；保留最早创建的一条，其余只建议标记，不自动删除。") }}</p>
              <ul v-if="migrationScan.duplicates.length" class="migration-list">
                <li v-for="group in migrationScan.duplicates" :key="group.keepId" class="migration-row">
                  <span class="migration-group">
                    <strong>{{ group.name }}</strong>
                    <span class="entry-type">{{ entryTypeLabel(group.type) }}</span>
                  </span>
                  <span class="migration-dupes">{{ duplicateGroupLabel(group) }}</span>
                </li>
              </ul>
              <div v-else class="empty-hint">{{ tr("没有发现同名同类型的重复条目。") }}</div>
              <div class="migration-actions">
                <button
                  type="button"
                  class="ghost-btn"
                  data-test="profile-migration-mark"
                  :disabled="migrationApplying || migrationWorking || !migrationScan.duplicates.length"
                  @click="markDuplicateEntries"
                >
                  {{ tr("按建议标记重复") }}
                </button>
              </div>
              <div v-if="migrationMessage" class="maintenance-summary" role="status">{{ migrationMessage }}</div>
            </template>
            <div v-else class="empty-hint">{{ tr("正在扫描当前世界书...") }}</div>
          </section>

          <div class="bulk-tools" v-if="selectedEntryIds.length">
            <span class="bulk-label">{{ tr('已选 {count} 条', { count: selectedEntryIds.length }) }}</span>
            <button class="ghost-btn small" @click="selectAllFilteredEntries">{{ tr("全选筛选结果") }}</button>
            <button class="ghost-btn small" @click="invertFilteredSelection">{{ tr("反选") }}</button>
            <button class="ghost-btn small" @click="clearEntrySelection">{{ tr("清空选择") }}</button>
            <select v-model="bulkModeTarget" class="select-input compact">
              <option v-for="mode in injectionModes" :key="mode.value" :value="mode.value">
                {{ tr(mode.label) }}
              </option>
            </select>
            <button class="ghost-btn small" :disabled="!selectedEntryIds.length" @click="applyBulkMode">
              {{ tr("批量改模式") }}
            </button>
            <input
              v-model.trim="bulkGroupValue"
              class="text-input compact"
              type="text"
              :placeholder="tr('批量分组')"
            />
            <button class="ghost-btn small" :disabled="!selectedEntryIds.length" @click="applyBulkGroup">
              {{ tr("批量改分组") }}
            </button>
            <button class="danger-btn small" :disabled="!selectedEntryIds.length" @click="bulkDeleteEntries">
              {{ tr("批量删除") }}
            </button>
          </div>

          <div class="entry-layout">
            <aside class="entry-list" :aria-label="tr('条目目录')">
              <div class="entry-directory-head"><span>{{ tr('条目：{count}', { count: filteredEntries.length }) }}</span><button v-if="filteredEntries.length" class="ghost-btn small" @click="selectAllFilteredEntries">{{ tr("全选") }}</button></div>
              <div
                v-for="entry in filteredEntries"
                :key="entry.id"
                :class="['entry-item', { active: entry.id === selectedEntryId }]"
                :data-entry-id="entry.id"
                @click="pickEntry(entry.id)"
              >
                <input
                  type="checkbox"
                  class="entry-checkbox"
                  :aria-label="tr('选择 {name}', { name: entry.name || tr('未命名条目') })"
                  :checked="isEntrySelected(entry.id)"
                  @click.stop
                  @change="toggleEntrySelection(entry.id, $event.target.checked)"
                />
                <button type="button" class="entry-main" :aria-current="entry.id === selectedEntryId ? 'true' : undefined" @click.stop="pickEntry(entry.id)">
                  <span class="entry-title">{{ entry.name || tr('未命名条目') }}</span>
                  <span class="entry-badges">
                    <span class="entry-type">{{ entryTypeLabel(entry.type) }}</span>
                    <span class="entry-mode">{{ entryModeLabel(entry.injection?.mode) }}</span>
                    <span v-if="entry.injection?.group" class="entry-group">{{ entry.injection.group }}</span>
                  </span>
                </button>
              </div>
              <div v-if="!filteredEntries.length" class="empty-hint">{{ tr("暂无匹配条目") }}</div>
            </aside>

            <div class="entry-editor" v-if="selectedEntry">
              <header class="entry-editor-heading"><div><h3>{{ selectedEntry.name || tr('未命名条目') }}</h3></div><button class="primary-btn" :disabled="savingEntry" @click="saveEntry">{{ tr(savingEntry ? '保存中...' : '保存条目') }}</button></header>
              <label>
                {{ tr("条目名称") }}
                <input v-model.trim="entryForm.name" class="text-input" type="text" :placeholder="tr('条目名称')" />
              </label>
              <label>
                {{ tr("条目类型") }}
                <input
                  v-model.trim="entryForm.type"
                  class="text-input"
                  type="text"
                  list="worldbook-entry-type-options"
                  :placeholder="tr('可建议或自由输入，如 角色 / 势力 / 种族')"
                />
                <datalist id="worldbook-entry-type-options">
                  <option v-for="typeValue in entryTypeSuggestions" :key="typeValue" :value="typeValue"></option>
                </datalist>
              </label>
              <label>
                {{ tr("触发词（逗号分隔）") }}
                <input
                  v-model.trim="entryForm.keys"
                  class="text-input"
                  type="text"
                  :placeholder="tr('例如：公爵领, 埃利奥诺')"
                />
              </label>
              <label>
                {{ tr("次级触发词（逗号分隔）") }}
                <input
                  v-model.trim="entryForm.keysSecondary"
                  class="text-input"
                  type="text"
                  :placeholder="tr('例如：边境领地')"
                />
              </label>

              <EntryMdEditor v-model="entryForm.content" />

              <!-- 角色声口老编辑器已退役：声口读写统一走档案 profile.speech（声口横切），
                   见下方「条目档案模板与关联」里的 EntryProfileEditor。 -->

              <details class="entry-advanced-panel" :open="entryAdvancedOpen" @toggle="onAdvancedToggle">
                <summary>{{ tr("条目档案模板与关联") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
                <EntryProfileEditor
                  :entry="selectedEntry"
                  :content="entryForm.content"
                  :saving="savingEntry"
                  @save="applyProfileSave"
                />
                <EntryLinksEditor
                  ref="entryLinksEditorRef"
                  :entry="selectedEntry"
                  :entries="entries"
                  :content="entryForm.content"
                  :saving="savingEntry"
                  @save="applyLinksSave"
                />
              </details>

              <RelationEdgeDialog
                v-model:open="edgeDialogOpen"
                :from-name="edgeDialogFrom.name"
                :to-name="edgeDialogTo.name"
                @confirm="onEdgeDialogConfirm"
              />

              <details class="injection-panel">
                <summary>{{ tr("高级引用设置") }}<WorkbenchIcon name="chevron-down" :size="16" /></summary>
                <div class="injection-grid">
                  <label>
                    {{ tr("注入模式") }}
                    <select v-model="entryForm.injectionMode" class="select-input">
                      <option v-for="mode in injectionModes" :key="mode.value" :value="mode.value">
                        {{ tr(mode.label) }}
                      </option>
                    </select>
                  </label>
                  <label>
                    {{ tr("概率（0-100）") }}
                    <input v-model.number="entryForm.injectionProbability" class="text-input" type="number" min="0" max="100" />
                  </label>
                  <label>
                    {{ tr("深度") }}
                    <input v-model.number="entryForm.injectionDepth" class="text-input" type="number" min="1" />
                  </label>
                  <label>
                    {{ tr("冷却轮次") }}
                    <input v-model.number="entryForm.injectionCooldown" class="text-input" type="number" min="0" />
                  </label>
                  <label class="full-row">
                    {{ tr("分组") }}
                    <input v-model.trim="entryForm.injectionGroup" class="text-input" type="text" :placeholder="tr('例如：地理设定')" />
                  </label>
                  <label>
                    {{ tr("次级词判定") }}
                    <select v-model="entryForm.injectionSecondaryMode" class="select-input">
                      <option value="any">{{ tr("任一命中（any）") }}</option>
                      <option value="all">{{ tr("全部命中（all）") }}</option>
                    </select>
                  </label>
                  <label class="checkbox-line" :title="tr('拉丁文本要求词边界匹配（中文默认短语匹配）')">
                    <input v-model="entryForm.injectionWholeWord" type="checkbox" />
                    <span>{{ tr("整词匹配") }}</span>
                  </label>
                  <label class="checkbox-line" :title="tr('区分大小写（拉丁文本）')">
                    <input v-model="entryForm.injectionCaseSensitive" type="checkbox" />
                    <span>{{ tr("区分大小写") }}</span>
                  </label>
                </div>
                <label class="checkbox-line">
                  <input v-model="entryForm.excludeRecursion" type="checkbox" />
                  <span>{{ tr("排除递归注入") }}</span>
                </label>
                <div class="group-quick" v-if="availableGroups.length">
                  <span class="group-quick-label">{{ tr("常用分组") }}</span>
                  <div class="group-chip-list">
                    <button
                      v-for="group in availableGroups"
                      :key="group"
                      class="group-chip"
                      :class="{ active: entryForm.injectionGroup === group }"
                      @click.prevent="setEntryGroup(group)"
                    >
                      {{ group }}
                    </button>
                  </div>
                </div>
              </details>

              <div class="card-actions">
                <span class="entry-save-note">{{ tr("修改后点击「保存条目」生效") }}</span>
                <button class="danger-btn" @click="deleteEntry"><WorkbenchIcon name="trash" :size="15" />{{ tr("删除条目") }}</button>
              </div>
            </div>

            <div class="entry-editor empty" v-else>
              {{ tr("请选择一个条目进行编辑，或点击“新增条目”。") }}
            </div>
          </div>
        </section>

      </section>

      <section class="editor-main empty" v-else>
        {{ tr("尚无可编辑世界书，点击上方“新建世界书”开始。") }}
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { tr, uiLocale } from '../i18n/index.js'
import { useRoute, useRouter, onBeforeRouteUpdate } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { normalizeNarrativeVoiceProfile } from '../services/narrativeVoiceProfile'
import {
  createWorldbookMaintenanceServices,
  findWorldbookAuditTargets,
  WORLDBOOK_MAINTENANCE_MODES
} from '../services/worldbook/worldbookMaintenance'
import UnifiedEntryBrowser from '../components/worldbook/UnifiedEntryBrowser.vue'
import { createSettingsPageDispatcher } from '../services/agents/settings/settingsTaskDispatcher'
import { createSettingsMaintenanceWorkflow } from '../services/agents/settings/settingsMaintenanceWorkflow'
import SettingsWorkspaceHeader from '../components/workbench/SettingsWorkspaceHeader.vue'
import SettingsContextBar from '../components/workbench/SettingsContextBar.vue'
import { useSettingsProjectContext } from '../composables/useSettingsProjectContext'
import SettingsReturnToManuscript from '../components/workbench/SettingsReturnToManuscript.vue'
import WorkbenchIcon from '../components/workbench/WorkbenchIcon.vue'
import EntryMdEditor from '../components/worldbook/EntryMdEditor.vue'
import EntryProfileEditor from '../components/worldbook/EntryProfileEditor.vue'
import EntryLinksEditor from '../components/worldbook/EntryLinksEditor.vue'
import RelationEdgeDialog from '../components/worldbook/RelationEdgeDialog.vue'
import WorldbookResearchPanel from '../components/worldbook/WorldbookResearchPanel.vue'
import {
  FORESHADOW_STATUSES,
  HANDOFF_MAX_ITEMS,
  HANDOFF_MIN_ITEMS,
  applyChapterSettlement,
  chapterLedgerSkeleton,
  createSettlementChannel,
  foreshadowLedgerSkeleton,
  isChapterLedgerEntry,
  isCovertCardEntry,
  isForeshadowLedgerEntry,
  settlementFromTurn
} from '../services/worldbook/settlementService'
import { isFileSourceAvailable, refreshFileSourceAvailability } from '../services/worldbook/worldbookFileRepository'
import { profileFromEntry } from '../services/worldbook/entryProfileTemplates.js'
import { applyMigration, markDuplicates, scanEntriesForMigration } from '../services/worldbook/profileMigration'

const route = useRoute()
const router = useRouter()
const worldStore = useWorldStore()

// 设定 Agent 调度入口：高级编辑维护统一走 canonical settings.maintenance.audit 任务。
const settingsDispatcher = createSettingsPageDispatcher({
  adapters: {
    settingsMaintenance: createSettingsMaintenanceWorkflow(createWorldbookMaintenanceServices())
  }
})

const entrySearch = ref('')
const entryTypeFilter = ref('all')
const injectionModeFilter = ref('all')
const entryGroupFilter = ref('all')
const selectedEntryId = ref('')
const selectedEntryIds = ref([])
const bulkModeTarget = ref('selective')
const bulkGroupValue = ref('')
const importFileInputRef = ref(null)
const importPreview = ref(null)
const importError = ref('')
const transferMessage = ref('')
const importing = ref(false)
const exporting = ref(false)
const groupDraftName = ref('')
const groupRenameSource = ref('')
const groupRenameTarget = ref('')
const groupMoveSource = ref('')
const groupMoveTarget = ref('')
const groupDeleteSource = ref('')
const groupDropSourceAfterMove = ref(true)
const groupWorking = ref(false)
const groupError = ref('')
const groupSuccess = ref('')
const savingWorldbook = ref(false)
const savingEntry = ref(false)
const maintenanceOpen = ref(false)
const maintenanceMode = ref(WORLDBOOK_MAINTENANCE_MODES.AUDIT)
const maintenanceBrief = ref('')
const maintenanceWorking = ref(false)
const maintenanceApplying = ref(false)
const maintenanceError = ref('')
const maintenanceSummary = ref('')
const maintenanceCandidates = ref([])
const maintenanceRevision = ref('')
const maintenanceTouchedEntryIds = ref(new Set())
const maintenanceCompleted = ref(false)
// W·卡片制：档案迁移（预览）——needsMigration 回填 / duplicates 只标记不删
const migrationOpen = ref(false)
const migrationScan = ref(null)
const migrationWorking = ref(false)
const migrationApplying = ref(false)
const migrationMessage = ref('')
const migrationError = ref('')
// W3·B2/B3：条目档案模板与关联编辑区——character 类型默认展开，其他类型可开。
const entryAdvancedOpen = ref(false)

const maintenanceModes = [
  {
    value: WORLDBOOK_MAINTENANCE_MODES.CREATE,
    label: '新增设定',
    description: '按自然语言提出新内容'
  },
  {
    value: WORLDBOOK_MAINTENANCE_MODES.AUDIT,
    label: '审查整理',
    description: '找重复、重叠和冲突'
  },
  {
    value: WORLDBOOK_MAINTENANCE_MODES.REFINE,
    label: '完善选中',
    description: '围绕已选条目改写'
  }
]

const editorTab = ref('overview')
// 总览浏览器点选条目 → 跳条目管理并定位（B1 组件只 emit，不路由）
function onBrowserSelect(entry) {
  if (entry?.id) pickEntry(entry.id)
  editorTab.value = 'entries'
}
// 图谱建边（Shift 拖拽）：GraphCanvas 只报 from/to 两个 id，属性收集交给 RelationEdgeDialog；
// 确认后先 pickEntry 对齐编辑条目，再走 EntryLinksEditor 的既有双层写回。
const entryLinksEditorRef = ref(null)
const edgeDialogOpen = ref(false)
const edgeDialogFrom = ref({ id: '', name: '' })
const edgeDialogTo = ref({ id: '', name: '' })
function onGraphCreateEdge({ fromId, toId }) {
  const nameOf = (id) => {
    const entry = entries.value.find((item) => String(item.id) === String(id))
    return entry?.name || entry?.title || String(id)
  }
  edgeDialogFrom.value = { id: fromId, name: nameOf(fromId) }
  edgeDialogTo.value = { id: toId, name: nameOf(toId) }
  edgeDialogOpen.value = true
}
function onEdgeDialogConfirm(attrs) {
  const fromId = edgeDialogFrom.value.id
  if (!fromId || !edgeDialogTo.value.id) return
  pickEntry(fromId)
  editorTab.value = 'entries'
  void nextTick(() => {
    entryLinksEditorRef.value?.createEdge({
      fromId,
      toId: edgeDialogTo.value.id,
      ...attrs
    })
  })
}
const editorTabs = [
  { key: 'overview', label: '总览', icon: 'layout' },
  { key: 'entries', label: '条目管理', icon: 'list' },
  { key: 'settlement', label: '章回结算', icon: 'history' },
  { key: 'base', label: '基础设定', icon: 'book' },
  { key: 'research', label: '联网调研', icon: 'compass' },
  { key: 'transfer', label: '导入导出', icon: 'download' },
  { key: 'groups', label: '分组管理', icon: 'archive' },
]

const selectedWorldbookId = ref('')
// 项目上下文（联动闭环 L3）：先解析正确的世界书，再处理 entryId 定位。
const { context, worldbook: activeWorldbook, loading: contextLoading, loadError, refresh: refreshProjectContext } = useSettingsProjectContext({ worldStore })
const isProjectMode = computed(() => context.value?.mode === 'project')
const projectContextLabel = computed(() => context.value?.book?.title || '')
const projectContextStatus = computed(() => context.value?.status || '')
const contextNotice = computed(() => (context.value?.status === 'route-mismatch' ? context.value.notice : ''))
// query 指向的条目在正确库里仍不存在：明确提示，不静默选中第一条冒充目标。
const requestedEntryMissing = ref(false)

const maintenanceCandidateCount = computed(() => findWorldbookAuditTargets(entries.value, {
  brief: maintenanceBrief.value
}).length)
const maintenanceStale = computed(() => Boolean(maintenanceRevision.value)
  && String(activeWorldbook.value?.updatedAt || '') !== maintenanceRevision.value)
const maintenancePlaceholder = computed(() => {
  if (maintenanceMode.value === WORLDBOOK_MAINTENANCE_MODES.AUDIT) {
    return '可选：补充审查重点，例如“重点检查角色关系和历史年代是否冲突”。'
  }
  if (maintenanceMode.value === WORLDBOOK_MAINTENANCE_MODES.REFINE) {
    return '例如：保留已有时间线，补充这个势力与北境盐路的利益关系，不要创造新年代。'
  }
  return '例如：增加一个控制北境盐路的商会，和霜港存在利益冲突，但不要改变已有历史。'
})
const maintenanceActionLabel = computed(() => {
  if (maintenanceMode.value === WORLDBOOK_MAINTENANCE_MODES.AUDIT) return '开始审查'
  if (maintenanceMode.value === WORLDBOOK_MAINTENANCE_MODES.REFINE) return '生成修改建议'
  return '生成新增候选'
})
const maintenanceCanRun = computed(() => {
  if (maintenanceWorking.value) return false
  if (maintenanceMode.value === WORLDBOOK_MAINTENANCE_MODES.REFINE) {
    return selectedEntryIds.value.length > 0 && Boolean(maintenanceBrief.value.trim())
  }
  if (maintenanceMode.value === WORLDBOOK_MAINTENANCE_MODES.AUDIT) return maintenanceCandidateCount.value > 0
  return Boolean(maintenanceBrief.value.trim())
})

const worldbookForm = reactive({
  name: '',
  author: '',
  worldDescription: '',
  writingStyle: '',
  examples: '',
  forbidden: '',
  description: ''
})

const entryForm = reactive({
  name: '',
  type: 'general',
  keys: '',
  keysSecondary: '',
  content: '',
  injectionMode: 'selective',
  injectionProbability: 100,
  injectionCooldown: 0,
  injectionDepth: 1,
  excludeRecursion: false,
  injectionGroup: '',
  injectionSecondaryMode: 'any',
  injectionWholeWord: false,
  injectionCaseSensitive: false
})

const savedWorldbookForm = ref('')
const savedEntryForm = ref('')
onBeforeRouteUpdate((to, from) => {
  if (String(to.query.bookId || '') === String(from.query.bookId || '')) return true
  if (savingWorldbook.value || savingEntry.value || importing.value || groupWorking.value || maintenanceWorking.value || maintenanceApplying.value) return false
  const dirty = (savedWorldbookForm.value && JSON.stringify(worldbookForm) !== savedWorldbookForm.value)
    || (selectedEntry.value && savedEntryForm.value && JSON.stringify(entryForm) !== savedEntryForm.value)
  return !dirty || window.confirm(tr('有尚未保存的设定修改，切换作品会丢弃这些修改。仍要切换吗？'))
})

const entryTypes = [
  { value: 'general', label: '通用' },
  { value: 'rule', label: '规则' },
  { value: 'style', label: '风格' },
  { value: 'forbidden', label: '禁忌' },
  { value: 'location', label: '地点' },
  { value: 'character', label: '角色' },
  { value: 'organization', label: '组织' },
  { value: 'item', label: '物品' },
  { value: 'lore', label: '设定' },
  { value: 'quest', label: '任务' },
  { value: 'event', label: '事件' }
]

// kind 开放自由输入：已知 11 类 + source（W4 资料条目）只作 datalist 建议；
// 未知 kind 原样保存，注入端（worldbookContextBuilder）对未知 type 落 general 优先级兜底。
const entryTypeSuggestions = [...entryTypes.map((type) => type.value), 'source']

const injectionModes = [
  { value: 'selective', label: '选择触发' },
  { value: 'constant', label: '常量注入' }
]

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const entries = computed(() => activeWorldbook.value?.entries || [])

const availableGroups = computed(() => {
  const pool = new Set()
  for (const group of activeWorldbook.value?.groups || []) {
    const normalized = normalizeGroupName(group)
    if (normalized) pool.add(normalized)
  }
  for (const entry of entries.value) {
    const normalized = normalizeGroupName(entry?.injection?.group)
    if (normalized) pool.add(normalized)
  }
  return Array.from(pool)
})

const groupStats = computed(() => {
  const counter = new Map()

  for (const group of activeWorldbook.value?.groups || []) {
    const normalized = normalizeGroupName(group)
    if (!normalized || counter.has(normalized)) continue
    counter.set(normalized, 0)
  }

  for (const entry of entries.value) {
    const group = normalizeGroupName(entry?.injection?.group)
    if (!group) continue
    counter.set(group, (counter.get(group) || 0) + 1)
  }

  return Array.from(counter.entries())
    .map(([name, entryCount]) => ({ name, entryCount }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredEntries = computed(() => {
  const keyword = entrySearch.value.toLowerCase()
  return entries.value.filter((entry) => {
    const matchType = entryTypeFilter.value === 'all' || entry.type === entryTypeFilter.value
    const modeValue = normalizeInjection(entry?.injection).mode
    const matchMode = injectionModeFilter.value === 'all' || modeValue === injectionModeFilter.value
    const groupValue = String(entry?.injection?.group || '').trim()
    const matchGroup = entryGroupFilter.value === 'all'
      || (entryGroupFilter.value === '__none' ? !groupValue : groupValue === entryGroupFilter.value)
    const matchKeyword = !keyword || [
      entry.name,
      entry.content,
      ...(entry.keys || []),
      ...(entry.keysSecondary || [])
    ]
      .map(v => String(v || '').toLowerCase())
      .some(v => v.includes(keyword))

    return matchType && matchMode && matchGroup && matchKeyword
  })
})

const selectedEntry = computed(() => {
  return entries.value.find(e => e.id === selectedEntryId.value) || null
})

watch(activeWorldbook, (next, previous) => {
  selectedWorldbookId.value = next?.id || ''
  const sameWorldbook = next?.id && next.id === previous?.id
  const formDirty = savedWorldbookForm.value && JSON.stringify(worldbookForm) !== savedWorldbookForm.value
  if (!sameWorldbook || !formDirty || savingWorldbook.value) syncWorldbookForm(next)
  if (sameWorldbook) return
  selectFirstEntry()
  selectedEntryIds.value = []
  groupDraftName.value = ''
  groupRenameTarget.value = ''
  groupMoveTarget.value = ''
  clearGroupMessages()
}, { immediate: true })

watch(selectedEntry, (entry, previous) => {
  const sameEntry = entry?.id && entry.id === previous?.id
  const formDirty = savedEntryForm.value && JSON.stringify(entryForm) !== savedEntryForm.value
  if (entry && (!sameEntry || !formDirty || savingEntry.value)) syncEntryForm(entry)
  else if (entry) return
  else resetEntryForm()
}, { immediate: true })

// W3：档案模板/关联区默认展开策略——选中 character 时展开，其余类型收起（可手动开）。
watch(() => [selectedEntry.value?.id, selectedEntry.value?.type], ([, type]) => {
  entryAdvancedOpen.value = type === 'character'
})

watch(entries, (nextEntries) => {
  const idSet = new Set(nextEntries.map(entry => entry.id))
  selectedEntryIds.value = selectedEntryIds.value.filter(id => idSet.has(id))
  if (selectedEntryId.value && !idSet.has(selectedEntryId.value)) {
    selectFirstEntry()
  }
}, { deep: true })

watch(availableGroups, (groups) => {
  if (entryGroupFilter.value === 'all' || entryGroupFilter.value === '__none') return
  if (!groups.includes(entryGroupFilter.value)) {
    entryGroupFilter.value = 'all'
  }
})

watch(groupStats, (stats) => {
  const names = stats.map(item => item.name)

  if (!names.length) {
    groupRenameSource.value = ''
    groupMoveSource.value = ''
    groupDeleteSource.value = ''
    return
  }

  if (!names.includes(groupRenameSource.value)) {
    groupRenameSource.value = names[0]
  }

  if (!names.includes(groupMoveSource.value)) {
    groupMoveSource.value = names[0]
  }

  if (!names.includes(groupDeleteSource.value)) {
    groupDeleteSource.value = names[0]
  }

  if (!normalizeGroupName(groupMoveTarget.value)) {
    groupMoveTarget.value = names.find(name => name !== groupMoveSource.value) || ''
  }
}, { immediate: true })

watch(
  () => [String(route.query.entryId || ''), entries.value.map((entry) => entry.id).join('|'), contextLoading.value],
  async ([entryId]) => {
    if (!entryId || contextLoading.value) return
    if (!entries.value.some((entry) => entry.id === entryId)) {
      // 在正确库里也找不到：明确「已不存在」，保留目录与回程，不冒充目标。
      requestedEntryMissing.value = true
      return
    }
    requestedEntryMissing.value = false
    editorTab.value = 'entries'
    entrySearch.value = ''
    entryTypeFilter.value = 'all'
    injectionModeFilter.value = 'all'
    entryGroupFilter.value = 'all'
    selectedEntryId.value = entryId
    await nextTick()
    const target = Array.from(document.querySelectorAll('[data-entry-id]'))
      .find((element) => element.dataset.entryId === entryId)
    target?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  },
  { immediate: true }
)

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, parsed))
}

function toStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item || '').trim())
      .filter(Boolean)
  }
  const normalized = String(value || '').trim()
  return normalized ? [normalized] : []
}

function detectEntryType(keys, content, name = '') {
  if (typeof worldStore.guessEntryType === 'function') {
    return worldStore.guessEntryType(keys, content, name)
  }
  return 'general'
}

function inferPreviewInjectionMode(rawEntry, type) {
  const modeText = String(rawEntry?.mode || '').trim().toLowerCase()
  if (rawEntry?.constant === true || modeText === 'constant') return 'constant'
  if (['rule', 'style', 'forbidden'].includes(type)) return 'constant'
  return 'selective'
}

function normalizePreview(rawData, fileName) {
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    throw new Error('JSON 结构无效：需要对象根节点')
  }

  const rawEntries = rawData.entries || rawData.entry || {}
  const entryPairs = Array.isArray(rawEntries)
    ? rawEntries.map((entry, idx) => [String(idx), entry])
    : (rawEntries && typeof rawEntries === 'object' ? Object.entries(rawEntries) : [])

  if (!entryPairs.length) {
    throw new Error('未检测到可导入的 entries 数据')
  }

  const previewEntries = entryPairs.map(([uid, entry]) => {
    const keys = toStringArray(entry?.key)
    const keysSecondary = toStringArray(entry?.keysecondary)
    const type = detectEntryType(keys, String(entry?.content || ''), String(entry?.comment || uid || ''))
    const mode = inferPreviewInjectionMode(entry, type)
    const group = String(entry?.group || '').trim() || null

    return {
      uid,
      name: String(entry?.comment || keys[0] || uid || tr('未命名条目')),
      type,
      mode,
      group,
      keyCount: keys.length + keysSecondary.length
    }
  })

  const typeCounter = new Map()
  const groupSet = new Set()

  for (const entry of previewEntries) {
    typeCounter.set(entry.type, (typeCounter.get(entry.type) || 0) + 1)
    if (entry.group) groupSet.add(entry.group)
  }

  for (const group of Array.isArray(rawData.groups) ? rawData.groups : []) {
    const normalized = String(group || '').trim()
    if (normalized) groupSet.add(normalized)
  }

  const typeStats = Array.from(typeCounter.entries())
    .map(([type, count]) => ({
      type,
      label: entryTypeLabel(type),
      count
    }))
    .sort((a, b) => b.count - a.count)

  return {
    fileName,
    name: String(rawData.name || rawData.world_name || tr('导入世界书')),
    author: String(rawData.creator || rawData.author || ''),
    entryCount: previewEntries.length,
    groupCount: groupSet.size,
    typeStats,
    previewEntries: previewEntries.slice(0, 10),
    rawData
  }
}

function normalizeInjection(injection = {}) {
  const mode = injection?.mode === 'constant' ? 'constant' : 'selective'
  return {
    mode,
    probability: clampNumber(injection?.probability, 100, 0, 100),
    cooldown: clampNumber(injection?.cooldown, 0, 0, 99999),
    depth: clampNumber(injection?.depth, 1, 1, 99),
    excludeRecursion: Boolean(injection?.excludeRecursion),
    group: String(injection?.group || '').trim() || null,
    // R3：激活语义字段（builder 已支持，编辑 UI 补全）
    secondaryMode: injection?.secondaryMode === 'all' ? 'all' : 'any',
    wholeWord: Boolean(injection?.wholeWord),
    caseSensitive: Boolean(injection?.caseSensitive)
  }
}

function splitKeywords(input) {
  return String(input || '')
    .split(/[\n,，]/)
    .map(v => v.trim())
    .filter(Boolean)
}

function normalizeGroupName(value) {
  return String(value || '').trim()
}

function uniqueGroups(groups = []) {
  const result = []
  const seen = new Set()

  for (const group of groups) {
    const normalized = normalizeGroupName(group)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function clearGroupMessages() {
  groupError.value = ''
  groupSuccess.value = ''
}

function displayStatus(status) {
  return typeof status === 'string' ? tr(status) : tr(status.message, status.values)
}

function setGroupError(message, values = {}) {
  groupError.value = { message, values }
  groupSuccess.value = ''
}

function setGroupSuccess(message, values = {}) {
  groupSuccess.value = { message, values }
  groupError.value = ''
}

function setTransferError(message, values = {}) {
  importError.value = { message, values }
  transferMessage.value = ''
}

function setTransferSuccess(message, values = {}) {
  transferMessage.value = { message, values }
  importError.value = ''
}

function getCurrentWorldbookGroups() {
  return uniqueGroups(activeWorldbook.value?.groups || [])
}

function getEntryIdsByGroup(groupName) {
  const normalizedGroup = normalizeGroupName(groupName)
  if (!normalizedGroup) return []

  return entries.value
    .filter(entry => normalizeGroupName(entry?.injection?.group) === normalizedGroup)
    .map(entry => entry.id)
}

function entryTypeLabel(typeValue) {
  const matched = entryTypes.find(t => t.value === typeValue)
  return tr(matched?.label || typeValue || '通用')
}

function entryModeLabel(modeValue) {
  const mode = normalizeInjection({ mode: modeValue }).mode
  const matched = injectionModes.find(item => item.value === mode)
  return tr(matched?.label || '选择触发')
}

function syncWorldbookForm(worldbook) {
  worldbookForm.name = worldbook?.name || ''
  worldbookForm.author = worldbook?.author || ''
  worldbookForm.worldDescription = worldbook?.worldDescription || worldbook?.description || ''
  worldbookForm.writingStyle = worldbook?.writingStyle || ''
  worldbookForm.examples = worldbook?.examples || ''
  worldbookForm.forbidden = worldbook?.forbidden || ''
  worldbookForm.description = worldbook?.description || ''
  savedWorldbookForm.value = JSON.stringify(worldbookForm)
}

function syncEntryForm(entry) {
  const injection = normalizeInjection(entry?.injection)
  entryForm.name = entry?.name || ''
  entryForm.type = entry?.type || 'general'
  entryForm.keys = (entry?.keys || []).join(', ')
  entryForm.keysSecondary = (entry?.keysSecondary || []).join(', ')
  entryForm.content = entry?.content || ''
  entryForm.injectionMode = injection.mode
  entryForm.injectionProbability = injection.probability
  entryForm.injectionCooldown = injection.cooldown
  entryForm.injectionDepth = injection.depth
  entryForm.excludeRecursion = injection.excludeRecursion
  entryForm.injectionGroup = injection.group || ''
  // R3：激活语义字段回填
  entryForm.injectionSecondaryMode = injection.secondaryMode || 'any'
  entryForm.injectionWholeWord = Boolean(injection.wholeWord)
  entryForm.injectionCaseSensitive = Boolean(injection.caseSensitive)
  savedEntryForm.value = JSON.stringify(entryForm)
}

function resetEntryForm() {
  entryForm.name = ''
  entryForm.type = 'general'
  entryForm.keys = ''
  entryForm.keysSecondary = ''
  entryForm.content = ''
  entryForm.injectionMode = 'selective'
  entryForm.injectionProbability = 100
  entryForm.injectionCooldown = 0
  entryForm.injectionDepth = 1
  entryForm.excludeRecursion = false
  entryForm.injectionGroup = ''
}

function selectFirstEntry() {
  const first = entries.value[0]
  selectedEntryId.value = first?.id || ''
}

function toggleMaintenance() {
  maintenanceOpen.value = !maintenanceOpen.value
  if (!maintenanceOpen.value) return
  maintenanceError.value = ''
  maintenanceCompleted.value = false
}



function maintenanceActionLabelFor(action) {
  return {
    create: '新增候选',
    update: '改写建议',
    merge: '合并建议',
    retag: '整理标签',
    conflict: '潜在冲突',
    ignore: '建议保留'
  }[action] || '审查结果'
}

function prepareMaintenanceCandidate(candidate) {
  if (!candidate?.proposedEntry) return candidate
  return {
    ...candidate,
    editing: false,
    editor: {
      ...candidate.proposedEntry,
      keysText: candidate.proposedEntry.keys.join(', '),
      keysSecondaryText: candidate.proposedEntry.keysSecondary.join(', ')
    }
  }
}

function toggleMaintenanceCandidateEdit(candidate) {
  if (!candidate?.editor) return
  candidate.editing = !candidate.editing
}

function getMaintenanceCandidateProposal(candidate) {
  if (!candidate?.editor) return candidate?.proposedEntry || null
  return {
    name: String(candidate.editor.name || '').trim(),
    type: candidate.editor.type,
    keys: splitKeywords(candidate.editor.keysText),
    keysSecondary: splitKeywords(candidate.editor.keysSecondaryText),
    content: String(candidate.editor.content || '').trim(),
    group: String(candidate.editor.group || '').trim(),
    mode: candidate.editor.mode
  }
}

function entryName(entryId) {
  return entries.value.find((entry) => entry.id === entryId)?.name || entryId
}

async function runMaintenance() {
  if (!activeWorldbook.value?.id || !maintenanceCanRun.value) return
  maintenanceWorking.value = true
  maintenanceError.value = ''
  maintenanceSummary.value = ''
  maintenanceCandidates.value = []
  maintenanceTouchedEntryIds.value = new Set()
  maintenanceCompleted.value = false
  const sourceWorldbook = activeWorldbook.value
  try {
    const dispatched = await settingsDispatcher.dispatch('settings.maintenance.audit', {
      project: { id: sourceWorldbook.id, revision: String(sourceWorldbook.updatedAt || '') },
      target: { type: 'worldbook', id: sourceWorldbook.id, revision: String(sourceWorldbook.updatedAt || '') },
      intent: {
        worldbook: sourceWorldbook,
        mode: maintenanceMode.value,
        brief: maintenanceBrief.value,
        selectedEntryIds: selectedEntryIds.value
      }
    })
    if (dispatched.status !== 'completed') {
      maintenanceError.value = dispatched.error?.message || dispatched.error?.code || '世界书处理失败。'
      return
    }
    const auditResult = dispatched.suggestions?.[0] || {}
    maintenanceRevision.value = String(auditResult.sourceRevision || sourceWorldbook.updatedAt || '')
    maintenanceSummary.value = auditResult.summary || ''
    maintenanceCandidates.value = (auditResult.candidates || []).map(prepareMaintenanceCandidate)
    maintenanceCompleted.value = true
  } catch (error) {
    maintenanceError.value = error?.message || '世界书处理失败。'
  } finally {
    maintenanceWorking.value = false
  }
}

function maintenanceRevisionIsCurrent() {
  const currentRevision = String(activeWorldbook.value?.updatedAt || '')
  return Boolean(maintenanceRevision.value) && currentRevision === maintenanceRevision.value
}

function maintenanceCandidateTouchesAppliedEntry(candidate) {
  return (candidate?.entryIds || []).some((entryId) => maintenanceTouchedEntryIds.value.has(entryId))
}

function proposedEntryPayload(proposedEntry, existing = null) {
  const injection = existing?.injection || {}
  return {
    name: proposedEntry.name,
    type: proposedEntry.type,
    keys: proposedEntry.keys,
    keysSecondary: proposedEntry.keysSecondary,
    content: proposedEntry.content,
    injection: {
      ...injection,
      mode: proposedEntry.mode,
      group: proposedEntry.group || injection.group || null
    }
  }
}

async function applyMaintenanceCandidate(candidate) {
  if (!activeWorldbook.value?.id || !candidate || candidate.status !== 'pending') return
  if (candidate.action === 'ignore' || candidate.action === 'conflict') {
    candidate.status = 'applied'
    return
  }
  if (!maintenanceRevisionIsCurrent()) {
    maintenanceError.value = '世界书已经发生变化，这批建议已过期，请重新审查。'
    return
  }
  if (maintenanceCandidateTouchesAppliedEntry(candidate)) {
    maintenanceError.value = '这条建议涉及本批次中已经修改过的条目，请重新审查后再采纳，避免旧建议覆盖刚保存的内容。'
    return
  }

  maintenanceApplying.value = true
  maintenanceError.value = ''
  try {
    const proposal = getMaintenanceCandidateProposal(candidate)
    if (!proposal) throw new Error('建议内容为空，请先编辑或重新生成。')

    if (candidate.action === 'create') {
      await worldStore.addEntry(activeWorldbook.value.id, {
        ...proposal,
        injection: {
          mode: proposal.mode,
          probability: proposal.mode === 'constant' ? 100 : 100,
          cooldown: 0,
          depth: proposal.mode === 'constant' ? 2 : 1,
          excludeRecursion: false,
          group: proposal.group || null
        },
        metadata: { importSource: 'worldbook-maintenance', basis: 'creative' }
      })
    } else {
      const targetIds = candidate.entryIds.filter((id) => entries.value.some((entry) => entry.id === id))
      const primaryId = targetIds[0]
      const primary = entries.value.find((entry) => entry.id === primaryId)
      if (!primary) throw new Error('建议对应的条目已经不存在。')
      await worldStore.updateEntry(activeWorldbook.value.id, primaryId, proposedEntryPayload(proposal, primary))
      if (candidate.action === 'merge') {
        for (const entryId of targetIds.slice(1)) {
          await worldStore.deleteEntry(activeWorldbook.value.id, entryId)
        }
      }
    }
    await worldStore.loadWorldbooksIndex()
    maintenanceTouchedEntryIds.value = new Set([
      ...maintenanceTouchedEntryIds.value,
      ...(candidate.entryIds || [])
    ])
    maintenanceRevision.value = String(activeWorldbook.value?.updatedAt || maintenanceRevision.value)
    candidate.status = 'applied'
  } catch (error) {
    maintenanceError.value = error?.message || '采纳世界书建议失败。'
  } finally {
    maintenanceApplying.value = false
  }
}

function ignoreMaintenanceCandidate(candidate) {
  if (!candidate || candidate.status !== 'pending') return
  candidate.status = 'ignored'
}

let worldbookChangeSequence = 0
async function onWorldbookChange(worldbookId) {
  // 项目模式：世界书由书稿关联决定，不在这里静默换库。
  if (isProjectMode.value) return
  const ticket = ++worldbookChangeSequence
  const from = route.fullPath
  const loaded = await worldStore.setActiveWorldbook(worldbookId)
  if (ticket !== worldbookChangeSequence || route.fullPath !== from || route.query.bookId || String(loaded?.id || '') !== String(worldbookId)) return
  await router.replace({ name: route.name, query: { worldbookId: String(worldbookId) } })
}

async function createWorldbook() {
  const nextName = tr('世界书 {number}', { number: worldbooksIndex.value.length + 1 })
  const created = await worldStore.createWorldbook({ name: nextName })
  await worldStore.loadWorldbooksIndex()
  if (created?.id) {
    await onWorldbookChange(created.id)
  }
}

async function saveWorldbook() {
  if (!activeWorldbook.value?.id || !worldbookForm.name.trim()) return
  savingWorldbook.value = true
  try {
    await worldStore.updateWorldbook(activeWorldbook.value.id, {
      name: worldbookForm.name.trim(),
      author: worldbookForm.author.trim(),
      worldDescription: worldbookForm.worldDescription.trim(),
      writingStyle: worldbookForm.writingStyle.trim(),
      examples: worldbookForm.examples.trim(),
      forbidden: worldbookForm.forbidden.trim(),
      description: worldbookForm.worldDescription.trim() // 兼容旧字段
    })
    await worldStore.loadWorldbooksIndex()
  } finally {
    savingWorldbook.value = false
  }
}

async function deleteWorldbook() {
  if (!activeWorldbook.value?.id) return
  const ok = window.confirm(tr('确认删除世界书「{name}」？', { name: activeWorldbook.value.name || tr('未命名') }))
  if (!ok) return

  await worldStore.deleteWorldbook(activeWorldbook.value.id)
  await worldStore.loadWorldbooksIndex()
  if (isProjectMode.value || route.query.worldbookId) {
    await refreshProjectContext()
  } else if (typeof worldStore.ensureActiveWorldbook === 'function') {
    await worldStore.ensureActiveWorldbook()
  }
}

async function createEntry() {
  if (!activeWorldbook.value?.id) return
  const initialGroup = entryGroupFilter.value !== 'all' && entryGroupFilter.value !== '__none'
    ? entryGroupFilter.value
    : null
  const created = await worldStore.addEntry(activeWorldbook.value.id, {
    name: tr('新条目'),
    type: 'general',
    keys: [],
    keysSecondary: [],
    content: '',
    injection: {
      mode: 'selective',
      probability: 100,
      cooldown: 0,
      depth: 1,
      excludeRecursion: false,
      group: initialGroup
    }
  })
  await worldStore.loadWorldbooksIndex()
  if (initialGroup) {
    await persistWorldbookGroups([initialGroup])
  }
  if (created?.id) selectedEntryId.value = created.id
}

// 声口双轨合并（写侧）：character 保存时把「stored profile.speech > 正文【标签】反解 >
// 顶层旧 speechStyle/samples」的合并结果物化进 profile；顶层镜像与 profile.speech 同源
// 写出、不产生第二真相，仅供存量消费端（narrativeKernel 声口注入、ST 导出 pinax_voice）读。
function characterVoicePayload(speech, name) {
  const source = speech && typeof speech === 'object' ? speech : {}
  return normalizeNarrativeVoiceProfile({
    speechStyle: source.speechStyle || '',
    samples: Array.isArray(source.samples) ? source.samples : []
  }, name)
}

async function saveEntry() {
  if (!activeWorldbook.value?.id || !selectedEntry.value) return
  savingEntry.value = true
  try {
    const normalizedInjection = normalizeInjection({
      mode: entryForm.injectionMode,
      probability: entryForm.injectionProbability,
      cooldown: entryForm.injectionCooldown,
      depth: entryForm.injectionDepth,
      excludeRecursion: entryForm.excludeRecursion,
      group: entryForm.injectionGroup,
      secondaryMode: entryForm.injectionSecondaryMode,
      wholeWord: entryForm.injectionWholeWord,
      caseSensitive: entryForm.injectionCaseSensitive
    })
    const nextName = entryForm.name.trim() || tr('未命名条目')
    // kind 自由输入：未知类型原样保存；空值回落 general
    const nextType = String(entryForm.type || '').trim() || 'general'
    const updates = {
      name: nextName,
      type: nextType,
      keys: splitKeywords(entryForm.keys),
      keysSecondary: splitKeywords(entryForm.keysSecondary),
      content: entryForm.content.trim(),
      injection: normalizedInjection
    }
    if (nextType === 'character') {
      const merged = profileFromEntry(
        { ...selectedEntry.value, name: nextName, content: updates.content },
        selectedEntry.value?.profile?.template || ''
      )
      updates.profile = merged
      Object.assign(updates, characterVoicePayload(merged.speech, nextName))
    }
    await worldStore.updateEntry(activeWorldbook.value.id, selectedEntry.value.id, updates)
    await worldStore.loadWorldbooksIndex()
    if (normalizedInjection.group) {
      await persistWorldbookGroups([normalizedInjection.group])
    }
  } finally {
    savingEntry.value = false
  }
}

async function deleteEntry() {
  if (!activeWorldbook.value?.id || !selectedEntry.value?.id) return
  const ok = window.confirm(tr('确认删除条目「{name}」？', { name: selectedEntry.value.name || tr('未命名条目') }))
  if (!ok) return

  await worldStore.deleteEntry(activeWorldbook.value.id, selectedEntry.value.id)
  await worldStore.loadWorldbooksIndex()
  selectFirstEntry()
}

// W3·B2：档案模板保存——profile 落条目；仅在作者显式选「覆盖原文」时才以投影替换
// content（content 是注入真相，禁默认覆盖）。character 同时把 profile.speech 镜像到
// 顶层声口字段（同源写出，存量消费端 narrativeKernel/ST 导出继续有供数）。
async function applyProfileSave({ profile, content, overwrite }) {
  if (!activeWorldbook.value?.id || !selectedEntry.value) return
  savingEntry.value = true
  try {
    const isCharacter = String(selectedEntry.value?.type || '').trim().toLowerCase() === 'character'
    await worldStore.updateEntry(activeWorldbook.value.id, selectedEntry.value.id, {
      profile,
      ...(isCharacter ? characterVoicePayload(profile?.speech, selectedEntry.value.name) : {}),
      ...(overwrite ? { content } : {})
    })
    await worldStore.loadWorldbooksIndex()
    if (selectedEntry.value) syncEntryForm(selectedEntry.value)
  } finally {
    savingEntry.value = false
  }
}

// W3·B3：关系双层保存——links=纯 id 层、relations=富关系层由 entryRelations.
// applyRelationRows 同一实现派生，两层必然一致；tags 承接旧 relations.tags 桶。
async function applyLinksSave({ links, relations, tags }) {
  if (!activeWorldbook.value?.id || !selectedEntry.value) return
  savingEntry.value = true
  try {
    await worldStore.updateEntry(activeWorldbook.value.id, selectedEntry.value.id, {
      links,
      relations,
      ...(Array.isArray(tags) ? { tags } : {})
    })
    await worldStore.loadWorldbooksIndex()
  } finally {
    savingEntry.value = false
  }
}

function onAdvancedToggle(event) {
  entryAdvancedOpen.value = Boolean(event.target?.open)
}

function pickEntry(entryId) {
  selectedEntryId.value = entryId
}

function isEntrySelected(entryId) {
  return selectedEntryIds.value.includes(entryId)
}

function toggleEntrySelection(entryId, checked) {
  const selected = new Set(selectedEntryIds.value)
  if (checked) selected.add(entryId)
  else selected.delete(entryId)
  selectedEntryIds.value = Array.from(selected)
}

function selectAllFilteredEntries() {
  const selected = new Set(selectedEntryIds.value)
  for (const entry of filteredEntries.value) {
    selected.add(entry.id)
  }
  selectedEntryIds.value = Array.from(selected)
}

function invertFilteredSelection() {
  const selected = new Set(selectedEntryIds.value)
  for (const entry of filteredEntries.value) {
    if (selected.has(entry.id)) selected.delete(entry.id)
    else selected.add(entry.id)
  }
  selectedEntryIds.value = Array.from(selected)
}

function clearEntrySelection() {
  selectedEntryIds.value = []
}

async function updateEntriesByIds(entryIds, updater) {
  if (!activeWorldbook.value?.id || !entryIds.length) return

  for (const entryId of entryIds) {
    const entry = entries.value.find(item => item.id === entryId)
    if (!entry) continue
    const payload = updater(entry)
    if (!payload) continue
    await worldStore.updateEntry(activeWorldbook.value.id, entryId, payload)
  }

  await worldStore.loadWorldbooksIndex()
  await worldStore.setActiveWorldbook(activeWorldbook.value.id)
}

async function applyBulkMode() {
  if (!selectedEntryIds.value.length) return
  savingEntry.value = true
  try {
    await updateEntriesByIds(selectedEntryIds.value, (entry) => {
      return {
        injection: {
          ...normalizeInjection(entry.injection),
          mode: bulkModeTarget.value
        }
      }
    })
  } finally {
    savingEntry.value = false
  }
}

async function applyBulkGroup() {
  if (!selectedEntryIds.value.length) return
  savingEntry.value = true
  try {
    const groupValue = bulkGroupValue.value.trim()
    await updateEntriesByIds(selectedEntryIds.value, (entry) => {
      return {
        injection: {
          ...normalizeInjection(entry.injection),
          group: groupValue || null
        }
      }
    })
    if (groupValue) {
      await persistWorldbookGroups([groupValue])
    }
  } finally {
    savingEntry.value = false
  }
}

async function bulkDeleteEntries() {
  if (!activeWorldbook.value?.id || !selectedEntryIds.value.length) return
  const ok = window.confirm(tr('确认批量删除 {count} 条条目？', { count: selectedEntryIds.value.length }))
  if (!ok) return

  savingEntry.value = true
  try {
    const toDelete = [...selectedEntryIds.value]
    for (const entryId of toDelete) {
      await worldStore.deleteEntry(activeWorldbook.value.id, entryId)
    }
    await worldStore.loadWorldbooksIndex()
    await worldStore.setActiveWorldbook(activeWorldbook.value.id)
    selectedEntryIds.value = []
    selectFirstEntry()
  } finally {
    savingEntry.value = false
  }
}

async function persistWorldbookGroups(extraGroups = []) {
  const currentGroups = getCurrentWorldbookGroups()
  const nextGroups = uniqueGroups([...currentGroups, ...extraGroups])
  await replaceWorldbookGroups(nextGroups)
}

async function replaceWorldbookGroups(nextGroups = []) {
  if (!activeWorldbook.value?.id) return

  const currentGroups = getCurrentWorldbookGroups()
  const resolvedGroups = uniqueGroups(nextGroups)
  const unchanged = resolvedGroups.length === currentGroups.length
    && resolvedGroups.every(group => currentGroups.includes(group))

  if (unchanged) return

  await worldStore.updateWorldbook(activeWorldbook.value.id, {
    groups: resolvedGroups
  })
  await worldStore.loadWorldbooksIndex()
}

async function createGroup() {
  const nextGroup = normalizeGroupName(groupDraftName.value)
  if (!nextGroup) {
    setGroupError('请输入分组名称。')
    return
  }

  const exists = groupStats.value.some(group => group.name === nextGroup)
  if (exists) {
    setGroupError('分组「{name}」已存在。', { name: nextGroup })
    return
  }

  groupWorking.value = true
  clearGroupMessages()

  try {
    await persistWorldbookGroups([nextGroup])
    groupDraftName.value = ''
    groupRenameSource.value = nextGroup
    groupMoveSource.value = nextGroup
    groupDeleteSource.value = nextGroup
    setGroupSuccess('已创建分组「{name}」。', { name: nextGroup })
  } catch (error) {
    setGroupError('创建分组失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    groupWorking.value = false
  }
}

async function renameGroup() {
  const source = normalizeGroupName(groupRenameSource.value)
  const target = normalizeGroupName(groupRenameTarget.value)

  if (!source) {
    setGroupError('请选择要重命名的分组。')
    return
  }

  if (!target) {
    setGroupError('请输入新的分组名称。')
    return
  }

  if (source === target) {
    setGroupError('新分组名称不能与原名称相同。')
    return
  }

  const targetExists = groupStats.value.some(group => group.name === target)
  const confirmText = targetExists
    ? tr('目标分组「{target}」已存在，重命名将合并条目，是否继续？', { target })
    : tr('确认将分组「{source}」重命名为「{target}」？', { source, target })

  if (!window.confirm(confirmText)) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    const sourceEntryIds = getEntryIdsByGroup(source)
    if (sourceEntryIds.length) {
      await updateEntriesByIds(sourceEntryIds, (entry) => {
        return {
          injection: {
            ...normalizeInjection(entry.injection),
            group: target
          }
        }
      })
    }

    const nextGroups = uniqueGroups([
      ...getCurrentWorldbookGroups().filter(group => group !== source),
      target
    ])
    await replaceWorldbookGroups(nextGroups)

    if (entryGroupFilter.value === source) {
      entryGroupFilter.value = target
    }
    groupRenameSource.value = target
    groupMoveSource.value = target
    groupDeleteSource.value = target
    groupRenameTarget.value = ''

    setGroupSuccess('已重命名分组「{source}」为「{target}」，同步更新 {count} 条条目。', { source, target, count: sourceEntryIds.length })
  } catch (error) {
    setGroupError('重命名分组失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    groupWorking.value = false
  }
}

async function migrateGroupEntries() {
  const source = normalizeGroupName(groupMoveSource.value)
  const target = normalizeGroupName(groupMoveTarget.value)

  if (!source) {
    setGroupError('请选择源分组。')
    return
  }

  if (!target) {
    setGroupError('请输入目标分组名称。')
    return
  }

  if (source === target) {
    setGroupError('目标分组不能与源分组相同。')
    return
  }

  const dropSource = groupDropSourceAfterMove.value
  const confirmText = dropSource
    ? tr('确认将「{source}」的条目迁移到「{target}」，并删除源分组？', { source, target })
    : tr('确认将「{source}」的条目迁移到「{target}」并保留源分组？', { source, target })
  if (!window.confirm(confirmText)) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    const sourceEntryIds = getEntryIdsByGroup(source)
    if (sourceEntryIds.length) {
      await updateEntriesByIds(sourceEntryIds, (entry) => {
        return {
          injection: {
            ...normalizeInjection(entry.injection),
            group: target
          }
        }
      })
    }

    const nextGroups = uniqueGroups([
      ...getCurrentWorldbookGroups().filter(group => !(dropSource && group === source)),
      target
    ])
    await replaceWorldbookGroups(nextGroups)

    if (entryGroupFilter.value === source && dropSource) {
      entryGroupFilter.value = target
    }
    groupMoveSource.value = target
    groupDeleteSource.value = dropSource ? target : groupDeleteSource.value

    setGroupSuccess(dropSource ? '已迁移 {count} 条条目到「{target}」，并删除了源分组。' : '已迁移 {count} 条条目到「{target}」。', { count: sourceEntryIds.length, target })
  } catch (error) {
    setGroupError('迁移分组失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    groupWorking.value = false
  }
}

async function deleteGroup() {
  const source = normalizeGroupName(groupDeleteSource.value)
  if (!source) {
    setGroupError('请选择要删除的分组。')
    return
  }

  const sourceEntryIds = getEntryIdsByGroup(source)
  const confirmText = sourceEntryIds.length
    ? tr('确认删除分组「{source}」？其中 {count} 条条目的分组将被清空。', { source, count: sourceEntryIds.length })
    : tr('确认删除空分组「{source}」？', { source })
  if (!window.confirm(confirmText)) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    if (sourceEntryIds.length) {
      await updateEntriesByIds(sourceEntryIds, (entry) => {
        return {
          injection: {
            ...normalizeInjection(entry.injection),
            group: null
          }
        }
      })
    }

    const nextGroups = getCurrentWorldbookGroups().filter(group => group !== source)
    await replaceWorldbookGroups(nextGroups)

    if (entryGroupFilter.value === source) {
      entryGroupFilter.value = 'all'
    }
    setGroupSuccess('已删除分组「{source}」，并清空 {count} 条条目的分组。', { source, count: sourceEntryIds.length })
  } catch (error) {
    setGroupError('删除分组失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    groupWorking.value = false
  }
}

async function pruneEmptyGroups() {
  const emptyGroups = groupStats.value
    .filter(group => group.entryCount === 0)
    .map(group => group.name)

  if (!emptyGroups.length) {
    setGroupSuccess('没有可清理的空分组。')
    return
  }

  const ok = window.confirm(tr('确认清理 {count} 个空分组？', { count: emptyGroups.length }))
  if (!ok) return

  groupWorking.value = true
  clearGroupMessages()

  try {
    const keepGroups = groupStats.value
      .filter(group => group.entryCount > 0)
      .map(group => group.name)
    await replaceWorldbookGroups(keepGroups)
    setGroupSuccess('已清理 {count} 个空分组。', { count: emptyGroups.length })
  } catch (error) {
    setGroupError('清理空分组失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    groupWorking.value = false
  }
}

function setEntryGroup(group) {
  entryForm.injectionGroup = group
}

/* ---------- 档案迁移（预览）：回填只写 profile；重复只标记，不自动删除 ---------- */

function toggleMigration() {
  migrationOpen.value = !migrationOpen.value
  if (migrationOpen.value) runMigrationScan()
}

function runMigrationScan() {
  migrationError.value = ''
  migrationMessage.value = ''
  migrationWorking.value = true
  try {
    migrationScan.value = scanEntriesForMigration(entries.value)
  } finally {
    migrationWorking.value = false
  }
}

function duplicateLabel(entryId) {
  const entry = entries.value.find((item) => item.id === entryId)
  if (!entry) return entryId
  const marked = entry.metadata?.duplicateOf ? tr('已标记') : ''
  return marked ? `${entry.name || tr('未命名条目')}（${marked}）` : (entry.name || tr('未命名条目'))
}

function duplicateGroupLabel(group) {
  const keep = tr('保留：{name}', { name: entryName(group.keepId) })
  const dupes = tr('重复：{names}', { names: group.duplicateIds.map((id) => duplicateLabel(id)).join(uiLocale === 'en' ? ', ' : '、') })
  return `${keep}；${dupes}`
}

// 逐条回填：profileFromEntry 负责【标签】反解 + 顶层旧声口合并；正文与触发词不动
async function applyMigrationBackfill() {
  if (!activeWorldbook.value?.id || !migrationScan.value?.needsMigration?.length) return
  const ok = window.confirm(tr('对 {count} 个条目执行档案回填？条目正文不会被修改。', { count: migrationScan.value.needsMigration.length }))
  if (!ok) return
  migrationApplying.value = true
  migrationError.value = ''
  try {
    let applied = 0
    for (const entry of migrationScan.value.needsMigration) {
      // 条目可能在确认后被删：逐条复核存在性
      const current = entries.value.find((item) => item.id === entry.id)
      if (!current) continue
      const parsedProfile = profileFromEntry(current, current?.profile?.template || '')
      await worldStore.updateEntry(activeWorldbook.value.id, current.id, { profile: applyMigration(current, parsedProfile).profile })
      applied += 1
    }
    await worldStore.loadWorldbooksIndex()
    runMigrationScan()
    migrationMessage.value = tr('已回填 {count} 个条目的档案。', { count: applied })
  } catch (error) {
    migrationError.value = error?.message || tr('档案回填失败。')
  } finally {
    migrationApplying.value = false
  }
}

// 重复条目只打 metadata.duplicateOf 标记（保留方=最早创建）；真删除由用户另行确认
async function markDuplicateEntries() {
  if (!activeWorldbook.value?.id || !migrationScan.value?.duplicates?.length) return
  migrationApplying.value = true
  migrationError.value = ''
  try {
    const marked = markDuplicates(entries.value)
    const markedById = new Map(marked.map((entry) => [entry.id, entry]))
    let count = 0
    for (const original of entries.value) {
      const next = markedById.get(original.id)
      if (!next || next === original) continue
      if (next.metadata.duplicateOf === original.metadata?.duplicateOf) continue
      await worldStore.updateEntry(activeWorldbook.value.id, original.id, { metadata: { duplicateOf: next.metadata.duplicateOf } })
      count += 1
    }
    await worldStore.loadWorldbooksIndex()
    runMigrationScan()
    migrationMessage.value = tr('已标记 {count} 个重复条目（未删除）。', { count })
  } catch (error) {
    migrationError.value = error?.message || tr('标记重复条目失败。')
  } finally {
    migrationApplying.value = false
  }
}

function openImportFilePicker() {
  importError.value = ''
  transferMessage.value = ''
  if (importFileInputRef.value) {
    importFileInputRef.value.value = ''
    importFileInputRef.value.click()
  }
}

async function handleImportFileChange(event) {
  const file = event?.target?.files?.[0]
  if (!file) return

  importError.value = ''
  transferMessage.value = ''
  importing.value = true

  try {
    const text = await file.text()
    const parsed = JSON.parse(text)
    importPreview.value = normalizePreview(parsed, file.name)
  } catch (error) {
    importPreview.value = null
    setTransferError('导入预览失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    importing.value = false
  }
}

function clearImportPreview() {
  importPreview.value = null
  importError.value = ''
}

async function confirmImportFromPreview() {
  if (!importPreview.value?.rawData) return

  importing.value = true
  importError.value = ''
  transferMessage.value = ''

  try {
    const created = await worldStore.importFromSillyTavern(importPreview.value.rawData)
    await worldStore.loadWorldbooksIndex()
    if (created?.id) {
      if (!isProjectMode.value) await onWorldbookChange(created.id)
    }
    importPreview.value = null
    setTransferSuccess('导入完成：{name}', { name: created?.name || tr('新建世界书') })
  } catch (error) {
    setTransferError('导入失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    importing.value = false
  }
}

function toSafeFilename(input) {
  const cleaned = String(input || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim()
  return cleaned || 'worldbook'
}

async function exportActiveWorldbook() {
  if (!activeWorldbook.value?.id) return

  exporting.value = true
  importError.value = ''
  transferMessage.value = ''

  try {
    const payload = await worldStore.exportToSillyTavern(activeWorldbook.value.id)
    const filename = `${toSafeFilename(activeWorldbook.value.name)}.json`
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
    setTransferSuccess('导出完成：{name}', { name: filename })
  } catch (error) {
    setTransferError('导出失败：{error}', { error: tr(error?.message || '未知错误') })
  } finally {
    exporting.value = false
  }
}

/* ---------- W5·B5：章回结算面板（草案→逐项确认→显式写入；只写世界书侧，零静默写） ---------- */

const settlementBusy = ref(false)
const settlementError = ref('')
const settlementMessage = ref('')
const fileChannelOnline = ref(false)
const settlementDraft = reactive({
  chapterTitle: '',
  sourceText: '',
  card: { summary: '', hook: '', newTermsText: '' },
  handoffText: '',
  characters: [],
  foreshadow: [],
  reveals: [],
  revealText: ''
})
const settlementHandoffMin = HANDOFF_MIN_ITEMS
const settlementHandoffMax = HANDOFF_MAX_ITEMS
const settlementForeshadowStatuses = FORESHADOW_STATUSES

// 结算写入通道：装配既有保存接缝（worldStore.addEntry/updateEntry）——A3 双写
// 自动把结算产物落盘到项目世界书目录，这里不碰文件通道内部。
const settlementChannel = createSettlementChannel({
  listEntries: () => entries.value,
  addEntry: (payload) => worldStore.addEntry(activeWorldbook.value.id, payload),
  updateEntry: (entryId, updates) => worldStore.updateEntry(activeWorldbook.value.id, entryId, updates)
})

const settlementCharacterOptions = computed(() => entries.value
  .filter((entry) => !isChapterLedgerEntry(entry) && !isForeshadowLedgerEntry(entry) && !isCovertCardEntry(entry))
  .map((entry) => ({ value: entry.id, label: `${entry.name || tr('未命名条目')}（${entryTypeLabel(entry.type)}）` })))

const chapterLedgerText = computed(() => entries.value.find(isChapterLedgerEntry)?.content || chapterLedgerSkeleton())
const foreshadowLedgerText = computed(() => entries.value.find(isForeshadowLedgerEntry)?.content || foreshadowLedgerSkeleton())
const covertEntries = computed(() => entries.value.filter(isCovertCardEntry))
const settlementHandoffItems = computed(() => settlementDraft.handoffText
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean))
const settlementCardWriteReady = computed(() => Boolean(
  settlementDraft.chapterTitle.trim()
  || settlementDraft.card.summary.trim()
  || settlementDraft.card.hook.trim()
  || settlementDraft.card.newTermsText.trim()
))
const settlementHandoffWriteReady = computed(() => {
  const count = settlementHandoffItems.value.length
  return count >= settlementHandoffMin && count <= settlementHandoffMax
})

watch(() => editorTab.value, (tab) => {
  if (tab === 'settlement') void refreshSettlementChannel()
})

async function refreshSettlementChannel() {
  try {
    await refreshFileSourceAvailability()
    fileChannelOnline.value = isFileSourceAvailable()
  } catch {
    fileChannelOnline.value = false
  }
}

function setSettlementError(message) {
  settlementError.value = message
  settlementMessage.value = ''
}

function setSettlementMessage(message) {
  settlementMessage.value = message
  settlementError.value = ''
}

function generateSettlementDraft() {
  if (!activeWorldbook.value?.id) return
  const draft = settlementFromTurn({
    chapterTitle: settlementDraft.chapterTitle,
    text: settlementDraft.sourceText,
    entries: entries.value
  })
  settlementDraft.card.summary = draft.chapterCard.summary
  settlementDraft.card.hook = draft.chapterCard.hook
  settlementDraft.card.newTermsText = draft.chapterCard.newTerms.join(', ')
  settlementDraft.characters = draft.characterStates.map((row) => ({
    ...row,
    deltas: { ...row.deltas },
    written: false
  }))
  if (!settlementDraft.foreshadow.length) addForeshadowRow()
  setSettlementMessage('草案已生成（本地抽取，未写入任何数据）。请逐项确认后用「写入」按钮落库。')
}

function addCharacterRow(event) {
  const entryId = String(event?.target?.value || '').trim()
  if (event?.target) event.target.value = ''
  if (!entryId || settlementDraft.characters.some((row) => row.entryId === entryId)) return
  settlementDraft.characters.push({
    entryId,
    name: entries.value.find((entry) => entry.id === entryId)?.name || '',
    deltas: { injury: '', money: '', knowledge: '', relations: '', location: '', note: '' },
    written: false
  })
}

function removeCharacterRow(index) {
  settlementDraft.characters.splice(index, 1)
}

function settlementRowHasDelta(row) {
  return ['injury', 'money', 'knowledge', 'relations', 'location', 'note']
    .some(key => String(row?.deltas?.[key] || '').trim())
}

function addForeshadowRow() {
  settlementDraft.foreshadow.push({
    fid: '',
    content: '',
    plantedAt: settlementDraft.chapterTitle.trim(),
    dueBy: '',
    status: 'open'
  })
}

function removeForeshadowRow(index) {
  settlementDraft.foreshadow.splice(index, 1)
}

function addReveal() {
  const text = settlementDraft.revealText.trim()
  if (!text) return
  settlementDraft.reveals.push({ text, name: '', adopted: false })
  settlementDraft.revealText = ''
}

function removeReveal(index) {
  settlementDraft.reveals.splice(index, 1)
}

async function runSettlementWrite(label, payload, pieces, onDone) {
  if (!activeWorldbook.value?.id) return
  settlementBusy.value = true
  settlementError.value = ''
  try {
    const { results } = await applyChapterSettlement(settlementChannel, payload, { pieces })
    const failed = Object.entries(results).filter(([, result]) => result?.ok === false)
    if (failed.length) {
      setSettlementError(`${label}失败：${failed.map(([, result]) => result.error || '未知错误').join('；')}`)
      return
    }
    await worldStore.loadWorldbooksIndex()
    if (typeof onDone === 'function') onDone(results)
  } catch (error) {
    setSettlementError(`${label}失败：${error?.message || '未知错误'}`)
  } finally {
    settlementBusy.value = false
  }
}

async function writeChapterCard() {
  await runSettlementWrite(
    '写入章卡',
    {
      chapterTitle: settlementDraft.chapterTitle,
      chapterCard: {
        summary: settlementDraft.card.summary,
        hook: settlementDraft.card.hook,
        newTerms: splitKeywords(settlementDraft.card.newTermsText)
      }
    },
    ['chapterCard'],
    (results) => {
      const skipped = results.chapterCard?.skipped
      setSettlementMessage(skipped ? '章卡没有可追加的内容（同名章节可能已结算）。' : '章卡已写入章账（文件随双写自动落盘）。')
    }
  )
}

async function writeChapterHandoff() {
  await runSettlementWrite(
    '写入交接',
    { chapterTitle: settlementDraft.chapterTitle, handoff: settlementHandoffItems.value },
    ['handoff'],
    (results) => {
      setSettlementMessage(results.handoff?.skipped
        ? '交接未写入（需 3-5 条）。'
        : '交接已写入章账末节（下一章写手只读末节）。')
    }
  )
}

async function writeCharacterRow(row) {
  row.written = false
  await runSettlementWrite(
    '写入人物状态',
    { characterStates: [{ entryId: row.entryId, name: row.name, deltas: { ...row.deltas } }] },
    ['characterStates'],
    (results) => {
      const result = results.characterStates
      if (result?.applied?.length) {
        row.written = true
        setSettlementMessage('人物状态已写入条目（当前状态改写+变动史追加）。')
      } else if (result?.skipped?.length) {
        setSettlementMessage('没有可写入的状态变动。')
      }
    }
  )
}

async function writeForeshadowRows() {
  const rows = settlementDraft.foreshadow
    .filter((row) => row.fid.trim())
    .map((row) => ({ ...row }))
  if (!rows.length) return
  await runSettlementWrite(
    '写入伏笔台账',
    { foreshadow: rows },
    ['foreshadow'],
    () => setSettlementMessage('伏笔台账已更新（同 fid 行原位更新，状态 open/paid/retired 机器可读）。')
  )
}

async function adoptReveal(reveal) {
  await runSettlementWrite(
    '采纳世界揭示',
    { worldReveals: [{ text: reveal.text, name: reveal.name, adopted: false }] },
    ['worldReveals'],
    () => {
      reveal.adopted = true
      setSettlementMessage('揭示已采纳为设定条目。')
    }
  )
}

onMounted(async () => {
  try {
    await worldStore.loadWorldbooksIndex()
    // 项目模式由 useSettingsProjectContext 按书绑定加载；全局模式保留既有 active 行为。
    if (!isProjectMode.value && !context.value?.worldbookId) {
      if (typeof worldStore.ensureActiveWorldbook === 'function') {
        await worldStore.ensureActiveWorldbook()
      } else if (worldbooksIndex.value.length > 0) {
        await worldStore.setActiveWorldbook(worldbooksIndex.value[0].id)
      }
    }
  } catch { /* Best-effort fallback intentionally ignores diagnostics. */ }
})

</script>

<style scoped>
.worldbook-page {
  min-height: var(--app-viewport-height, 100vh);
  display: flex;
  flex-direction: column;
  background: var(--surface-workbench-canvas);
  color: var(--text-primary);
  font-family: var(--font-sans);
}





.editor-layout {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
  padding: 12px;
  /* AppShell is height: 100vh + overflow: hidden; without an internal
     scroll container, the create tab's stacked "novel snippet import" +
     "AI generation worldbook" sections get clipped at the bottom.
     Mirror the structured-settings workspace body so the editor scrolls
     inside the bounded shell. */
  overflow: auto;
}

.entry-missing-strip {
  margin: 10px clamp(16px, 3vw, 42px) 0;
  padding: 8px 14px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
}

.entry-missing-strip p {
  margin: 0;
}

.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  padding: 32px 18px;
}

.editor-empty p {
  margin: 0;
}

.editor-main {
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.editor-main.empty {
  background: var(--bg-secondary);
  border: 1px dashed var(--border);
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.card {
  background: var(--surface-workbench-raised);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px;
}

.card-head {
  margin-bottom: 10px;
}

.card-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.card-head.split {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.worldbook-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.worldbook-form .full-width {
  grid-column: 1 / -1;
}

.entry-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.entry-tools .ghost-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
}

.worldbook-maintenance {
  margin: 4px 0 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-left: 3px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, var(--bg-primary));
}

.maintenance-head,
.maintenance-actions,
.candidate-head,
.candidate-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.maintenance-head h3 {
  margin: 3px 0 2px;
  font-size: 15px;
}

.maintenance-head p,
.maintenance-summary,
.maintenance-empty,
.candidate-reason,
.candidate-links {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.panel-kicker,
.maintenance-revision,
.maintenance-scope {
  color: var(--text-muted);
  font-size: 11px;
}

.maintenance-modes {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0 10px;
}

.maintenance-mode {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 9px 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.maintenance-mode span {
  font-size: 11px;
  color: var(--text-muted);
}

.maintenance-mode.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary));
  color: var(--text-primary);
}

.maintenance-brief {
  min-height: 74px;
  margin-bottom: 10px;
}

.maintenance-actions {
  justify-content: flex-end;
}

.maintenance-actions .maintenance-scope {
  margin-right: auto;
}

.maintenance-error {
  margin-top: 10px;
  color: #ef4444;
  font-size: 12px;
}

.maintenance-stale {
  margin-top: 10px;
  padding: 8px 10px;
  border-left: 2px solid #b7791f;
  background: color-mix(in srgb, #b7791f 8%, var(--bg-primary));
  color: var(--text-secondary);
  font-size: 12px;
}

.maintenance-summary {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

/* 档案迁移（预览）面板：与维护面板同族，但走中性描边（不暗示 AI 语义） */
.worldbook-migration {
  margin: 4px 0 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--text-muted);
  background: var(--bg-primary);
}

.migration-subhead {
  margin: 12px 0 2px;
  font-size: 13px;
  color: var(--text-primary);
}

.migration-hint {
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.55;
}

.migration-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.migration-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-secondary);
  font-size: 12px;
  color: var(--text-secondary);
}

.migration-row .entry-title {
  color: var(--text-primary);
  font-weight: 600;
}

.migration-group {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.migration-dupes {
  color: var(--text-muted);
  font-size: 11px;
}

.migration-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.maintenance-candidates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.maintenance-candidate {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
}

.maintenance-candidate.is-applied,
.maintenance-candidate.is-ignored {
  opacity: 0.62;
}

.candidate-action {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 650;
}

.candidate-confidence,
.candidate-status {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 11px;
}

.candidate-confidence.is-high {
  color: #16805d;
}

.candidate-confidence.is-low {
  color: #9b6b20;
}

.candidate-proposal {
  padding-left: 9px;
  border-left: 2px solid color-mix(in srgb, var(--accent) 60%, var(--border));
}

.candidate-proposal strong,
.candidate-proposal span {
  display: block;
}

.candidate-proposal span {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: 11px;
}

.candidate-proposal p {
  margin: 6px 0 0;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.candidate-edit-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 0.45fr);
  gap: 7px;
}

.candidate-edit-form .text-area {
  grid-column: 1 / -1;
}

.candidate-links {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hidden-file-input {
  display: none;
}

.import-error,
.import-success {
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  margin-bottom: 8px;
}

.import-error {
  border: 1px solid color-mix(in srgb, #ef4444 55%, var(--border));
  background: color-mix(in srgb, #ef4444 12%, var(--bg-primary));
  color: #ef4444;
}

.import-success {
  border: 1px solid color-mix(in srgb, #10b981 55%, var(--border));
  background: color-mix(in srgb, #10b981 12%, var(--bg-primary));
  color: #10b981;
}

.import-preview {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.import-preview-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.import-preview-head strong {
  font-size: 14px;
  color: var(--text-primary);
}

.import-preview-head span {
  font-size: 11px;
  color: var(--text-muted);
}

.import-meta-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.research-toggle {
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}

.research-toggle svg {
  color: var(--accent);
}

.research-panel {
  border-top: 1px solid color-mix(in srgb, var(--accent) 24%, var(--border));
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 18%, var(--border));
  padding: 12px 2px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.research-panel__head,
.research-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.research-panel__head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.research-panel__head strong,
.research-preview__head strong {
  color: var(--text-primary);
  font-size: 12px;
}

.research-panel__head span,
.research-preview__head span,
.research-note,
.research-status {
  color: var(--text-muted);
  font-size: 11px;
}

.research-settings-grid {
  display: grid;
  grid-template-columns: minmax(150px, 0.7fr) minmax(220px, 1.3fr) auto;
  gap: 10px;
  align-items: end;
}

.research-settings-grid > label:not(.compact-label) {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 11px;
}

.research-number {
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.research-number .compact {
  width: 68px;
}

.research-note,
.research-status {
  margin: 0;
  line-height: 1.5;
}

.research-status {
  color: var(--accent);
}

.research-status.error {
  color: var(--danger, #ef4444);
}

.research-review {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
  padding: 9px 10px;
  border-left: 3px solid var(--warning, #b7791f);
  background: color-mix(in srgb, var(--warning, #b7791f) 8%, transparent);
}

.research-review__copy {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}

.research-review__copy strong {
  color: var(--text-primary);
  font-size: 11px;
}

.research-review__copy span {
  color: var(--text-secondary);
  font-size: 11px;
}

.research-conflict-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  color: var(--text-secondary);
  font-size: 10px;
}

.research-conflict-list li {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.research-conflict-list span {
  color: var(--accent);
  font-weight: 600;
}

.research-conflict-list em {
  color: var(--text-muted);
  font-style: normal;
}

.research-claim-ledger {
  display: grid;
  gap: 5px;
}

.research-claim-ledger__label {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 600;
}

.research-claim-ledger ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.research-claim-ledger li {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) minmax(74px, 0.4fr);
  gap: 6px;
  align-items: baseline;
  color: var(--text-secondary);
  font-size: 10px;
}

.research-claim-ledger li.stale {
  color: var(--warning, #b7791f);
}

.research-claim-ledger b {
  color: var(--accent);
  font-size: 10px;
}

.research-claim-ledger small {
  min-width: 0;
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.research-review__hint {
  margin: 0;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.45;
}

.research-review__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.research-preview {
  margin-top: 4px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.research-incremental-note,
.research-revision-note {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.research-revision-note {
  color: var(--accent);
}

.research-source-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}

.research-source-list li {
  min-width: 0;
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: start;
  column-gap: 6px;
}

.research-source-list li.excluded {
  opacity: 0.58;
}

.research-source-id {
  color: var(--accent);
  font-size: 10px;
  font-weight: 700;
  line-height: 20px;
}

.research-source-list a {
  min-width: 0;
  color: var(--text-primary);
  font-size: 11px;
  line-height: 20px;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.research-source-list a:hover {
  color: var(--accent);
}

.research-source-title {
  min-width: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.research-source-list a svg {
  margin-left: 3px;
  vertical-align: -2px;
}

.research-source-list p {
  grid-column: 2;
  margin: 0;
  color: var(--text-muted);
  font-size: 10px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.research-source-locator {
  grid-column: 2;
  color: var(--text-secondary);
  font-size: 9px;
  line-height: 14px;
}

.research-source-evidence {
  grid-column: 2;
  color: var(--accent);
  font-size: 9px;
  line-height: 14px;
}

.research-source-exclude {
  grid-column: 2;
  justify-self: start;
  margin-top: 2px;
}

.meta-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item span {
  font-size: 11px;
  color: var(--text-muted);
}

.meta-item strong {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-all;
}

.import-type-list {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.type-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.preview-entry-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  max-height: 180px;
  overflow: auto;
}

.preview-entry-item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
}

.preview-entry-item:last-child {
  border-bottom: none;
}

.preview-entry-name {
  font-size: 12px;
  color: var(--text-primary);
  word-break: break-all;
}

.preview-entry-meta {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.group-overview {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 10px;
  max-height: 180px;
  overflow: auto;
}

.group-overview-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}

.group-overview-item:last-child {
  border-bottom: none;
}

.group-overview-item span {
  color: var(--text-primary);
  word-break: break-all;
}

.group-overview-item strong {
  color: var(--text-secondary);
  font-weight: 600;
  white-space: nowrap;
}

.group-overview-item.empty span,
.group-overview-item.empty strong {
  color: var(--text-muted);
}

.group-manager-grid {
  display: grid;
  gap: 10px;
}

.group-manager-block {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-manager-block h3 {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.group-manager-block.danger {
  border-color: color-mix(in srgb, #ef4444 45%, var(--border));
}

.group-form-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.group-form-row .text-input,
.group-form-row .select-input {
  min-width: 150px;
  flex: 1;
}

.bulk-tools {
  margin-bottom: 10px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.bulk-label {
  font-size: 12px;
  color: var(--text-secondary);
}

.select-input.compact,
.text-input.compact {
  width: auto;
  min-width: 110px;
}

.entry-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 12px;
  min-height: 320px;
}

.entry-list {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entry-item {
  border: 1px solid var(--border);
  background: var(--bg-primary);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 8px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.entry-item.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-primary));
}

.entry-checkbox {
  margin-top: 2px;
}

.entry-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.entry-title {
  font-size: 12px;
  font-weight: 600;
  display: block;
  word-break: break-all;
}

.entry-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.entry-type,
.entry-mode,
.entry-group {
  font-size: 11px;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 6px;
}

.entry-group {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.entry-editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.entry-editor.empty {
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.text-input,
.select-input,
.text-area,
.search-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--surface-workbench-input);
  color: var(--text-primary);
  padding: 8px 12px;
  font: 14px/1.6 var(--font-sans);
}

.text-area {
  resize: vertical;
}

.injection-panel {
  border: 1px dashed var(--border);
  border-radius: 8px;
  padding: 10px;
}

.injection-panel h3 {
  margin: 0 0 8px;
  font-size: 13px;
}

.injection-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.injection-grid .full-row {
  grid-column: 1 / -1;
}

.checkbox-line {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.checkbox-line.inline {
  margin-top: 0;
}

.group-quick {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.group-quick-label {
  font-size: 11px;
  color: var(--text-muted);
}

.group-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.group-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
}

.group-chip.active {
  border-color: var(--accent);
  color: var(--accent);
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.primary-btn,
.ghost-btn,
.danger-btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  height: 34px;
  padding: 0 12px;
  cursor: pointer;
  font-size: 12px;
}

.small {
  height: 30px;
  padding: 0 10px;
}

.primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.primary-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* W5c UX sweep: when the worldbook base form has unsaved changes,
   the "保存世界书" button should pulse so users notice it before
   they switch worldbooks / tabs / close the page. */
.primary-btn.is-dirty {
  animation: wbe-dirty-pulse 1.6s ease-in-out infinite;
}
@keyframes wbe-dirty-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--warning) 60%, transparent); }
  50%      { box-shadow: 0 0 0 6px color-mix(in srgb, var(--warning) 0%,  transparent); }
}

.ghost-btn {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.danger-btn {
  background: transparent;
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 70%, var(--border));
}

.empty-hint {
  color: var(--text-muted);
  font-size: 12px;
  padding: 8px;
}

.editor-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.editor-tab {
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 7px 10px;
  cursor: pointer;
}

.editor-tab.active {
  border-color: var(--accent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 9%, var(--bg-secondary));
}

/* W5 UX sweep: editor tab focus-visible so keyboard nav is obvious. */
.editor-tab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

@media (max-width: 1080px) {
  .editor-layout {
    grid-template-columns: 1fr;
  }

  .entry-layout {
    grid-template-columns: 1fr;
  }

  .worldbook-form {
    grid-template-columns: 1fr;
  }

  .injection-grid {
    grid-template-columns: 1fr;
  }

  .import-meta-grid {
    grid-template-columns: 1fr;
  }

  .research-settings-grid,
  .research-source-list {
    grid-template-columns: 1fr;
  }

  .research-source-list li {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .maintenance-candidates {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .maintenance-modes {
    grid-template-columns: 1fr;
  }

  .maintenance-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .maintenance-actions .maintenance-scope {
    margin-right: 0;
  }

  .candidate-edit-form {
    grid-template-columns: 1fr;
  }
}

/* Settings 3rd pass: the advanced page is a work surface, not a stack of
   dashboard cards. Keep the existing controls and data flow, but give the
   page one quiet frame and let the active edge carry hierarchy. */
.worldbook-page {
  background: color-mix(in srgb, var(--bg-primary) 96%, var(--accent));
}

.editor-layout {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  padding: 20px clamp(14px, 3vw, 42px) 34px;
  background: var(--surface-workbench);
  border-radius: 20px 20px 0 0;
}

.editor-main {
  gap: 0;
  min-width: 0;
}

.editor-tabs {
  flex-wrap: nowrap;
  flex-shrink: 0;
  gap: 4px;
  margin: 0 0 24px;
  overflow-x: auto;
  border-bottom: 0;
  scrollbar-width: thin;
}

.editor-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 36px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 12px;
  padding: 0 12px;
  font: 500 14px/1.5 var(--font-sans);
  background: transparent;
  color: var(--text-secondary);
  white-space: nowrap;
}

.editor-tab svg {
  color: var(--text-muted);
}

.editor-tab:hover {
  background: var(--nav-hover);
  color: var(--text-primary);
}

.editor-tab.active {
  background: var(--nav-selected);
  color: var(--text-primary);
}

.editor-tab.active svg {
  color: currentColor;
}

.editor-main > .card {
  padding: 0 0 24px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 62%, transparent);
  border-radius: 0;
  background: transparent;
}

.editor-main > .card > .card-head {
  margin-bottom: 18px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 52%, transparent);
}

.editor-main > .card > .card-head h2 {
  font-size: 24px;
  font-weight: 500;
}

.editor-main .card-actions {
  align-items: center;
  gap: 10px;
}

.editor-main .primary-btn,
.editor-main .ghost-btn,
.editor-main .danger-btn {
  min-height: 36px;
  height: auto;
  border-radius: 12px;
  font: 500 14px/1.5 var(--font-sans);
  transition: background .15s ease, border-color .15s ease, color .15s ease;
}

.editor-main .primary-btn {
  border: 0;
  border-radius: 20px;
  background: var(--accent);
  color: var(--accent-text);
}

.editor-main .primary-btn:hover {
  background: var(--accent-hover);
}

.editor-main .ghost-btn {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
}

.editor-main .ghost-btn:hover {
  color: var(--text-primary);
  background: var(--nav-hover);
}

.editor-main .danger-btn {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--danger, #b44) 55%, transparent);
}

.editor-create-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 4px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--accent) 58%, transparent);
  background: transparent;
  color: color-mix(in srgb, var(--accent) 55%, var(--archive-ink));
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.editor-create-action:hover {
  border-bottom-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

@media (max-width: 760px) {


  .editor-create-action {
    width: 32px;
    min-width: 32px;
    height: 32px;
    justify-content: center;
    padding: 0;
  }

  .editor-create-action span {
    display: none;
  }
}

@media (max-width: 1080px) {
  .editor-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .editor-layout {
    grid-template-columns: 1fr;
    gap: 16px;
    padding-inline: 14px;
  }

  .editor-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .editor-tab {
    flex: 0 0 auto;
    justify-content: center;
  }
}

/* Entry workspace: keep retrieval controls on one quiet rail and reserve
   visual weight for the entry being edited. */
.entry-workspace-card > .card-head {
  align-items: flex-start;
}

.entry-workspace-card > .card-head h2 {
  padding-top: 5px;
}

.entry-workspace-card .entry-tools {
  display: grid;
  grid-template-columns: minmax(180px, 1.4fr) repeat(3, minmax(112px, .8fr)) auto auto;
  gap: 6px;
  width: min(100%, 820px);
}

.entry-workspace-card .entry-tools .search-input,
.entry-workspace-card .entry-tools .select-input {
  min-width: 0;
  width: 100%;
  height: 32px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 72%, transparent);
  border-radius: 0;
  background: transparent;
}

.entry-workspace-card .entry-tools .ghost-btn,
.entry-workspace-card .entry-tools .primary-btn {
  min-height: 32px;
  height: 32px;
  padding-inline: 9px;
  white-space: nowrap;
}

.entry-workspace-card .entry-tools .ghost-btn.active {
  border-bottom-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  color: var(--accent);
}

.entry-workspace-card .bulk-tools {
  margin: 0 0 14px;
  padding: 9px 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 56%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 56%, transparent);
}

.entry-workspace-card .bulk-tools .ghost-btn,
.entry-workspace-card .bulk-tools .danger-btn {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 64%, transparent);
  border-radius: 0;
  background: transparent;
}

.entry-workspace-card .bulk-tools .danger-btn {
  border-bottom-color: color-mix(in srgb, var(--danger, #b44) 50%, transparent);
}

.entry-workspace-card .entry-layout {
  grid-template-columns: minmax(230px, 280px) minmax(0, 1fr);
  gap: 22px;
  min-height: 500px;
}

.entry-workspace-card .entry-list {
  max-height: calc(var(--app-viewport-height, 100vh) - 280px);
  padding: 0 14px 0 0;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  border-radius: 0;
  gap: 0;
}

.entry-workspace-card .entry-item {
  position: relative;
  gap: 8px;
  padding: 10px 8px 10px 10px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 54%, transparent);
  border-radius: 0;
  background: transparent;
}

.entry-workspace-card .entry-item::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 2px;
  background: transparent;
}

.entry-workspace-card .entry-item:hover {
  background: color-mix(in srgb, var(--accent) 5%, transparent);
}

.entry-workspace-card .entry-item.active {
  border-color: color-mix(in srgb, var(--border) 54%, transparent);
  background: color-mix(in srgb, var(--accent) 7%, transparent);
}

.entry-workspace-card .entry-item.active::before {
  background: var(--accent);
}

.entry-workspace-card .entry-badges {
  gap: 8px;
}

.entry-workspace-card .entry-type,
.entry-workspace-card .entry-mode,
.entry-workspace-card .entry-group {
  padding: 0 0 0 5px;
  border: 0;
  border-left: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
  border-radius: 0;
  font-size: 10px;
}

.entry-workspace-card .entry-editor {
  min-width: 0;
  padding: 0 0 20px 2px;
  border: 0;
  border-radius: 0;
}

.entry-workspace-card .entry-editor > label .text-input,
.entry-workspace-card .entry-editor > label .select-input,
.entry-workspace-card .entry-editor > label .text-area {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 66%, transparent);
  border-radius: 0;
  background: transparent;
}

.entry-workspace-card .entry-editor > label .text-area {
  min-height: 150px;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0 29px,
    color-mix(in srgb, var(--accent) 8%, transparent) 29px 30px
  );
}

.entry-workspace-card .injection-panel {
  padding: 14px 0 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  border-radius: 0;
}

.entry-workspace-card .entry-advanced-panel {
  padding: 0;
  border: 0;
}

.entry-workspace-card .entry-advanced-panel > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 40px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.entry-workspace-card .entry-advanced-panel > summary:hover {
  color: var(--text-primary);
}

.entry-workspace-card .entry-advanced-panel[open] > summary {
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 58%, transparent);
}

.entry-workspace-card .injection-panel h3 {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 680;
}

.entry-workspace-card .group-chip {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 68%, transparent);
  border-radius: 0;
  background: transparent;
}

.entry-workspace-card .group-chip.active {
  border-bottom-color: var(--accent);
  color: var(--accent);
}

.entry-workspace-card .worldbook-maintenance {
  margin: 0 0 16px;
  padding: 14px 16px;
  border: 0;
  border-left: 2px solid color-mix(in srgb, var(--accent) 66%, var(--border));
  background: color-mix(in srgb, var(--accent) 4%, transparent);
}

@media (max-width: 1180px) {
  .entry-workspace-card .entry-tools {
    grid-template-columns: minmax(180px, 1fr) repeat(3, minmax(100px, 1fr));
    width: 100%;
  }

  .entry-workspace-card .entry-tools .ghost-btn,
  .entry-workspace-card .entry-tools .primary-btn {
    grid-row: 2;
  }
}

@media (max-width: 760px) {
  .entry-workspace-card .entry-tools {
    grid-template-columns: 1fr 1fr;
  }

  .entry-workspace-card .entry-tools .search-input {
    grid-column: 1 / -1;
  }

  .entry-workspace-card .entry-tools .ghost-btn,
  .entry-workspace-card .entry-tools .primary-btn {
    grid-row: auto;
  }

  .entry-workspace-card .entry-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .entry-workspace-card .entry-list {
    max-height: 210px;
    padding: 0;
    border-right: 0;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  }

  .entry-workspace-card .entry-editor {
    padding-top: 4px;
  }
}
/* Entry management: a quiet directory and a single editing surface. */
.worldbook-page { background: var(--surface-workbench-canvas); }
.entry-workspace-card .entry-checkbox { margin-top: 16px; accent-color: var(--accent); }
.entry-workspace-card .entry-editor-heading .primary-btn { background: var(--accent); color: var(--accent-text); border: 0; padding: 9px 16px; }
.entry-workspace-card .entry-editor-heading .primary-btn:hover { background: color-mix(in srgb, var(--accent) 88%, var(--text-primary)); }
.entry-workspace-card .entry-list .entry-item { flex-shrink: 0; }
.entry-workspace-card .injection-panel .checkbox-line { display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 8px; min-height: 36px; }
.entry-workspace-card .injection-panel input[type='checkbox'] { width: 16px; height: 16px; margin: 0; flex: 0 0 16px; accent-color: var(--accent); }
.entry-workspace-card > .card-head { display: block; margin-bottom: 20px; }
.entry-workspace-card > .card-head h2 { padding: 0; font-size: 24px; font-weight: 500; }
.entry-total { margin-left: 8px; font-size: 14px; color: var(--text-secondary); font-weight: 400; }
.entry-workspace-caption { margin: 8px 0 20px; color: var(--text-secondary); font-size: 14px; }
.entry-workspace-card .entry-tools { width: 100%; display: flex; flex-wrap: wrap; gap: 8px; }
.entry-workspace-card .entry-tools .search-input { flex: 1 1 200px; max-width: 360px; }
.entry-workspace-card .entry-tools .select-input { width: auto; flex: 0 1 150px; }
.entry-workspace-card .entry-tools :is(.search-input, .select-input) { min-height: 36px; border: 1px solid transparent; border-radius: 12px; padding: 6px 12px; background: var(--surface-workbench-input); font: 14px/1.5 var(--font-sans); }
.entry-workspace-card .entry-tools .ghost-btn { display: inline-flex; gap: 6px; align-items: center; min-height: 36px; border: 0; border-radius: 12px; padding-inline: 12px; background: var(--surface-workbench-muted); font: 500 14px/1.5 var(--font-sans); }
.entry-workspace-card .entry-layout { grid-template-columns: minmax(240px, 28%) minmax(0, 1fr); gap: 28px; align-items: start; }
.entry-workspace-card .entry-list { max-height: calc(var(--app-viewport-height, 100vh) - 280px); min-height: 320px; padding-right: 18px; border-color: var(--archive-paper-strong); }
.entry-directory-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 8px 10px; color: var(--text-secondary); font-size: 12px; }
.entry-workspace-card .entry-item { padding: 0 10px; gap: 10px; margin-bottom: 4px; border: 0; border-radius: 12px; }
.entry-workspace-card .entry-item::before { display: none; }
.entry-workspace-card .entry-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 7px; align-items: stretch; border: 0; background: transparent; color: var(--text-primary); padding: 12px 0; text-align: left; font: inherit; cursor: pointer; }
.entry-workspace-card .entry-title { font-size: 15px; font-weight: 500; white-space: normal; overflow-wrap: anywhere; }
.entry-workspace-card .entry-badges { display: flex; flex-wrap: wrap; gap: 5px 10px; }
.entry-workspace-card :is(.entry-type, .entry-mode, .entry-group) { padding: 0; border: 0; color: var(--text-secondary); background: transparent; font-size: 12px; }
.entry-workspace-card .entry-editor { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px 18px; padding: 0 0 24px; background: transparent; }
.entry-editor-heading { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 18px; border-bottom: 1px solid var(--archive-paper-strong); }
.entry-editor-heading h3 { margin: 6px 0 0; font-size: 24px; font-weight: 500; overflow-wrap: anywhere; }
.entry-editor-kicker { font-size: 12px; color: var(--text-secondary); }
.entry-editor-heading .primary-btn { flex-shrink: 0; border-radius: 20px; min-height: 36px; }
.entry-workspace-card .entry-editor > label { gap: 8px; font: 14px/1.5 var(--font-sans); color: var(--text-secondary); }
.entry-workspace-card .entry-editor > label:has(.text-area), .entry-editor > :is(.injection-panel, .card-actions) { grid-column: 1 / -1; }
.entry-workspace-card .entry-editor > label :is(.text-input, .select-input, .text-area) { min-height: var(--control-hit-min, 36px); border: 1px solid transparent; border-radius: 12px; background: var(--surface-workbench-input); padding: 6px 12px; color: var(--text-primary); font: 14px/1.5 var(--font-sans); }
.entry-workspace-card .entry-editor > label .text-area { min-height: 260px; padding: 12px 14px; font-size: 15px; line-height: 1.85; resize: vertical; background-image: none; }
.entry-workspace-card .injection-panel { margin: 0; padding: 0; background: transparent; }
.injection-panel > summary { display: flex; align-items: center; gap: 12px; padding: 16px 0; cursor: pointer; font-size: 14px; color: var(--text-primary); list-style: none; }
.injection-panel > summary::-webkit-details-marker { display: none; }
.injection-panel > summary span { font-size: 12px; color: var(--text-secondary); }
.injection-panel > summary svg { margin-left: auto; }
.injection-panel[open] > summary svg { transform: rotate(180deg); }
.entry-save-note { margin-right: auto; font-size: 12px; color: var(--text-secondary); }
.entry-workspace-card .card-actions { align-items: center; margin: 0; }
.entry-workspace-card .card-actions .danger-btn { display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; border-radius: 6px; color: var(--text-secondary); }
.entry-workspace-card .card-actions .danger-btn:hover { color: var(--danger); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.entry-workspace-card .bulk-tools { background: var(--archive-paper); border: 0; border-radius: 6px; padding: 12px; gap: 8px; }
.entry-workspace-card :is(button, input, select, textarea, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
@media (max-width: 760px) {
 .entry-workspace-card .entry-layout { grid-template-columns: minmax(0, 1fr); gap: 24px; }
 .entry-workspace-card .entry-list { min-height: 0; max-height: 230px; padding: 0 0 12px; }
 .entry-workspace-card .entry-tools .search-input { flex-basis: 100%; max-width: none; }
 .entry-workspace-card .entry-tools .select-input { flex: 1 1 100px; }
 .entry-workspace-card .entry-editor { grid-template-columns: minmax(0, 1fr); gap: 18px; }
 .entry-workspace-card .entry-tools .ghost-btn { min-height: 44px; height: auto; }
 .injection-panel > summary { flex-wrap: wrap; gap: 8px; }
 .entry-editor-heading h3 { font-size: 24px; }
}
/* All author-editable controls retain one visible focus owner. */
.editor-main :is(.text-input, .select-input, .text-area, .search-input):focus { outline: 2px solid var(--accent); outline-offset: 1px; box-shadow: none; }
.entry-workspace-card .entry-item.active { background: var(--nav-selected); }
@media (max-width: 760px), (pointer: coarse) {
  .editor-tab, .editor-main :is(.primary-btn, .ghost-btn, .danger-btn, .text-input, .select-input, .search-input, summary), .entry-workspace-card .entry-tools :is(.search-input, .select-input, .ghost-btn) { min-height: 44px; height: auto; }
}
@media (max-width: 760px) { .editor-layout { border-radius: 0; } }
/* ---------- W5·B5 章回结算面板（复用既有 token；summary/按钮触达面与其余分区一致） ---------- */

.settlement-lede {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
}

.settlement-channel {
  align-self: flex-start;
  padding: 4px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 72%, transparent);
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
}

.settlement-channel.online {
  border-color: color-mix(in srgb, var(--accent) 46%, transparent);
  color: var(--accent);
}

.settlement-draft-gen {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border: 1px dashed color-mix(in srgb, var(--border) 66%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 46%, transparent);
}

.settlement-draft-gen .full-width {
  grid-column: 1 / -1;
}

.settlement-draft-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.settlement-hint {
  color: var(--text-muted);
  font-size: 12px;
}

.settlement-piece {
  margin-top: 10px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
  border-radius: 8px;
}

.settlement-piece > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 620;
  cursor: pointer;
  list-style: none;
}

.settlement-piece > summary::-webkit-details-marker {
  display: none;
}

.settlement-piece > summary:hover {
  color: var(--text-primary);
}

.settlement-piece[open] > summary {
  border-bottom: 1px dashed color-mix(in srgb, var(--border) 58%, transparent);
}

.settlement-piece > *:not(summary) {
  margin: 10px 0;
}

.settlement-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.settlement-grid .full-width {
  grid-column: 1 / -1;
}

.settlement-piece-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.settlement-piece-actions .settlement-hint {
  margin-right: auto;
}

.settlement-character {
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 48%, transparent);
  border-radius: 8px;
  display: grid;
  gap: 10px;
}

.settlement-character-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.settlement-character-head .select-input {
  flex: 1 1 220px;
}

.settlement-written {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 12px;
}

.settlement-add-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.settlement-add-row .text-input {
  flex: 1 1 260px;
}

.settlement-views {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--border) 58%, transparent);
}

.settlement-ledger-view {
  margin: 0;
  padding: 10px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid color-mix(in srgb, var(--border) 48%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-secondary) 62%, transparent);
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.settlement-covert-list {
  display: grid;
  gap: 8px;
}

.settlement-covert {
  padding: 10px;
  border: 1px solid color-mix(in srgb, var(--border) 48%, transparent);
  border-radius: 8px;
}

.settlement-covert header {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
  flex-wrap: wrap;
}

.settlement-covert p {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-word;
}

.settlement-covert-badge {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--danger, #c0392b) 46%, transparent);
  color: var(--danger, #c0392b);
  font-size: 12px;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .settlement-channel {
    white-space: normal;
  }
}
@media (prefers-reduced-motion: reduce) { .editor-main :is(button, input, select, textarea) { animation: none; transition: none; } }
</style>

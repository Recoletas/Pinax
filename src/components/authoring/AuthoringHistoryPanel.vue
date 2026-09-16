<script setup>
defineProps({
  history: { type: Object, required: true },
  chapterTitle: { type: String, default: '' },
  documentRevision: { type: Number, default: 0 },
  chapterSelected: Boolean
})
</script>

<template>
  <div class="writing-version-panel" data-authoring-inspector="history">
    <div class="writing-version-panel__current">
      <div><span>当前章节</span><strong>{{ chapterTitle || '未命名章节' }}</strong></div>
      <div class="writing-version-panel__revision" aria-label="当前修订"><small>修订</small><b>{{ documentRevision }}</b></div>
    </div>
    <section class="writing-version-panel__automatic" aria-label="自动历史设置">
      <label>
        <span><strong>自动历史</strong><small>正文落盘并跨过字数节点时保存</small></span>
        <input type="checkbox" :checked="history.preferences.value.enabled" @change="history.updatePreference({ enabled: $event.target.checked })">
      </label>
      <label>
        <span>保存间隔</span>
        <select :value="history.preferences.value.intervalWords" :disabled="!history.preferences.value.enabled" @change="history.updatePreference({ intervalWords: Number($event.target.value) })">
          <option v-for="interval in history.intervalOptions" :key="interval" :value="interval">每 {{ interval.toLocaleString() }} 字</option>
        </select>
      </label>
    </section>
    <div class="writing-version-panel__create">
      <input :value="history.label.value" type="text" maxlength="80" placeholder="给这次快照命名" @input="history.setLabel($event.target.value)" @keydown.enter.prevent="history.create()">
      <button type="button" :disabled="!chapterSelected" @click="history.create()">保存快照</button>
    </div>
    <p v-if="history.status.value" class="writing-version-panel__status" role="status">{{ history.status.value }}</p>
    <section v-if="history.recoveryDraft.value" class="writing-recovery-entry" aria-label="未保存草稿">
      <header><div><strong>发现未保存草稿</strong><small>修订 {{ history.recoveryDraft.value.documentRevision }} · {{ history.formatTime(history.recoveryDraft.value.createdAt) }}</small></div><span>未写入章节</span></header>
      <p>这份草稿是在正文保存前留下的恢复副本，恢复会先保留当前正文。</p>
      <footer><button type="button" @click="history.restoreRecovery">恢复草稿</button><button type="button" class="is-quiet" @click="history.discardRecovery">丢弃</button></footer>
    </section>
    <section v-if="history.recentBlockHistory.value.length" class="writing-block-history" aria-label="最近片段历史">
      <header class="writing-block-history__head"><strong>片段历史</strong><small>独立于章节快照</small></header>
      <article v-for="entry in history.recentBlockHistory.value" :key="entry.id" class="writing-block-history__entry">
        <header><div><strong>正文片段</strong><small>修订 {{ entry.fromDocumentRevision }} → {{ entry.toDocumentRevision }}</small></div><span>{{ history.formatTime(entry.createdAt) }}</span></header>
        <p>{{ history.formatPreview(entry.previousText) }}</p>
        <button type="button" :disabled="!history.canRestoreBlock(entry)" @click="history.restoreBlock(entry)">恢复此片段</button>
      </article>
    </section>
    <div v-if="history.recentSnapshots.value.length" class="writing-version-panel__list" aria-label="最近章节快照">
      <article v-for="snapshot in history.recentSnapshots.value" :key="snapshot.id" class="writing-version-entry">
        <header><div><strong>{{ snapshot.label }}</strong><small>{{ history.reasonLabel(snapshot.reason) }} · 修订 {{ snapshot.documentRevision }}</small></div><time :datetime="snapshot.createdAt">{{ history.formatTime(snapshot.createdAt) }}</time></header>
        <p>{{ snapshot.wordCount.toLocaleString() }} 字 · {{ snapshot.chapterTitle || '未命名章节' }}</p>
        <footer><button type="button" @click="history.restore(snapshot)">恢复到这里</button><button type="button" class="is-quiet" @click="history.remove(snapshot)">删除</button></footer>
      </article>
    </div>
    <div v-else class="writing-version-panel__empty">当前章节还没有快照。</div>
    <p v-if="history.snapshots.value.length > history.recentSnapshots.value.length" class="writing-version-panel__more">另有 {{ history.snapshots.value.length - history.recentSnapshots.value.length }} 个较早检查点保留在本地。</p>
  </div>
</template>

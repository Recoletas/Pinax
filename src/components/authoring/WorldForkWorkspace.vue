<script setup>
import { computed, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue'
import { randomUUID } from '../../../shared/randomId.js'
import { tr } from '../../i18n'
import { withLedgerDb } from '../../services/memory/ledger/ledgerDb'
import { listWorldFactForks, forkWorldFacts } from '../../services/memory/ledger/factLedger'
import WorldForkComparison from './WorldForkComparison.vue'
import WorldModelPanel from './WorldModelPanel.vue'

const props = defineProps({ scope: { type: Object, required: true } })
const forks = shallowRef([])
const branch = ref('')
const opened = ref(false)
const comparing = ref(false)
const name = ref('')
const cutoff = ref('')
const busy = ref(false)
const problem = ref('')
const panel = ref(null)
let alive = true
let generation = 0
let attempt
const current = computed(() => forks.value.find(row => row.scope.branchId === branch.value))
const selected = computed(() => current.value?.scope || props.scope)
async function load() {
  const gen = ++generation
  const list = await withLedgerDb(db => listWorldFactForks(db, { scope: props.scope }))
  if (!list.ok) throw new Error(list.reason)
  if (alive && gen === generation) forks.value = list.items
}
async function refresh() {
  try { await load(); if (alive) await panel.value?.refresh() }
  catch (error) { if (alive) problem.value = error.message }
}
async function create() {
  if (busy.value || !name.value.trim()) return
  const recordedSeq = cutoff.value === '' ? null : Number(cutoff.value)
  if (recordedSeq !== null && (!Number.isSafeInteger(recordedSeq) || recordedSeq < 0)) return
  const label = name.value.trim()
  if (attempt?.label !== label || attempt.recordedSeq !== recordedSeq) attempt = { label, recordedSeq, branchId: randomUUID(), commandId: randomUUID() }
  busy.value = true
  problem.value = ''
  try {
    const result = await withLedgerDb(db => forkWorldFacts(db, { ...attempt, scope: props.scope }))
    if (!result.ok) throw new Error(result.reason === 'fork-cutoff-future' ? tr('该记录序号尚未产生。') : result.reason)
    await load()
    if (!alive) return
    branch.value = attempt.branchId
    attempt = null
    opened.value = false
    name.value = ''; cutoff.value = ''
  } catch (error) { if (alive) problem.value = error.message }
  finally { if (alive) busy.value = false }
}
onMounted(() => load().catch(error => { if (alive) problem.value = error.message }))
onBeforeUnmount(() => { alive = false; generation++ })
defineExpose({ refresh })
</script>

<template>
  <section data-test="world-model-scope">
    <div class="fork-controls">
      <label v-if="forks.length">{{ tr('设定版本') }} <select v-model="branch" :aria-label="tr('设定版本')" :disabled="busy">
        <option value="">{{ tr('作品正史') }}</option>
        <option v-for="row in forks" :key="row.scope.branchId" :value="row.scope.branchId">{{ row.label }}</option>
      </select></label>
      <button v-if="!branch" type="button" :disabled="busy" :aria-expanded="opened" @click="opened = !opened">{{ tr('创建试写分支') }}</button>
    </div>
    <form v-if="opened && !branch" class="fork-controls" @submit.prevent="create">
      <label>{{ tr('分支名') }} <input v-model="name" required /></label>
      <label>{{ tr('从记录序号分叉') }} <input v-model="cutoff" type="number" min="0" step="1" :placeholder="tr('留空使用最新记录')" /></label>
      <button type="submit" :disabled="busy || !name.trim()">{{ tr('创建分支') }}</button>
      <p>{{ tr('复制当时的正式事实、证据与历法。可按人物继承分叉时的经历；稿面引述在分支中独立登记。') }}</p>
    </form>
    <button v-if="current" type="button" :aria-expanded="comparing" @click="comparing = !comparing">{{ tr('对照分叉点') }}</button>
    <WorldForkComparison v-if="current && comparing" :key="branch" :scope="current.scope" />
    <p v-if="current">{{ tr('此分支继承作品记录 {seq} 时的 {count} 条事实版本。', { seq: current.parentRecordedSeq, count: current.count }) }}</p>
    <p v-if="problem" role="alert">{{ problem }}</p>
    <WorldModelPanel ref="panel" :key="branch" :scope="selected" />
  </section>
</template>

<style scoped>
.fork-controls { display: flex; flex-wrap: wrap; align-items: baseline; gap: .5rem; margin-block: .5rem; }
.fork-controls p { flex-basis: 100%; margin: 0; }
</style>

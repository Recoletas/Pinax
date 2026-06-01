<template>
  <div v-if="latest" class="perf-overlay">
    <div class="perf-header">
      <span class="perf-title">生成性能</span>
      <span class="perf-total">{{ formatMs(latest.totalMs) }}</span>
      <button class="perf-clear" @click="clear">清除</button>
    </div>
    <table class="perf-table">
      <thead>
        <tr>
          <th class="col-stage">阶段</th>
          <th class="col-ms">耗时</th>
          <th class="col-pct">占比</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in sortedRows" :key="row.stage">
          <td class="col-stage">{{ row.stage }}</td>
          <td class="col-ms">{{ formatMs(row.durationMs) }}</td>
          <td class="col-pct">{{ row.percent.toFixed(1) }}%</td>
        </tr>
      </tbody>
    </table>
    <div class="perf-footer">seed: {{ latest.seed }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { usePerf } from '../../composables/usePerf'

const { latest, clear } = usePerf()

const sortedRows = computed(() => {
  if (!latest.value) return []
  const total = latest.value.totalMs || 1
  return [...latest.value.timings]
    .sort((a, b) => b.durationMs - a.durationMs)
    .map(t => ({ ...t, percent: (t.durationMs / total) * 100 }))
})

function formatMs(ms) {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
</script>

<style scoped>
.perf-overlay {
  position: fixed;
  top: 12px;
  right: 12px;
  width: 280px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  z-index: 1000;
  box-shadow: var(--shadow-floating, 0 4px 16px rgba(0,0,0,0.2));
  font-size: 12px;
  color: var(--text-primary);
}

.perf-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.perf-title {
  flex: 1;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 11px;
}

.perf-total {
  color: var(--accent);
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.perf-clear {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.perf-clear:hover { color: var(--text-primary); border-color: var(--text-muted); }

.perf-table {
  width: 100%;
  border-collapse: collapse;
}

.perf-table th, .perf-table td {
  padding: 2px 4px;
  text-align: left;
}

.perf-table th {
  color: var(--text-muted);
  font-weight: 500;
  font-size: 11px;
  border-bottom: 1px solid var(--border);
}

.col-ms, .col-pct { text-align: right; font-family: ui-monospace, SFMono-Regular, monospace; }
.col-stage { color: var(--text-primary); }

.perf-footer {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 10px;
  word-break: break-all;
}
</style>

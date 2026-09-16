<script setup>
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'

const props = defineProps({
  currentSessionLabel: { type: String, required: true },
  sessionTitleTooltip: { type: String, default: '' },
  codexOpen: Boolean,
  hasSelectedWorldbook: Boolean,
  readingProfile: { type: String, default: 'standard' }
})
const emit = defineEmits(['open-session', 'open-codex', 'update:reading-profile'])
const router = useRouter()
const moreOpen = ref(false)

watch(() => props.codexOpen, (open) => {
  if (open) moreOpen.value = false
})

function navigate(name) {
  moreOpen.value = false
  router.push({ name })
}
</script>

<template>
  <section class="ws-topstrip" aria-label="当前体验会话" @keydown.escape="moreOpen = false">
    <div class="ws-topstrip__main">
      <button class="ws-session-trigger control-quiet" type="button" :title="sessionTitleTooltip" aria-label="切换会话" @click="emit('open-session')">
        <span class="ws-session-trigger__eyebrow">体验</span>
        <span class="ws-session-trigger__label">{{ currentSessionLabel }}</span>
      </button>
    </div>
    <div class="ws-topstrip__actions">
      <button class="ws-topstrip__codex-toggle control-quiet" type="button" aria-controls="experience-codex" :aria-expanded="codexOpen.toString()" @click="emit('open-codex', $event)">索引</button>
      <button class="ws-more-trigger control-icon" type="button" aria-label="更多体验设置" :aria-expanded="moreOpen.toString()" @click="moreOpen = !moreOpen">
        <WorkbenchIcon name="more" :size="18" />
      </button>
      <div v-if="moreOpen" class="ws-more-menu" role="menu" aria-label="体验设置">
        <button class="ws-more-menu__session" type="button" role="menuitem" @click="emit('open-session')"><span>当前会话</span><strong>{{ currentSessionLabel }}</strong></button>
        <label class="ws-more-menu__select" role="menuitem">
          <span>阅读节奏</span>
          <select :value="readingProfile" aria-label="阅读节奏" @change="emit('update:reading-profile', $event.target.value)">
            <option value="compact">紧凑</option><option value="standard">标准</option><option value="relaxed">舒展</option>
          </select>
        </label>
        <button class="ws-more-menu__item" type="button" role="menuitem" :disabled="!hasSelectedWorldbook" @click="navigate('settings-structured')">设定</button>
        <button class="ws-more-menu__item" type="button" role="menuitem" @click="navigate('online-experience')">联机</button>
      </div>
    </div>
  </section>
</template>

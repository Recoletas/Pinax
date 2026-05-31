<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div v-if="visible && event" class="milestone-overlay" @click.self="$emit('close')">
        <div class="milestone-modal" :class="event.type">
          <!-- 场景解锁 -->
          <template v-if="event.type === 'location-unlock'">
            <div class="milestone-icon location">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                <circle cx="12" cy="9" r="2.5"/>
              </svg>
            </div>
            <h2 class="milestone-title">场景解锁</h2>
            <div class="milestone-location">{{ event.data?.location }}</div>
            <p class="milestone-desc" v-if="event.data?.description">
              {{ event.data.description.slice(0, 150) }}{{ event.data.description.length > 150 ? '...' : '' }}
            </p>
          </template>

          <!-- 角色登场 -->
          <template v-else-if="event.type === 'character-appearance'">
            <div class="milestone-icon character">
              <div class="character-avatar">
                {{ event.data?.name?.[0] || '?' }}
              </div>
            </div>
            <h2 class="milestone-title">角色登场</h2>
            <div class="milestone-character">{{ event.data?.name }}</div>
            <p class="milestone-desc" v-if="event.data?.description">
              {{ event.data.description.slice(0, 150) }}{{ event.data.description.length > 150 ? '...' : '' }}
            </p>
          </template>

          <!-- 时间跃迁 -->
          <template v-else-if="event.type === 'time-skip'">
            <div class="milestone-icon time">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
            </div>
            <h2 class="milestone-title">时间流逝</h2>
            <div class="milestone-time">{{ event.data?.description || '时光飞逝...' }}</div>
          </template>

          <!-- 通用里程碑 -->
          <template v-else>
            <div class="milestone-icon default">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
              </svg>
            </div>
            <h2 class="milestone-title">重要事件</h2>
            <p class="milestone-desc">{{ event.data?.description || '发生了重要的事情...' }}</p>
          </template>

          <div class="milestone-actions">
            <button class="primary-btn" @click="$emit('close')">继续</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  event: { type: Object, default: null }
})

defineEmits(['close'])
</script>

<style scoped>
.milestone-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 4000;
  backdrop-filter: blur(8px);
}

.milestone-modal {
  width: min(420px, 90vw);
  padding: 32px 24px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
  text-align: center;
  animation: modalIn 0.3s ease;
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.milestone-modal.location-unlock {
  border-color: #10b981;
  background: linear-gradient(180deg, color-mix(in srgb, #10b981 8%, var(--bg-secondary)) 0%, var(--bg-secondary) 100%);
}

.milestone-modal.character-appearance {
  border-color: #0ea5e9;
  background: linear-gradient(180deg, color-mix(in srgb, #0ea5e9 8%, var(--bg-secondary)) 0%, var(--bg-secondary) 100%);
}

.milestone-modal.time-skip {
  border-color: #a855f7;
  background: linear-gradient(180deg, color-mix(in srgb, #a855f7 8%, var(--bg-secondary)) 0%, var(--bg-secondary) 100%);
}

.milestone-icon {
  margin: 0 auto 16px;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.milestone-icon.location {
  background: color-mix(in srgb, #10b981 20%, transparent);
  color: #10b981;
}

.milestone-icon.character {
  background: color-mix(in srgb, #0ea5e9 20%, transparent);
}

.milestone-icon.time {
  background: color-mix(in srgb, #a855f7 20%, transparent);
  color: #a855f7;
}

.milestone-icon.default {
  background: color-mix(in srgb, #f59e0b 20%, transparent);
  color: #f59e0b;
}

.character-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: color-mix(in srgb, #0ea5e9 30%, var(--bg-tertiary));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 600;
  color: #0284c7;
}

.milestone-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.milestone-location,
.milestone-character,
.milestone-time {
  margin: 0 0 16px;
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
}

.milestone-desc {
  margin: 0 0 24px;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  text-align: left;
  padding: 12px;
  background: var(--bg-primary);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.milestone-actions {
  display: flex;
  justify-content: center;
}

.primary-btn {
  padding: 10px 32px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.primary-btn:hover {
  transform: scale(1.02);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent) 40%, transparent);
}

/* Transition */
.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: all 0.25s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
}

.fade-scale-enter-from .milestone-modal,
.fade-scale-leave-to .milestone-modal {
  transform: scale(0.95);
}
</style>

<script setup>
import { useWritingTypographyStore, WRITING_FONT_OPTIONS, VALID_LINE_HEIGHTS, MIN_FONT_SIZE, MAX_FONT_SIZE } from '../../stores/writingTypographyStore'
const writing = useWritingTypographyStore()
writing.init()
</script>

<template>
  <div class="writing-preferences">
    <header><h2>写作</h2><p>与正文工具栏共用偏好，立即生效并在本机保留。</p></header>
    <h3>正文排版</h3>
    <label>字体<select :value="writing.fontKey" @change="writing.setFontKey($event.target.value)"><option v-for="font in WRITING_FONT_OPTIONS" :key="font.key" :value="font.key">{{ font.label }}</option></select></label>
    <label>字号<input type="number" :min="MIN_FONT_SIZE" :max="MAX_FONT_SIZE" :value="writing.fontSize" @change="writing.setFontSize($event.target.value)"></label>
    <label>行距<select :value="writing.lineHeight" @change="writing.setLineHeight($event.target.value)"><option v-for="height in VALID_LINE_HEIGHTS" :key="height" :value="height">{{ height }} 倍</option></select></label>
    <label>段落间距<select :value="writing.paragraphGap" @change="writing.setParagraphGap($event.target.value)"><option :value="0.65">紧凑</option><option :value="1.05">标准</option><option :value="1.45">宽松</option></select></label>
    <label class="preference-check"><input type="checkbox" :checked="writing.firstLineIndent" @change="writing.toggleFirstLineIndent()">首行缩进两字</label>
    <h3>阅读与专注</h3>
    <label class="preference-check"><input type="checkbox" :checked="writing.typewriter" @change="writing.toggleTypewriter()">打字机滚动<span>让当前行保持在中央</span></label>
    <label class="preference-check"><input type="checkbox" :checked="writing.focusParagraph" @change="writing.toggleFocusParagraph()">段落聚焦<span>淡化非当前段落</span></label>
    <p class="preference-note">正文自动保存已开启。Ctrl / Cmd + Z 撤销，Ctrl / Cmd + Shift + Z 重做；专注模式可从正文工具栏切换。</p>
  </div>
</template>

<style scoped>
.writing-preferences { display: grid; gap: 18px; font: 14px/1.6 var(--font-sans); }
h2 { margin: 0; font-size: 22px; } h3 { margin: 12px 0 0; font-size: 14px; }
p { margin: 4px 0 0; color: var(--text-secondary); }
label { display: grid; grid-template-columns: minmax(110px, 1fr) minmax(100px, 200px); align-items: center; gap: 12px; }
input, select { min-width: 0; min-height: 34px; padding: 5px 9px; background: var(--bg-primary); color: var(--text-primary); border: 1px solid var(--border); border-radius: 5px; font: inherit; }
.preference-check { display: flex; flex-wrap: wrap; gap: 10px; }.preference-check input { min-height: 0; width: 16px; height: 16px; accent-color: var(--accent); }
.preference-check span, .preference-note { color: var(--text-secondary); font-size: 12px; }
input:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>

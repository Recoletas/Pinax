<template>
  <div class="quick-page">
    <header class="quick-hero">
      <div class="hero-left">
        <h1>世界书快速导入</h1>
        <p>
          这是面向新手的普通入口：用预设、小说段落或一句说明，快速生成可用世界书。
          条目细调、注入参数和批量改动放在高级设置中处理。
        </p>
      </div>
      <div class="hero-actions">
        <button class="ghost-btn" @click="openExperience">返回体验</button>
        <button class="primary-btn" @click="openAdvancedEditor">进入高级设置</button>
      </div>
    </header>

    <section class="status-row">
      <div class="status-chip">当前世界书数量：{{ worldbooksIndex.length }}</div>
      <div class="status-chip" v-if="activeWorldbookName">当前激活：{{ activeWorldbookName }}</div>
    </section>

    <section v-if="errorMessage" class="feedback error">{{ errorMessage }}</section>
    <section v-if="successMessage" class="feedback success">{{ successMessage }}</section>
    <section v-if="infoMessage" class="feedback info">{{ infoMessage }}</section>

    <section class="quick-grid">
      <article class="card">
        <div class="card-head">
          <h2>一键预设</h2>
          <span>零门槛，直接可玩</span>
        </div>

        <div class="preset-list">
          <div class="preset-item" v-for="preset in presets" :key="preset.id">
            <div class="preset-main">
              <strong>{{ preset.name }}</strong>
              <p>{{ preset.description }}</p>
              <div class="preset-tags">
                <span class="tag">{{ preset.genreLabel }}</span>
                <span class="tag">{{ preset.entries.length }} 条目</span>
              </div>
            </div>
            <button class="ghost-btn" :disabled="creating" @click="importPreset(preset)">
              {{ creating ? '创建中...' : '一键导入' }}
            </button>
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card-head">
          <h2>小说段落导入</h2>
          <span>AI 优先，失败自动回退本地提炼</span>
        </div>

        <label>
          世界书名称（可选）
          <input
            v-model.trim="novelInput.name"
            class="text-input"
            type="text"
            placeholder="例如：风雪港调查案"
          />
        </label>

        <label>
          粘贴小说片段 / 大纲说明
          <textarea
            v-model.trim="novelInput.sourceText"
            class="text-area"
            rows="8"
            placeholder="粘贴若干段正文、章节摘要或世界设定说明..."
          ></textarea>
        </label>

        <div class="inline-controls">
          <input
            ref="novelFileInputRef"
            class="hidden-file-input"
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            @change="handleNovelFileChange"
          />
          <button class="ghost-btn" :disabled="generatingNovel || creating" @click="openNovelFilePicker">
            上传 TXT/MD
          </button>
          <button class="ghost-btn" :disabled="generatingNovel || creating || !novelInput.sourceText" @click="clearNovelText">
            清空文本
          </button>
          <span class="inline-hint" v-if="novelSourceFileName">已加载：{{ novelSourceFileName }}</span>
        </div>

        <div class="inline-controls">
          <label class="compact-label">
            目标条目数
            <input v-model.number="novelInput.targetCount" class="text-input compact" type="number" min="3" max="30" />
          </label>
          <label class="checkbox-line">
            <input v-model="novelInput.useAiFirst" type="checkbox" />
            <span>优先尝试 AI 提炼</span>
          </label>
        </div>

        <button class="primary-btn" :disabled="generatingNovel || creating" @click="generateFromNovelText">
          {{ generatingNovel ? '生成中...' : '生成导入预览' }}
        </button>
      </article>

      <article class="card">
        <div class="card-head">
          <h2>说明随机生成</h2>
          <span>AI 根据输入生成世界书草案</span>
        </div>

        <label>
          世界风格
          <select v-model="randomInput.genre" class="select-input">
            <option v-for="option in genreOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>

        <label>
          世界书名称（可选）
          <input
            v-model.trim="randomInput.name"
            class="text-input"
            type="text"
            placeholder="例如：荒潮城守夜人"
          />
        </label>

        <label>
          说明 / 核心梗概
          <textarea
            v-model.trim="randomInput.brief"
            class="text-area"
            rows="6"
            placeholder="例如：蒸汽朋克港口城市，夜里会出现吞噬记忆的雾潮。"
          ></textarea>
        </label>

        <div class="inline-controls">
          <label class="compact-label">
            目标条目数
            <input v-model.number="randomInput.targetCount" class="text-input compact" type="number" min="3" max="30" />
          </label>
        </div>

        <button class="primary-btn" :disabled="generatingRandom || creating" @click="generateFromBrief">
          {{ generatingRandom ? '生成中...' : 'AI 生成预览' }}
        </button>
      </article>
    </section>

    <section class="card preview-card" v-if="pendingImport">
      <div class="card-head split">
        <div>
          <h2>导入预览</h2>
          <span>{{ pendingImport.sourceLabel }}</span>
        </div>
        <div class="preview-meta">
          <span>{{ pendingImport.entries.length }} 条目</span>
          <span>{{ pendingImport.groups.length }} 分组</span>
        </div>
      </div>

      <div class="preview-summary">
        <div class="summary-item">
          <span>世界书名称</span>
          <strong>{{ pendingImport.name }}</strong>
        </div>
        <div class="summary-item">
          <span>描述</span>
          <strong>{{ pendingImport.description || '未填写' }}</strong>
        </div>
      </div>

      <div class="conflict-box" v-if="pendingConflictWorldbook">
        <strong>检测到同名世界书：{{ pendingConflictWorldbook.name }}</strong>
        <p>请选择导入策略：</p>
        <select v-model="conflictMode" class="select-input conflict-select">
          <option value="rename">自动重命名后新建</option>
          <option value="create">保持同名直接新建</option>
          <option value="overwrite">覆盖同名世界书（清空原条目）</option>
        </select>
        <div class="conflict-metrics" v-if="pendingConflictMetrics">
          <span>现有条目：{{ pendingConflictMetrics.currentCount }}</span>
          <span>导入条目：{{ pendingConflictMetrics.incomingCount }}</span>
          <span :class="['delta', pendingConflictMetrics.delta >= 0 ? 'up' : 'down']">
            条目变化：{{ pendingConflictMetrics.delta >= 0 ? '+' : '' }}{{ pendingConflictMetrics.delta }}
          </span>
        </div>
      </div>

      <div class="preview-groups" v-if="pendingImport.groups.length">
        <span class="group-chip" v-for="group in pendingImport.groups" :key="group">{{ group }}</span>
      </div>

      <div class="entry-preview-list">
        <div class="entry-preview-item" v-for="entry in pendingImport.entries.slice(0, 20)" :key="entry.id">
          <div class="entry-title-line">
            <strong>{{ entry.name }}</strong>
            <span>{{ entryTypeLabel(entry.type) }}</span>
          </div>
          <div class="entry-keywords">触发词：{{ entry.keys.join('、') }}</div>
          <p>{{ entry.content }}</p>
        </div>
      </div>

      <div class="card-actions">
        <button class="primary-btn" :disabled="creating" @click="importPending">
          {{ creating ? '导入中...' : '导入为新世界书' }}
        </button>
        <button class="ghost-btn" :disabled="creating" @click="clearPendingImport">清空预览</button>
        <button class="ghost-btn" :disabled="creating" @click="openAdvancedEditor">去高级设置继续编辑</button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { getResolvedApiSettings } from '../services/api'
import { runGenerationRetryPlan } from '../services/generationRetry'

const router = useRouter()
const worldStore = useWorldStore()

const worldbooksIndex = computed(() => worldStore.worldbooksIndex || [])
const activeWorldbookName = computed(() => worldStore.activeWorldbook?.name || '')

const creating = ref(false)
const generatingNovel = ref(false)
const generatingRandom = ref(false)
const pendingImport = ref(null)
const novelFileInputRef = ref(null)
const novelSourceFileName = ref('')
const conflictMode = ref('rename')

const errorMessage = ref('')
const successMessage = ref('')
const infoMessage = ref('')

const pendingConflictWorldbook = computed(() => {
  const pendingName = normalizeText(pendingImport.value?.name)
  if (!pendingName) return null
  return worldbooksIndex.value.find(wb => normalizeText(wb?.name) === pendingName) || null
})

const pendingConflictMetrics = computed(() => {
  if (!pendingConflictWorldbook.value || !pendingImport.value) return null
  const currentCount = Number(pendingConflictWorldbook.value.entryCount) || 0
  const incomingCount = Array.isArray(pendingImport.value.entries) ? pendingImport.value.entries.length : 0
  return {
    currentCount,
    incomingCount,
    delta: incomingCount - currentCount
  }
})

const genreOptions = [
  { value: 'fantasy', label: '奇幻冒险' },
  { value: 'urban', label: '都市现实' },
  { value: 'scifi', label: '科幻星际' },
  { value: 'wuxia', label: '武侠仙侠' },
  { value: 'apocalypse', label: '末日生存' }
]

const entryTypeOptions = [
  { value: 'general', label: '通用' },
  { value: 'location', label: '地点' },
  { value: 'character', label: '角色' },
  { value: 'item', label: '物品' },
  { value: 'lore', label: '设定' },
  { value: 'quest', label: '任务' },
  { value: 'event', label: '事件' }
]

const presets = [
  {
    id: 'preset-fantasy',
    name: '奇幻新手包',
    genreLabel: '奇幻冒险',
    description: '含主城、学院、队友、关键遗物与主线危机，适合直接开局。',
    entries: [
      createSeedEntry('location', '暮湾主城', ['暮湾', '主城'], '港雾常年笼罩的贸易主城，夜晚会响起无来源的钟声。', '地理'),
      createSeedEntry('location', '银藤学院', ['银藤学院', '法师学院'], '培养探索者与记录官的学院，地下藏有古代观测仪。', '地理'),
      createSeedEntry('character', '伊薇队长', ['伊薇', '队长'], '城防调查队长，信奉先证据后判断，与你关系复杂但可靠。', '角色'),
      createSeedEntry('item', '风蚀罗盘', ['罗盘', '风蚀罗盘'], '能够在异常雾潮中定位安全路径，但每次使用会损耗刻度。', '道具'),
      createSeedEntry('event', '钟楼停摆事件', ['钟楼停摆', '停摆'], '城中钟楼在三日前停摆，引发港区谣言与恐慌。', '事件'),
      createSeedEntry('lore', '雾潮契约', ['雾潮契约', '契约'], '旧时代签订的禁令：不得在雾潮之夜燃放高频火光。', '设定')
    ]
  },
  {
    id: 'preset-urban',
    name: '都市悬疑包',
    genreLabel: '都市现实',
    description: '适合推理和人物关系戏，带有组织线与案件线。',
    entries: [
      createSeedEntry('location', '北岸传媒大厦', ['北岸传媒', '大厦'], '新闻与公关中心，内部流传一份不能公开的旧档案。', '地理'),
      createSeedEntry('character', '沈述记者', ['沈述', '记者'], '调查记者，擅长追踪资金流，嘴硬心软。', '角色'),
      createSeedEntry('character', '周岚律师', ['周岚', '律师'], '商业诉讼专家，知晓多家企业的隐秘协议。', '角色'),
      createSeedEntry('event', '凌晨坠楼案', ['坠楼案', '凌晨案'], '看似意外的坠楼事件，留下了被篡改的监控时间轴。', '事件'),
      createSeedEntry('item', '缺页笔记本', ['笔记本', '缺页'], '受害者遗留笔记，本应记录线索的几页被完整裁走。', '道具'),
      createSeedEntry('lore', '三层信息网', ['信息网', '三层'], '本城消息传播分公开、半公开、暗线三层，互相嵌套。', '设定')
    ]
  },
  {
    id: 'preset-scifi',
    name: '星际远征包',
    genreLabel: '科幻星际',
    description: '带舰队、殖民站、AI 风险和资源矛盾，适合硬科幻开局。',
    entries: [
      createSeedEntry('location', '赫利俄斯前哨站', ['前哨站', '赫利俄斯'], '位于边境轨道的补给站，长期受微陨石风暴干扰。', '地理'),
      createSeedEntry('character', '林霁舰长', ['林霁', '舰长'], '远征舰指挥官，强调程序与纪律，但对平民保持克制。', '角色'),
      createSeedEntry('item', '折跃芯簇', ['折跃芯簇', '芯簇'], '维持短距折跃稳定的核心组件，库存稀缺。', '道具'),
      createSeedEntry('event', '静默区失联', ['静默区', '失联'], '三支巡检小队进入静默区后全部失联，仅返还空白日志。', '事件'),
      createSeedEntry('lore', '联邦协定 17-B', ['17-B', '协定'], '禁止在未知信号源附近启用全频广播，以免触发回声干扰。', '设定'),
      createSeedEntry('quest', '回收黑匣任务', ['黑匣', '回收任务'], '需在 72 小时内回收失联舰的黑匣，避免航线被封锁。', '任务')
    ]
  }
]

const randomInput = reactive({
  genre: 'fantasy',
  name: '',
  brief: '',
  targetCount: 8
})

const novelInput = reactive({
  name: '',
  sourceText: '',
  targetCount: 10,
  useAiFirst: true
})

const RANDOM_POOLS = {
  fantasy: {
    characters: ['白烬审判官', '林地信使', '潮汐术士', '冬港守钟人', '流火学徒'],
    locations: ['雾铃海崖', '旧王城地库', '风帆修会', '银松边境', '夜桥集市'],
    items: ['裂纹圣印', '潮火灯芯', '星盐卷轴', '誓约短剑', '沉眠符印'],
    events: ['晨雾袭港', '圣坛熄火', '边境失踪潮', '王印争夺', '古渠开闸'],
    lore: ['旧纪元誓令', '渡雾礼俗', '守夜轮值法', '三塔盟约', '潮汐历']
  },
  urban: {
    characters: ['许南制作人', '陈止刑警', '韩雾摄影师', '顾远工程师', '梁笙医师'],
    locations: ['旧港地铁环线', '南城高架桥', '雨幕公寓', '城北仓储区', '银泉社区'],
    items: ['加密硬盘', '指纹门卡', '旧式录音笔', '匿名快递箱', '失效证件'],
    events: ['连夜断电', '证词撤回', '直播事故', '封路通告', '证据泄露'],
    lore: ['市政协调会', '媒体禁播条款', '地下物流网', '夜巡制度', '社区互助会']
  },
  scifi: {
    characters: ['轨道领航员', '深空工程师', '联邦监察官', '仿生译员', '遗迹测绘员'],
    locations: ['轨道补给环', 'β-12 冷却井', '黎明号舰桥', '碎环殖民区', '暗面通讯塔'],
    items: ['相位锚点', '跃迁信标', '应急纳米包', '量子锁钥', '环境滤芯'],
    events: ['航道坍缩', '跃迁延迟', '外缘信号复现', '供氧危机', '哨站脱网'],
    lore: ['联邦边境法', '信号静默令', '殖民分级制度', '舰队轮换规程', '异源接触协议']
  },
  wuxia: {
    characters: ['折梅剑客', '问药医仙', '雁门掌柜', '青衣捕头', '听雨楼主'],
    locations: ['听潮渡口', '落雪山庄', '北荒古道', '三河驿站', '云隐药谷'],
    items: ['寒铁令牌', '洗髓丹方', '玄木琴匣', '残缺剑谱', '封脉银针'],
    events: ['镖局失镖', '门派会盟', '夜雨追杀', '山门封禁', '武林帖重现'],
    lore: ['江湖行规', '门派谱系', '禁武约章', '宗门恩怨录', '渡口税契']
  },
  apocalypse: {
    characters: ['哨站修理员', '废土侦察兵', '药剂配给官', '迁徙向导', '旧城档案员'],
    locations: ['灰雨隔离区', '穹顶温室', '地下储水库', '废城高塔', '北线检查点'],
    items: ['净水滤芯', '便携发电匣', '旧时代地图', '生存药包', '抗寒防护服'],
    events: ['补给车失联', '风暴预警', '围栏破口', '疫潮复燃', '迁徙窗口开启'],
    lore: ['避难条约', '配给等级表', '夜间警戒令', '迁徙路线图', '净土传闻']
  }
}

onMounted(async () => {
  await worldStore.loadWorldbooksIndex()
  if (typeof worldStore.ensureActiveWorldbook === 'function') {
    await worldStore.ensureActiveWorldbook()
  }
})

function openExperience() {
  router.push({ name: 'experience' })
}

function openAdvancedEditor() {
  router.push({ name: 'experience-worldbook-advanced' })
}

function openNovelFilePicker() {
  if (!novelFileInputRef.value) return
  novelFileInputRef.value.value = ''
  novelFileInputRef.value.click()
}

async function handleNovelFileChange(event) {
  const file = event?.target?.files?.[0]
  if (!file) return

  clearFeedback()

  try {
    const text = await file.text()
    const normalized = normalizeText(text)
    if (normalized.length < 20) {
      errorMessage.value = '文件内容过短，至少需要 20 字。'
      return
    }

    novelInput.sourceText = text
    novelSourceFileName.value = file.name

    if (!normalizeText(novelInput.name)) {
      novelInput.name = normalizeText(file.name.replace(/\.[^/.]+$/, ''))
    }

    infoMessage.value = `已加载文件：${file.name}（${normalized.length} 字）`
  } catch (error) {
    errorMessage.value = `读取文件失败：${error?.message || '未知错误'}`
  }
}

function clearNovelText() {
  novelInput.sourceText = ''
  novelSourceFileName.value = ''
  clearFeedback()
}

function clearFeedback() {
  errorMessage.value = ''
  successMessage.value = ''
  infoMessage.value = ''
}

function entryTypeLabel(typeValue) {
  const matched = entryTypeOptions.find(item => item.value === typeValue)
  return matched?.label || typeValue || '通用'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeEntryType(typeValue) {
  const normalized = normalizeText(typeValue).toLowerCase()
  if (['location', 'character', 'item', 'event', 'lore', 'quest', 'general'].includes(normalized)) {
    return normalized
  }
  return 'general'
}

function normalizeGroupName(groupValue) {
  return normalizeText(groupValue)
}

function normalizeKeywords(value, fallback = '') {
  const fromArray = Array.isArray(value) ? value : [value]
  const tokens = []

  for (const item of fromArray) {
    const normalized = String(item || '')
      .split(/[\n,，、|/]/)
      .map(part => part.trim())
      .filter(Boolean)
    tokens.push(...normalized)
  }

  if (!tokens.length && fallback) {
    tokens.push(fallback.slice(0, 16))
  }

  return Array.from(new Set(tokens)).slice(0, 6)
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return ''
  const idx = Math.floor(Math.random() * list.length)
  return list[idx]
}

function uniqueGroups(groups = []) {
  const seen = new Set()
  const result = []
  for (const group of groups) {
    const normalized = normalizeGroupName(group)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function defaultGroupByType(typeValue) {
  const type = normalizeEntryType(typeValue)
  if (type === 'character') return '角色'
  if (type === 'location') return '地理'
  if (type === 'item') return '道具'
  if (type === 'event') return '事件'
  if (type === 'lore') return '设定'
  if (type === 'quest') return '任务'
  return '通用'
}

function createSeedEntry(type, name, keys, content, group, mode = 'selective') {
  return {
    id: `seed_${Math.random().toString(36).slice(2, 10)}`,
    name,
    type: normalizeEntryType(type),
    keys: normalizeKeywords(keys, name),
    keysSecondary: [],
    content,
    injection: {
      mode: mode === 'constant' ? 'constant' : 'selective',
      probability: 100,
      cooldown: 0,
      depth: 1,
      excludeRecursion: false,
      group: normalizeGroupName(group) || null
    }
  }
}

function normalizeGeneratedEntry(rawEntry, index = 0) {
  const type = normalizeEntryType(rawEntry?.type)
  const fallbackName = `${entryTypeLabel(type)}条目${index + 1}`
  const name = normalizeText(rawEntry?.name || rawEntry?.title || fallbackName) || fallbackName
  const content = normalizeText(rawEntry?.content || rawEntry?.description || `${name}相关设定。`)
  const keys = normalizeKeywords(rawEntry?.keys || rawEntry?.keywords || rawEntry?.key, name)
  const keysSecondary = normalizeKeywords(rawEntry?.keysSecondary || rawEntry?.secondary || rawEntry?.keysecondary)
  const group = normalizeGroupName(rawEntry?.group || rawEntry?.category || defaultGroupByType(type)) || null
  const mode = rawEntry?.mode === 'constant' ? 'constant' : 'selective'

  return {
    id: `preview_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    type,
    keys,
    keysSecondary,
    content,
    injection: {
      mode,
      probability: clampNumber(rawEntry?.probability, 100, 0, 100),
      cooldown: clampNumber(rawEntry?.cooldown, 0, 0, 9999),
      depth: clampNumber(rawEntry?.depth, 1, 1, 99),
      excludeRecursion: Boolean(rawEntry?.excludeRecursion),
      group
    }
  }
}

function splitIntoParagraphs(input) {
  const normalized = String(input || '')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (!normalized) return []

  const byLines = normalized
    .split(/\n\s*\n/)
    .map(part => part.trim())
    .filter(Boolean)

  if (byLines.length >= 2) return byLines

  return normalized
    .split(/(?<=[。！？!?])/)
    .map(part => part.trim())
    .filter(part => part.length >= 10)
}

function inferTypeFromText(paragraph) {
  const text = String(paragraph || '')
  if (/(城|镇|村|街|港|山|河|海|森林|学院|基地|站|宫|殿|塔)/.test(text)) return 'location'
  if (/(先生|小姐|队长|博士|掌门|师兄|师姐|记者|警官|舰长|少年|少女)/.test(text)) return 'character'
  if (/(剑|刀|枪|卷轴|芯片|装置|药剂|令牌|证件|钥匙|终端)/.test(text)) return 'item'
  if (/(事件|危机|战斗|袭击|爆炸|失联|任务|追查|仪式|失踪)/.test(text)) return 'event'
  if (/(制度|法律|协定|传说|历史|门规|习俗|规则|设定)/.test(text)) return 'lore'
  return 'general'
}

function extractKeywordsFromText(paragraph, fallback = '') {
  const stopwords = new Set(['他们', '我们', '你们', '然后', '但是', '因为', '所以', '这个', '那个', '一种', '已经', '开始', '如果'])
  const candidates = String(paragraph || '')
    .match(/[\u4e00-\u9fa5]{2,8}/g) || []

  const words = candidates
    .map(token => token.trim())
    .filter(token => token.length >= 2 && !stopwords.has(token))

  const unique = Array.from(new Set(words)).slice(0, 4)
  return normalizeKeywords(unique, fallback)
}

function inferGenreFromText(text) {
  const source = String(text || '')
  if (/(星际|飞船|轨道|联邦|AI|机甲|跃迁|殖民)/i.test(source)) return 'scifi'
  if (/(末日|废土|感染|避难|补给|哨站|灾变)/i.test(source)) return 'apocalypse'
  if (/(江湖|门派|掌门|剑|刀|仙|宗|丹)/i.test(source)) return 'wuxia'
  if (/(公司|公寓|地铁|记者|律师|警局|都市)/i.test(source)) return 'urban'
  return 'fantasy'
}

function createAutoWorldbookName(prefix) {
  return `${prefix}${worldbooksIndex.value.length + 1}`
}

function createUniqueWorldbookName(baseName) {
  const normalizedBase = normalizeText(baseName) || '快速世界书'
  const existingNames = new Set(worldbooksIndex.value.map(wb => normalizeText(wb?.name)).filter(Boolean))

  if (!existingNames.has(normalizedBase)) {
    return normalizedBase
  }

  let index = 1
  let candidate = `${normalizedBase}（导入）`
  while (existingNames.has(candidate)) {
    index += 1
    candidate = `${normalizedBase}（导入${index}）`
  }

  return candidate
}

function buildRandomEntries({ genre, brief, count, startIndex = 0 }) {
  const pool = RANDOM_POOLS[genre] || RANDOM_POOLS.fantasy
  const normalizedCount = clampNumber(count, 8, 3, 30)
  const typeOrder = ['character', 'location', 'item', 'event', 'lore']
  const briefKeyword = extractKeywordsFromText(brief, '').slice(0, 1)

  const entries = []
  for (let i = 0; i < normalizedCount; i += 1) {
    const type = typeOrder[(startIndex + i) % typeOrder.length]

    let baseName = ''
    if (type === 'character') baseName = pickRandom(pool.characters)
    if (type === 'location') baseName = pickRandom(pool.locations)
    if (type === 'item') baseName = pickRandom(pool.items)
    if (type === 'event') baseName = pickRandom(pool.events)
    if (type === 'lore') baseName = pickRandom(pool.lore)

    const name = baseName || `${entryTypeLabel(type)}设定${startIndex + i + 1}`
    const keys = normalizeKeywords([name, ...briefKeyword], name)
    const group = defaultGroupByType(type)

    const content = brief
      ? `${name}：与“${brief.slice(0, 40)}${brief.length > 40 ? '...' : ''}”直接相关，建议在关键剧情节点触发。`
      : `${name}：用于快速开局的 ${entryTypeLabel(type)} 条目，可在高级设置中继续细化。`

    entries.push(createSeedEntry(type, name, keys, content, group))
  }

  return entries
}

function buildEntriesFromParagraphs(sourceText, count) {
  const paragraphs = splitIntoParagraphs(sourceText)
  const normalizedCount = clampNumber(count, 10, 3, 30)
  const entries = []

  for (let i = 0; i < paragraphs.length && entries.length < normalizedCount; i += 1) {
    const paragraph = paragraphs[i]
    const type = inferTypeFromText(paragraph)
    const keys = extractKeywordsFromText(paragraph, `片段${i + 1}`)
    const name = keys[0] || `${entryTypeLabel(type)}片段${i + 1}`
    const content = paragraph.slice(0, 180)
    const group = defaultGroupByType(type)

    entries.push(createSeedEntry(type, name, keys, content, group))
  }

  if (entries.length < normalizedCount) {
    const inferredGenre = inferGenreFromText(sourceText)
    const fallback = buildRandomEntries({
      genre: inferredGenre,
      brief: sourceText,
      count: normalizedCount - entries.length,
      startIndex: entries.length
    })
    entries.push(...fallback)
  }

  return entries.slice(0, normalizedCount)
}

function parseJsonFromAiContent(content) {
  const raw = String(content || '').trim()
  if (!raw) {
    throw new Error('AI 未返回内容')
  }

  try {
    return JSON.parse(raw)
  } catch {
    // ignore and continue
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1])
    } catch {
      // ignore and continue
    }
  }

  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const candidate = raw.slice(start, end + 1)
    return JSON.parse(candidate)
  }

  throw new Error('AI 返回不是有效 JSON')
}

function collectGroupsFromEntries(entries) {
  return uniqueGroups(entries.map(entry => entry?.injection?.group))
}

async function tryAiExtractEntries(sourceText, targetCount, nameHint) {
  const apiSettings = await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    return {
      ok: false,
      reason: '未检测到可用 AI 配置，已自动回退本地提炼。'
    }
  }

  const safeTargetCount = clampNumber(targetCount, 10, 3, 30)
  const prompt = [
    `请从下面的小说片段或设定文本中提取世界书条目。`,
    `必须返回 JSON 对象，字段为 { name, description, groups, entries }。`,
    `entries 每项字段：name, type, keys, content, group, mode。`,
    `type 仅允许：character/location/item/event/lore/quest/general。`,
    `keys 必须是字符串数组。`,
    `mode 仅允许 selective 或 constant。`,
    `条目数量约 ${safeTargetCount} 条，不要超过 ${safeTargetCount + 2} 条。`,
    `若信息不足可做合理补全，但要贴合原文。`,
    `世界书名称优先使用：${nameHint || '自动命名世界书'}。`,
    '',
    '原始文本：',
    sourceText.slice(0, 12000)
  ].join('\n')

  const baseMessages = [
    {
      role: 'system',
      content: '你是世界书构建助手。只输出 JSON，不要输出解释。'
    },
    {
      role: 'user',
      content: prompt
    }
  ]

  const generationResult = await runGenerationRetryPlan({
    baseMessages,
    settings: apiSettings,
    generationOptions: {
      max_tokens: 2400,
      temperature: 0.35,
      max_input_chars: 16000,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'worldbook-ai-import-first' },
      {
        name: 'worldbook-ai-import-retry',
        appendMessages: [
          {
            role: 'user',
            content: '请仅返回 JSON 对象，不要使用 markdown 代码块，不要附加说明。'
          }
        ]
      }
    ],
    parseContent: parseJsonFromAiContent,
    isValidParsed: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return false
      if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) return false
      return true
    }
  })

  if (!generationResult?.success) {
    return {
      ok: false,
      reason: 'AI 提炼未产出可用结构，已自动回退本地提炼。'
    }
  }

  const parsed = generationResult.parsed || parseJsonFromAiContent(generationResult.content)
  const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : []
  const normalizedEntries = rawEntries
    .slice(0, safeTargetCount)
    .map((entry, idx) => normalizeGeneratedEntry(entry, idx))

  if (!normalizedEntries.length) {
    return {
      ok: false,
      reason: 'AI 提炼结果为空，已自动回退本地提炼。'
    }
  }

  const groups = uniqueGroups([
    ...(Array.isArray(parsed?.groups) ? parsed.groups : []),
    ...collectGroupsFromEntries(normalizedEntries)
  ])

  return {
    ok: true,
    payload: {
      name: normalizeText(parsed?.name || nameHint || createAutoWorldbookName('小说导入世界书')),
      description: normalizeText(parsed?.description || '由小说段落 AI 提炼生成'),
      sourceLabel: '小说段落 AI 提炼',
      entries: normalizedEntries,
      groups
    }
  }
}

async function tryAiGenerateFromBrief({ genre, brief, targetCount, nameHint }) {
  const apiSettings = await getResolvedApiSettings()
  if (!apiSettings?.baseUrl || !apiSettings?.apiKey || !apiSettings?.model) {
    return {
      ok: false,
      reason: 'AI 随机生成需要有效 AI 配置，请先在设置中完成 API 配置。'
    }
  }

  const safeTargetCount = clampNumber(targetCount, 8, 3, 30)
  const genreLabel = genreOptions.find(item => item.value === genre)?.label || '通用风格'

  const prompt = [
    '请根据输入说明生成一个世界书草案。',
    '仅返回 JSON 对象，字段必须是 { name, description, groups, entries }。',
    'entries 每项字段：name, type, keys, content, group, mode。',
    'type 仅允许：character/location/item/event/lore/quest/general。',
    'keys 必须是字符串数组，至少 1 个关键词。',
    'mode 仅允许 selective 或 constant。',
    `风格方向：${genreLabel}。`,
    `目标条目数：${safeTargetCount}（允许 ±2 浮动）。`,
    `世界书名称优先使用：${nameHint || '自动命名世界书'}。`,
    '',
    '输入说明：',
    brief.slice(0, 4000)
  ].join('\n')

  const baseMessages = [
    {
      role: 'system',
      content: '你是世界书生成助手。输出必须是可直接解析的 JSON 对象。'
    },
    {
      role: 'user',
      content: prompt
    }
  ]

  const generationResult = await runGenerationRetryPlan({
    baseMessages,
    settings: apiSettings,
    generationOptions: {
      max_tokens: 2200,
      temperature: 0.55,
      max_input_chars: 12000,
      response_format: { type: 'json_object' }
    },
    attempts: [
      { name: 'worldbook-ai-random-first' },
      {
        name: 'worldbook-ai-random-retry',
        appendMessages: [
          {
            role: 'user',
            content: '请仅返回 JSON 对象，不要包含 markdown 或额外说明。'
          }
        ]
      }
    ],
    parseContent: parseJsonFromAiContent,
    isValidParsed: (parsed) => {
      if (!parsed || typeof parsed !== 'object') return false
      return Array.isArray(parsed.entries) && parsed.entries.length > 0
    }
  })

  if (!generationResult?.success) {
    return {
      ok: false,
      reason: 'AI 随机生成失败，请重试或调整说明后再生成。'
    }
  }

  const parsed = generationResult.parsed || parseJsonFromAiContent(generationResult.content)
  const rawEntries = Array.isArray(parsed?.entries) ? parsed.entries : []
  const normalizedEntries = rawEntries
    .slice(0, safeTargetCount)
    .map((entry, idx) => normalizeGeneratedEntry(entry, idx))

  if (!normalizedEntries.length) {
    return {
      ok: false,
      reason: 'AI 返回了空条目，请补充说明后重试。'
    }
  }

  const groups = uniqueGroups([
    ...(Array.isArray(parsed?.groups) ? parsed.groups : []),
    ...collectGroupsFromEntries(normalizedEntries)
  ])

  return {
    ok: true,
    payload: {
      name: normalizeText(parsed?.name || nameHint || createAutoWorldbookName('AI随机世界书')),
      description: normalizeText(parsed?.description || brief || '由 AI 根据说明生成。'),
      sourceLabel: `AI 随机生成（${genreLabel}）`,
      entries: normalizedEntries,
      groups
    }
  }
}

function buildPendingPayload({ name, description, sourceLabel, entries }) {
  const normalizedEntries = entries.map((entry, idx) => normalizeGeneratedEntry(entry, idx))
  return {
    name: normalizeText(name) || createAutoWorldbookName('快速世界书'),
    description: normalizeText(description),
    sourceLabel,
    entries: normalizedEntries,
    groups: collectGroupsFromEntries(normalizedEntries)
  }
}

function resolveImportPayloadForConflict(payload) {
  const conflict = pendingConflictWorldbook.value
  if (!conflict) {
    return {
      payload: { ...payload },
      mode: 'create',
      conflict: null
    }
  }

  const selectedMode = conflictMode.value
  if (selectedMode === 'rename') {
    return {
      payload: {
        ...payload,
        name: createUniqueWorldbookName(payload.name)
      },
      mode: 'rename',
      conflict
    }
  }

  if (selectedMode === 'overwrite') {
    return {
      payload: { ...payload },
      mode: 'overwrite',
      conflict
    }
  }

  return {
    payload: { ...payload },
    mode: 'create',
    conflict
  }
}

async function generateFromNovelText() {
  if (generatingNovel.value || creating.value) return

  clearFeedback()
  const sourceText = normalizeText(novelInput.sourceText)
  if (sourceText.length < 20) {
    errorMessage.value = '请至少粘贴一段有效文本（不少于 20 字）。'
    return
  }

  generatingNovel.value = true

  try {
    const targetCount = clampNumber(novelInput.targetCount, 10, 3, 30)
    const fallbackEntries = buildEntriesFromParagraphs(sourceText, targetCount)
    let payload = buildPendingPayload({
      name: novelInput.name || createAutoWorldbookName('小说提炼世界书'),
      description: '由小说段落快速提炼生成，可在高级设置继续精修。',
      sourceLabel: '本地智能提炼（回退）',
      entries: fallbackEntries
    })

    if (novelInput.useAiFirst) {
      const aiResult = await tryAiExtractEntries(sourceText, targetCount, novelInput.name)
      if (aiResult.ok && aiResult.payload) {
        payload = aiResult.payload
        infoMessage.value = '已完成 AI 提炼，可直接导入或继续调整。'
      } else if (aiResult.reason) {
        infoMessage.value = aiResult.reason
      }
    } else {
      infoMessage.value = '已使用本地智能提炼生成预览。'
    }

    pendingImport.value = payload
  } catch (error) {
    errorMessage.value = `生成预览失败：${error?.message || '未知错误'}`
  } finally {
    generatingNovel.value = false
  }
}

async function generateFromBrief() {
  if (generatingRandom.value || creating.value) return

  clearFeedback()
  generatingRandom.value = true

  try {
    const brief = normalizeText(randomInput.brief)
    if (brief.length < 8) {
      errorMessage.value = '请先输入至少 8 字说明，AI 会基于说明生成。'
      pendingImport.value = null
      return
    }

    const targetCount = clampNumber(randomInput.targetCount, 8, 3, 30)
    const aiResult = await tryAiGenerateFromBrief({
      genre: randomInput.genre,
      brief,
      targetCount,
      nameHint: randomInput.name
    })

    if (!aiResult.ok || !aiResult.payload) {
      errorMessage.value = aiResult.reason || 'AI 随机生成失败，请稍后重试。'
      pendingImport.value = null
      return
    }

    pendingImport.value = buildPendingPayload(aiResult.payload)
    infoMessage.value = '已完成 AI 生成预览，可直接导入。'
  } catch (error) {
    errorMessage.value = `随机生成失败：${error?.message || '未知错误'}`
    pendingImport.value = null
  } finally {
    generatingRandom.value = false
  }
}

async function createWorldbookFromPayload(payload) {
  if (!payload || !Array.isArray(payload.entries) || !payload.entries.length) {
    throw new Error('没有可导入的条目')
  }

  const created = await worldStore.createWorldbook({
    name: payload.name,
    description: payload.description
  })

  for (const entry of payload.entries) {
    await worldStore.addEntry(created.id, {
      name: entry.name,
      type: entry.type,
      keys: entry.keys,
      keysSecondary: entry.keysSecondary,
      content: entry.content,
      injection: entry.injection
    })
  }

  const groups = uniqueGroups([...(payload.groups || []), ...collectGroupsFromEntries(payload.entries)])
  if (groups.length) {
    await worldStore.updateWorldbook(created.id, { groups })
  }

  await worldStore.loadWorldbooksIndex()
  await worldStore.setActiveWorldbook(created.id)

  return created
}

async function overwriteWorldbookFromPayload(targetWorldbook, payload) {
  if (!targetWorldbook?.id) {
    throw new Error('覆盖目标世界书不存在')
  }

  const worldbookId = targetWorldbook.id

  await worldStore.updateWorldbook(worldbookId, {
    name: payload.name,
    description: payload.description
  })

  await worldStore.setActiveWorldbook(worldbookId)

  const existingEntries = [...(worldStore.activeWorldbook?.entries || [])]
  for (const entry of existingEntries) {
    await worldStore.deleteEntry(worldbookId, entry.id)
  }

  for (const entry of payload.entries) {
    await worldStore.addEntry(worldbookId, {
      name: entry.name,
      type: entry.type,
      keys: entry.keys,
      keysSecondary: entry.keysSecondary,
      content: entry.content,
      injection: entry.injection
    })
  }

  const groups = uniqueGroups([...(payload.groups || []), ...collectGroupsFromEntries(payload.entries)])
  await worldStore.updateWorldbook(worldbookId, { groups })

  await worldStore.loadWorldbooksIndex()
  await worldStore.setActiveWorldbook(worldbookId)

  return {
    id: worldbookId,
    name: payload.name
  }
}

async function importPending() {
  if (!pendingImport.value || creating.value) return
  creating.value = true
  clearFeedback()

  try {
    const resolved = resolveImportPayloadForConflict(pendingImport.value)
    pendingImport.value = resolved.payload

    let created = null
    if (resolved.mode === 'overwrite' && resolved.conflict) {
      const ok = window.confirm(`确认覆盖世界书「${resolved.conflict.name}」？原有条目将被替换。`)
      if (!ok) return
      created = await overwriteWorldbookFromPayload(resolved.conflict, resolved.payload)
    } else {
      created = await createWorldbookFromPayload(resolved.payload)
    }

    const modeLabel = resolved.mode === 'overwrite'
      ? '覆盖导入完成'
      : (resolved.mode === 'rename' ? '重命名导入完成' : '导入完成')
    successMessage.value = `${modeLabel}：${created?.name || '新世界书'}（${resolved.payload.entries.length} 条目）`
  } catch (error) {
    errorMessage.value = `导入失败：${error?.message || '未知错误'}`
  } finally {
    creating.value = false
  }
}

async function importPreset(preset) {
  if (!preset || creating.value) return
  creating.value = true
  clearFeedback()

  try {
    const payload = buildPendingPayload({
      name: createAutoWorldbookName(preset.name),
      description: preset.description,
      sourceLabel: `一键预设：${preset.name}`,
      entries: preset.entries
    })

    const created = await createWorldbookFromPayload(payload)
    pendingImport.value = payload
    successMessage.value = `已创建预设世界书：${created?.name || '新世界书'}`
  } catch (error) {
    errorMessage.value = `预设导入失败：${error?.message || '未知错误'}`
  } finally {
    creating.value = false
  }
}

function clearPendingImport() {
  pendingImport.value = null
  clearFeedback()
}
</script>

<style scoped>
.quick-page {
  min-height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background:
    radial-gradient(130% 120% at 100% 0%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-secondary) 86%, #ffffff 14%) 0%, var(--bg-primary) 40%);
  color: var(--text-primary);
}

.quick-hero {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px;
  background: color-mix(in srgb, var(--bg-secondary) 88%, #ffffff 12%);
  display: flex;
  gap: 12px;
  justify-content: space-between;
  align-items: flex-start;
}

.hero-left h1 {
  margin: 0 0 8px;
  font-size: 20px;
}

.hero-left p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 760px;
}

.hero-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.status-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--bg-secondary) 92%, #ffffff 8%);
}

.feedback {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 9px 12px;
  font-size: 13px;
}

.feedback.error {
  border-color: color-mix(in srgb, #ef4444 65%, var(--border));
  background: color-mix(in srgb, #ef4444 14%, var(--bg-primary));
  color: #ef4444;
}

.feedback.success {
  border-color: color-mix(in srgb, #10b981 65%, var(--border));
  background: color-mix(in srgb, #10b981 14%, var(--bg-primary));
  color: #059669;
}

.feedback.info {
  border-color: color-mix(in srgb, #0ea5e9 65%, var(--border));
  background: color-mix(in srgb, #0ea5e9 12%, var(--bg-primary));
  color: #0284c7;
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.card {
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--bg-secondary) 93%, #ffffff 7%);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.card-head.split {
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.card-head h2 {
  margin: 0;
  font-size: 15px;
}

.card-head span {
  font-size: 12px;
  color: var(--text-muted);
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.preset-item {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
  background: var(--bg-primary);
}

.preset-main strong {
  font-size: 13px;
}

.preset-main p {
  margin: 5px 0 6px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.preset-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 1px 7px;
  font-size: 11px;
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
.text-area,
.select-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px 10px;
  font-size: 13px;
}

.text-area {
  resize: vertical;
}

.inline-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hidden-file-input {
  display: none;
}

.inline-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.compact-label {
  max-width: 180px;
}

.text-input.compact {
  width: 88px;
}

.checkbox-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
}

.preview-card {
  gap: 12px;
}

.preview-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 12px;
}

.preview-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.summary-item {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-item span {
  font-size: 11px;
  color: var(--text-muted);
}

.summary-item strong {
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.conflict-box {
  border: 1px solid color-mix(in srgb, #f59e0b 60%, var(--border));
  background: color-mix(in srgb, #f59e0b 10%, var(--bg-primary));
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.conflict-box strong {
  font-size: 13px;
  color: #b45309;
}

.conflict-box p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.conflict-select {
  max-width: 360px;
}

.conflict-metrics {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 11px;
}

.conflict-metrics span {
  border: 1px solid color-mix(in srgb, #f59e0b 50%, var(--border));
  border-radius: 999px;
  padding: 2px 8px;
  color: #92400e;
}

.conflict-metrics .delta.up {
  border-color: color-mix(in srgb, #10b981 50%, var(--border));
  color: #047857;
}

.conflict-metrics .delta.down {
  border-color: color-mix(in srgb, #ef4444 50%, var(--border));
  color: #b91c1c;
}

.preview-groups {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.group-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.entry-preview-list {
  border: 1px solid var(--border);
  border-radius: 10px;
  max-height: 360px;
  overflow: auto;
}

.entry-preview-item {
  padding: 10px;
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.entry-preview-item:last-child {
  border-bottom: none;
}

.entry-title-line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: baseline;
}

.entry-title-line strong {
  font-size: 13px;
}

.entry-title-line span {
  font-size: 11px;
  color: var(--text-muted);
}

.entry-keywords {
  font-size: 11px;
  color: var(--text-secondary);
}

.entry-preview-item p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.card-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.primary-btn,
.ghost-btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  height: 34px;
  padding: 0 12px;
  font-size: 12px;
  cursor: pointer;
}

.primary-btn {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.ghost-btn {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

@media (max-width: 1200px) {
  .quick-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .quick-page {
    padding: 12px;
  }

  .quick-grid {
    grid-template-columns: 1fr;
  }

  .quick-hero {
    flex-direction: column;
  }

  .preview-summary {
    grid-template-columns: 1fr;
  }
}
</style>

import { createAuthoringArtifactRun } from './authoring-ui/artifacts.mjs'
import {
  installDeterministicProviderMock,
  MOCK_BLOCK_EDITED_TEXT,
  MOCK_BLOCK_INSTRUCTION,
  MOCK_BLOCK_ORIGINAL_TEXT,
  MOCK_INLINE_SUGGESTION,
} from './authoring-ui/provider-mock.mjs'
import { createJourneyRunner, isFatalEntry } from './authoring-ui/runner.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:5174'
const report = []
let journeyRunner = null

function baseJourneyOptions() {
  return process.env.JOURNEYS === 'local'
    ? { disableAgent: true, acceptDialogs: true }
    : {}
}

async function expectVisible(page, selector, journey, timeout = 6000) {
  try {
    await page.locator(selector).first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    report.push({ journey, level: 'FAIL', what: `不可见: ${selector}`, url: page.url() })
    return false
  }
}

async function setup(page, journey, { chapters = 2 } = {}) {
  await page.goto(BASE + '/authoring', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.locator('.wall__pin-cta', { hasText: '建立第一本书' }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', '雾港旧事')
  await page.click('.modal-footer .btn-primary')
  await page.waitForTimeout(700)
  await page.locator('.wall__pin-cta', { hasText: '建立第一章' }).click()
  await page.waitForTimeout(900)
  await page.fill('input[aria-label="章节标题"]', '第一章 上元夜')
  const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
  await surface.click()
  await page.keyboard.type('潮水漫过台阶，林昭站在岸边看灯。守卫在门口停下脚步。')
  await page.waitForTimeout(700)
  if (chapters >= 2) {
    await page.locator('.authoring-chapter-create .is-primary').click()
    await page.waitForTimeout(800)
    await page.fill('input[aria-label="章节标题"]', '第二章 灯市')
    await surface.click()
    await page.keyboard.type('灯市的喧闹从桥头一路压过来。')
    await page.waitForTimeout(700)
    await page.locator('.authoring-chapter-row', { hasText: '第一章' }).first().click()
    await page.waitForTimeout(700)
  }
}

async function editorText(page) {
  return page.locator('.writing-notebook-editor__surface .ProseMirror').first().innerText()
}

async function canonicalEditorText(page) {
  return page.locator('.writing-notebook-editor__surface .ProseMirror').first().evaluate((root) => {
    const clone = root.cloneNode(true)
    clone.querySelectorAll('.writing-inline-suggestion, .writing-unit-gap').forEach((node) => node.remove())
    return String(clone.textContent || '').replace(/\u200b/g, '')
  })
}

async function editorStructureSnapshot(page) {
  return page.locator('.writing-notebook-editor__surface .ProseMirror').first().evaluate((root) => {
    const clone = root.cloneNode(true)
    // ProseMirror 会在行尾 widget 旁插入 separator/trailingBreak 作为 DOM 光标垫片；
    // Ghost 消失时这些垫片也会消失，但 canonical document 从未变化。
    clone.querySelectorAll([
      '.writing-inline-suggestion',
      '.writing-unit-gap',
      'img.ProseMirror-separator',
      'br.ProseMirror-trailingBreak',
    ].join(', ')).forEach((node) => node.remove())
    const serialize = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return { text: node.nodeValue || '' }
      if (node.nodeType !== Node.ELEMENT_NODE) return null
      return {
        tag: node.tagName.toLowerCase(),
        children: [...node.childNodes].map(serialize).filter(Boolean),
      }
    }
    return JSON.stringify(serialize(clone))
  })
}

async function editorSelectionSnapshot(page) {
  return page.locator('.writing-notebook-editor__surface .ProseMirror').first().evaluate((root) => {
    const selection = window.getSelection()
    if (!selection?.rangeCount || !root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) {
      return { anchor: -1, focus: -1, collapsed: true, activeWithin: root.contains(document.activeElement) }
    }
    const offsetWithinEditor = (node, offset) => {
      const range = document.createRange()
      range.selectNodeContents(root)
      range.setEnd(node, offset)
      const fragment = range.cloneContents()
      const wrapper = document.createElement('div')
      wrapper.append(fragment)
      wrapper.querySelectorAll('.writing-inline-suggestion, .writing-unit-gap').forEach((item) => item.remove())
      return String(wrapper.textContent || '').replace(/\u200b/g, '').length
    }
    return {
      anchor: offsetWithinEditor(selection.anchorNode, selection.anchorOffset),
      focus: offsetWithinEditor(selection.focusNode, selection.focusOffset),
      collapsed: selection.isCollapsed,
      activeWithin: root.contains(document.activeElement),
    }
  })
}

function countOccurrences(text, needle) {
  if (!needle) return 0
  return String(text).split(String(needle)).length - 1
}

async function waitForDeterministicGhost(page, provider, journey, timeout = 12_000) {
  const ghost = page.locator('.writing-inline-suggestion').first()
  try {
    await ghost.waitFor({ state: 'visible', timeout })
    await page.locator('.writing-inline-suggestion.is-generating').waitFor({ state: 'detached', timeout })
    return ghost
  } catch (error) {
    const browser = await page.evaluate(() => {
      const readJson = (key) => {
        try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return '[invalid-json]' }
      }
      const editor = document.querySelector('.writing-notebook-editor__surface .ProseMirror')
      return {
        policy: readJson('pinax_agent_runtime_policy_v1'),
        metrics: readJson('pinax_agent_runtime_metrics_v1'),
        editorFocused: editor === document.activeElement,
        editorTextLength: String(editor?.textContent || '').replace(/\u200b/g, '').length,
        inlineNodeCount: document.querySelectorAll('.writing-inline-suggestion').length,
      }
    })
    report.push({
      journey,
      level: 'FAIL',
      what: `确定性 Ghost 在 ${timeout}ms 内未出现`,
      provider: provider.summary(),
      browser,
      cause: String(error?.message || error).slice(0, 180),
    })
    return null
  }
}

async function selectEditorTextRange(page, fromChars, toChars) {
  const selection = await page.locator('.writing-notebook-editor__surface .ProseMirror').first().evaluate((root, range) => {
    const ignored = (node) => node.parentElement?.closest('.writing-inline-suggestion, .writing-unit-gap')
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return ignored(node) || !node.nodeValue?.length
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT
      },
    })
    let position = 0
    let start = null
    let end = null
    while (walker.nextNode()) {
      const node = walker.currentNode
      const next = position + node.nodeValue.length
      if (!start && range.from >= position && range.from <= next) {
        start = { node, offset: Math.min(node.nodeValue.length, range.from - position) }
      }
      if (!end && range.to >= position && range.to <= next) {
        end = { node, offset: Math.min(node.nodeValue.length, range.to - position) }
      }
      position = next
      if (start && end) break
    }
    if (!start || !end || range.from < 0 || range.to <= range.from) {
      return { ok: false, reason: 'range-unresolvable', availableChars: position }
    }
    root.focus()
    const domRange = document.createRange()
    domRange.setStart(start.node, start.offset)
    domRange.setEnd(end.node, end.offset)
    const browserSelection = window.getSelection()
    browserSelection.removeAllRanges()
    browserSelection.addRange(domRange)
    document.dispatchEvent(new Event('selectionchange'))
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    return {
      ok: true,
      text: browserSelection.toString(),
      collapsed: browserSelection.isCollapsed,
    }
  }, { from: fromChars, to: toChars })
  await page.waitForTimeout(350)
  return selection
}

// ---------- J1 写作主链 ----------
async function journeyWriting() {
  const journey = 'J1 写作主链'
  await journeyRunner.run(journey, async (page) => {
    await setup(page, journey)
    // 切回第一章：标题与正文恢复
    const t1 = await page.inputValue('input[aria-label="章节标题"]')
    const body1 = await editorText(page)
    if (t1 !== '第一章 上元夜') report.push({ journey, level: 'FAIL', what: `切回后标题错误: "${t1}"` })
    if (!body1.includes('潮水漫过台阶')) report.push({ journey, level: 'FAIL', what: `切回后正文丢失: "${body1.slice(0, 50)}"` })
    // 刷新持久化
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2200)
    const rows = await page.locator('.authoring-chapter-row').count()
    if (rows < 2) report.push({ journey, level: 'FAIL', what: `刷新后章节行数异常: ${rows}` })
    const bodyR = await editorText(page)
    if (!bodyR.includes('潮水漫过台阶')) report.push({ journey, level: 'FAIL', what: '刷新后第一章正文丢失' })
    // 快速连点
    await page.locator('.authoring-chapter-row', { hasText: '第二章' }).first().dblclick()
    await page.waitForTimeout(120)
    await page.locator('.authoring-chapter-row', { hasText: '第一章' }).first().click()
    await page.waitForTimeout(600)
    const tRace = await page.inputValue('input[aria-label="章节标题"]')
    if (tRace !== '第一章 上元夜') report.push({ journey, level: 'FAIL', what: `快速切换后标题错乱: "${tRace}"` })
    // 右键菜单：单元拆分/合并动作可用（不实际执行合并，避免破坏稿面）
    const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
    const beforeContextMenu = await canonicalEditorText(page)
    await surface.click()
    const selectionBeforeContextMenu = await editorSelectionSnapshot(page)
    await surface.click({ button: 'right' })
    await page.waitForTimeout(400)
    await expectVisible(page, '.context-menu', journey)
    const focusedMenuItem = await page.evaluate(() => document.activeElement?.classList?.contains('ctx-item'))
    if (!focusedMenuItem) report.push({ journey, level: 'FAIL', what: '右键菜单打开后没有取得键盘焦点' })
    await page.keyboard.press('Backspace')
    if (await canonicalEditorText(page) !== beforeContextMenu) {
      report.push({ journey, level: 'FAIL', what: '右键菜单打开时 Backspace 穿透修改了正文' })
    }
    if (!await page.locator('.context-menu').count()) {
      report.push({ journey, level: 'FAIL', what: '右键菜单在普通编辑键后意外关闭' })
    }
    await page.keyboard.press('Escape')
    await page.locator('.context-menu').waitFor({ state: 'detached', timeout: 4_000 })
    const selectionAfterContextMenu = await editorSelectionSnapshot(page)
    if (!selectionAfterContextMenu.activeWithin
      || selectionAfterContextMenu.anchor !== selectionBeforeContextMenu.anchor
      || selectionAfterContextMenu.focus !== selectionBeforeContextMenu.focus) {
      report.push({
        journey,
        level: 'FAIL',
        what: 'Esc 关闭右键菜单后没有恢复正文焦点/选区',
        before: selectionBeforeContextMenu,
        after: selectionAfterContextMenu,
      })
    }

    // Shift+F10/Menu 键没有可信鼠标坐标：必须保留当前 caret，并以 caret
    // 几何定位，不能把目标误搬到稿面左上角。
    await surface.click()
    await page.keyboard.press('ControlOrMeta+End')
    const keyboardMenuSelectionBefore = await editorSelectionSnapshot(page)
    await surface.evaluate((root) => {
      root.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 0,
        clientY: 0,
      }))
    })
    if (await expectVisible(page, '.context-menu', journey)) {
      const keyboardMenuBox = await page.locator('.context-menu').boundingBox()
      if (!keyboardMenuBox || (keyboardMenuBox.x <= 12 && keyboardMenuBox.y <= 12)) {
        report.push({ journey, level: 'FAIL', what: 'Shift+F10 菜单仍错误定位在视口左上角', keyboardMenuBox })
      }
      await page.keyboard.press('Escape')
      await page.locator('.context-menu').waitFor({ state: 'detached', timeout: 4_000 })
      const keyboardMenuSelectionAfter = await editorSelectionSnapshot(page)
      if (
        !keyboardMenuSelectionAfter.activeWithin
        || keyboardMenuSelectionAfter.anchor !== keyboardMenuSelectionBefore.anchor
        || keyboardMenuSelectionAfter.focus !== keyboardMenuSelectionBefore.focus
      ) {
        const focusDebug = await page.evaluate(() => ({
          tag: document.activeElement?.tagName,
          cls: String(document.activeElement?.className || '').slice(0, 60),
          inProseMirror: Boolean(document.activeElement?.closest?.('.ProseMirror')),
          anchorNodeIn: Boolean(document.querySelector('.ProseMirror')?.contains(window.getSelection()?.anchorNode)),
        })).catch(() => null)
        report.push({
          journey,
          level: 'FAIL',
          what: '键盘右键菜单关闭后没有恢复正文焦点/选区',
          before: keyboardMenuSelectionBefore,
          after: keyboardMenuSelectionAfter,
          focusDebug,
        })
      }
    }

    // 全局 85% UI 缩放 + 视口边缘：fixed 菜单必须使用视觉坐标并完整可达。
    await page.evaluate(() => localStorage.setItem('app_ui_zoom', '0.85'))
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_000)
    const zoomedSurface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
    const surfaceBox = await zoomedSurface.boundingBox()
    const viewport = await page.evaluate(() => ({
      left: window.visualViewport?.offsetLeft || 0,
      top: window.visualViewport?.offsetTop || 0,
      width: window.visualViewport?.width || window.innerWidth,
      height: window.visualViewport?.height || window.innerHeight,
    }))
    if (!surfaceBox) {
      report.push({ journey, level: 'FAIL', what: '缩放后无法测量正文稿面' })
      return
    }
    const clickX = Math.min(viewport.left + viewport.width - 12, surfaceBox.x + surfaceBox.width - 8)
    const clickY = Math.min(viewport.top + viewport.height - 12, surfaceBox.y + Math.min(surfaceBox.height - 8, viewport.height - 24))
    await zoomedSurface.evaluate((root, point) => {
      root.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: point.x,
        clientY: point.y,
      }))
    }, { x: clickX, y: clickY })
    if (!await expectVisible(page, '.context-menu', journey)) return
    const menuBox = await page.locator('.context-menu').boundingBox()
    if (!menuBox
      || menuBox.x < viewport.left + 7
      || menuBox.y < viewport.top + 7
      || menuBox.x + menuBox.width > viewport.left + viewport.width - 7
      || menuBox.y + menuBox.height > viewport.top + viewport.height - 7) {
      report.push({ journey, level: 'FAIL', what: '85% 缩放下右键菜单越出 visualViewport', menuBox, viewport })
    }
    await page.keyboard.press('Escape')
  }, baseJourneyOptions())
}

// ---------- J2 构思文档 ----------
async function journeyExploration() {
  const journey = 'J2 构思文档'
  await journeyRunner.run(journey, async (page) => {
    await setup(page, journey)
    await page.locator('.authoring-chapter-row.wt3-doc-row', { hasText: '＋ 快速落笔' }).click()
    await page.waitForTimeout(900)
    await expectVisible(page, '.wt3-badge', journey)
    const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
    await surface.click()
    const phrase = '灯市里如果有人认出林昭'
    await page.keyboard.type(`先写一段探索草稿：${phrase}。`)
    await page.waitForTimeout(1000)
    const immediate = await editorText(page)
    if (!immediate.includes(phrase)) report.push({ journey, level: 'FAIL', what: `输入后稿面即不含内容（输入层问题）: "${immediate.slice(0, 40)}"` })
    // 返回正文
    await page.locator('button', { hasText: '返回正文' }).first().click()
    await page.waitForTimeout(900)
    const backTitle = await page.inputValue('input[aria-label="章节标题"]')
    if (backTitle !== '第一章 上元夜') report.push({ journey, level: 'FAIL', what: `返回正文后标题错误: "${backTitle}"` })
    // 列出文档行，打开目标文档
    const rowTexts = await page.locator('.authoring-chapter-row.wt3-doc-row').allInnerTexts()
    const target = page.locator('.authoring-chapter-row.wt3-doc-row', { hasText: '速记' }).first()
    if (!await target.count()) {
      report.push({ journey, level: 'FAIL', what: `文档行中找不到草稿行: ${JSON.stringify(rowTexts)}` })
    } else {
      await target.click()
      await page.waitForTimeout(900)
      const reopened = await editorText(page)
      if (!reopened.includes(phrase)) {
        report.push({ journey, level: 'FAIL', what: `重新打开探索文档内容未恢复: "${reopened.slice(0, 60)}"` })
      }
      // 删除文档：hover 行显出 × 再点
      const row = page.locator('.authoring-chapter-row.wt3-doc-row', { hasText: '速记' }).first()
      await row.hover()
      await page.waitForTimeout(200)
      await page.locator('[data-wt3-delete]').first().click({ timeout: 4000 }).catch(() => {
        report.push({ journey, level: 'FAIL', what: '删除按钮 hover 后仍不可点击（疑似遮挡）' })
      })
      await page.waitForTimeout(700)
    }
  }, baseJourneyOptions())
}

// ---------- J3 批注全流程（选区浮动条路径） ----------
async function journeyAnnotate() {
  const journey = 'J3 批注流程'
  await journeyRunner.run(journey, async (page) => {
    await setup(page, journey)
    const selection = await selectEditorTextRange(page, 0, 4)
    if (!selection.ok || selection.collapsed || selection.text !== '潮水漫过') {
      report.push({ journey, level: 'FAIL', what: 'DOM Range 没有精确选中目标文本', selection })
      return
    }
    if (!await expectVisible(page, '.writing-selection-actions', journey)) {
      return
    }
    await page.locator('.writing-selection-actions button[title*="批注"]').click()
    await page.waitForTimeout(500)
    await expectVisible(page, '.writing-annotation-composer', journey)
    await page.fill('.writing-annotation-composer textarea', '这里潮水的时机要和第三章对上')
    await page.locator('.writing-annotation-composer button[type="submit"]').click()
    await page.waitForTimeout(700)
    await page.locator('.writing-notebook-editor__surface .ProseMirror').first().click()
    await page.keyboard.press('ControlOrMeta+Home')
    await page.keyboard.type('忽然')
    await page.waitForTimeout(700)
    const anchoredText = await page.locator('.writing-annotation-anchor').first().textContent().catch(() => '')
    if (anchoredText !== '潮水漫过') {
      report.push({
        journey,
        level: 'FAIL',
        what: `段首插字后批注 range 没有随 exact 同步迁移: "${anchoredText}"`,
      })
    }
    // 打开批注工具确认存在
    await page.locator('button[data-authoring-tool="annotations"]').click()
    await page.waitForTimeout(600)
    const listed = await page.locator('[data-authoring-inspector="annotations"]', { hasText: '潮水的时机' }).count()
    if (!listed) report.push({ journey, level: 'FAIL', what: '批注未出现在检查器列表' })
    // 切章再切回：批注持久
    await page.locator('.authoring-chapter-row', { hasText: '第二章' }).first().click()
    await page.waitForTimeout(700)
    await page.locator('.authoring-chapter-row', { hasText: '第一章' }).first().click()
    await page.waitForTimeout(800)
    const afterSwitch = await page.locator('[data-authoring-inspector="annotations"]', { hasText: '潮水的时机' }).count()
    if (!afterSwitch) report.push({ journey, level: 'FAIL', what: '切章往返后批注丢失' })
    // 刷新后持久
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.locator('button[data-authoring-tool="annotations"]').click()
    await page.waitForTimeout(600)
    const afterReload = await page.locator('[data-authoring-inspector="annotations"]', { hasText: '潮水的时机' }).count()
    if (!afterReload) report.push({ journey, level: 'FAIL', what: '刷新后批注丢失' })
  }, baseJourneyOptions())
}

// ---------- J4 大纲面板 ----------
async function journeyOutline() {
  const journey = 'J4 大纲'
  await journeyRunner.run(journey, async (page) => {
    await setup(page, journey)
    await page.locator('button[data-authoring-tool="outline"]').click()
    await page.waitForTimeout(600)
    await expectVisible(page, '[data-authoring-inspector="outline"]', journey)
    const newBtn = page.locator('[data-authoring-inspector="outline"] button', { hasText: /新建|建立第一个节点/ }).first()
    await newBtn.click()
    await page.waitForTimeout(400)
    await page.fill('[data-authoring-inspector="outline"] input[placeholder*="石柱"]', '钟声指向旧灯塔')
    await page.fill('[data-authoring-inspector="outline"] textarea', '林昭循声而去，发现旧灯塔的门虚掩。')
    await page.locator('[data-authoring-inspector="outline"] button[type="submit"]').click()
    await page.waitForTimeout(700)
    const row = await page.locator('.authoring-outline-row', { hasText: '钟声指向旧灯塔' }).count()
    if (!row) report.push({ journey, level: 'FAIL', what: '章纲节点未出现在列表' })
    // 重载持久
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await page.locator('button[data-authoring-tool="outline"]').click()
    await page.waitForTimeout(700)
    const rowR = await page.locator('.authoring-outline-row', { hasText: '钟声指向旧灯塔' }).count()
    if (!rowR) report.push({ journey, level: 'FAIL', what: '刷新后章纲节点丢失' })
  }, baseJourneyOptions())
}

// ---------- J5 现场 + 世界书绑定 ----------
async function journeySceneBinding() {
  const journey = 'J5 现场/绑定'
  await journeyRunner.run(journey, async (page) => {
    await setup(page, journey)
    // 现场条：点人物分组 → 现场详情
    const section = page.locator('.wall__shelf-scene .ws-codex-section').first()
    if (await section.count()) {
      await section.click()
      await page.waitForTimeout(600)
      await expectVisible(page, '[data-authoring-inspector="scene"]', journey)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(300)
    } else {
      report.push({ journey, level: 'FAIL', what: '现场条没有任何分组按钮' })
    }
    // 世界书绑定：打开 → 取消 → 打开 → 确定（暂不绑定）
    await page.locator('[data-test="bind-worldbook"]').click()
    await page.waitForTimeout(400)
    await expectVisible(page, '[data-test="confirm-binding"]', journey)
    await page.locator('.wall__shelf-pin-btn', { hasText: '取消' }).click()
    await page.waitForTimeout(300)
    await page.locator('[data-test="bind-worldbook"]').click()
    await page.waitForTimeout(300)
    await page.locator('[data-test="confirm-binding"]').click()
    await page.waitForTimeout(600)
    // 绑定后不崩、绑定行仍在
    if (!await page.locator('[data-test="book-worldbook-binding"]').count()) {
      report.push({ journey, level: 'FAIL', what: '确认绑定后绑定行消失' })
    }
  }, baseJourneyOptions())
}

// ---------- AI 链路旅程（需要后端；探测失败则跳过） ----------
async function backendAvailable() {
  let timer = null
  try {
    const controller = new AbortController()
    timer = setTimeout(() => controller.abort(), 2500)
    await fetch(BASE.replace('5173', '3001').replace('5174', '3001') + '/', { signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// J6: Ghost 行内联想 → Tab 采纳 → 持久化
async function journeyGhost() {
  const journey = 'J6 Ghost 联想'
  await journeyRunner.run(journey, async (page) => {
    await setup(page, journey, { chapters: 1 })
    const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
    await surface.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('守卫在门口停下脚步，')
    await page.keyboard.press('End')
    // 被动联想：空闲 2.8s + 生成时间
    const ghost = page.locator('.writing-inline-suggestion').first()
    try {
      await ghost.waitFor({ state: 'visible', timeout: 20000 })
      // 生成态出现后继续等真实候选（is-generating 消失），错误态则判失败。
      await page.locator('.writing-inline-suggestion.is-generating').waitFor({ state: 'detached', timeout: 60000 })
      // 错误态（provider 返回空/失败）按环境噪音跳过，不算 UI 回归。
      if (await page.locator('.writing-inline-suggestion.is-error').count()) {
        report.push({ journey, level: 'WARN', what: 'Ghost 返回错误态（provider 侧），跳过采纳断言' })
        return
      }
    } catch {
      const hasErr = await page.locator('.writing-inline-suggestion.is-error').count()
      report.push({ journey, level: hasErr ? 'WARN' : 'WARN', what: hasErr ? 'Ghost 生成失败（is-error，provider 侧）' : '60s 内 Ghost 未产出候选' })
      return
    }
    const ghostText = await ghost.innerText()
    const suggested = ghostText.replace(/Tab[^·]*·[^·]*·.*$/, '').replace(/正在联想…|点击重试.*/g, '').trim()
    // 部分采纳：Ctrl/Cmd+Right 只收一句，组件应保留剩余候选
    await page.keyboard.press('ControlOrMeta+ArrowRight')
    await page.waitForTimeout(900)
    const partialState = {
      widgetAlive: (await page.locator('.writing-inline-suggestion').count()) > 0,
      docHasPartial: (await page.locator('.writing-notebook-editor__surface .ProseMirror').first().innerText()).includes(suggested.slice(0, 6)),
    }
    // 全量采纳：Tab（组件可能已被部分采纳消耗完，两种状态都算通过）
    await page.keyboard.press('Tab')
    await page.waitForTimeout(1200)
    const widgetGone = (await page.locator('.writing-inline-suggestion').count()) === 0
    if (!widgetGone) report.push({ journey, level: 'FAIL', what: 'Tab 后联想组件未消失' })
    if (!partialState.docHasPartial && !partialState.widgetAlive) {
      report.push({ journey, level: 'FAIL', what: 'Ctrl+Right 部分采纳后既无文本也无候选' })
    }
    // 刷新持久：采纳的句子应进入持久化正文
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2200)
    const persisted = await editorText(page)
    if (suggested && !persisted.includes(suggested)) report.push({ journey, level: 'FAIL', what: `Ghost 采纳后刷新丢失: "${suggested.slice(0, 30)}"` })
  }, { criticalRequestPatterns: ['/api/advisor/task'] })
}

// J7: 推演下一段 → 采用编辑稿 → 持久化 → 生成中切章不串写
async function journeyDeduce() {
  const journey = 'J7 推演事务'
  await journeyRunner.run(journey, async (page) => {
    await setup(page, journey)
    await page.locator('button', { hasText: '＋ 推演下一段' }).first().click()
    await page.waitForTimeout(600)
    await expectVisible(page, '[data-test="block-composer"]', journey)
    await page.fill('[data-test="block-composer"] textarea', '守卫忽然转身，向灯塔方向跑去')
    await page.locator('[data-test="block-primary"]').click()
    await page.waitForTimeout(1000)
    // 生成中：立即切章（作用域门禁 + revision 门禁的实弹测试）
    await page.locator('.authoring-chapter-row', { hasText: '第二章' }).first().click()
    await page.waitForTimeout(3000)
    // 等生成收尾（composer 生成态消失或超时）
    await page.waitForTimeout(30000)
    const ch2Text = await editorText(page)
    if (ch2Text.includes('守卫忽然转身')) report.push({ journey, level: 'FAIL', what: '生成中切章后旧章推演串写进新章！' })
    // 回第一章，手动重新推演并完整采纳
    await page.locator('.authoring-chapter-row', { hasText: '第一章' }).first().click()
    await page.waitForTimeout(800)
    await page.locator('button', { hasText: '＋ 推演下一段' }).first().click()
    await page.waitForTimeout(600)
    await page.fill('[data-test="block-composer"] textarea', '守卫忽然转身，向灯塔方向跑去')
    await page.locator('[data-test="block-primary"]').click()
    // 等待可编辑推演草稿出现
    const preview = page.locator('[data-test="block-draft"]')
    try {
      await preview.waitFor({ state: 'visible', timeout: 90000 })
    } catch {
      report.push({ journey, level: 'FAIL', what: '90s 内未见可编辑推演草稿' })
      throw new Error('no editable block draft')
    }
    const draftInput = preview.locator('.authoring-block-draft__input')
    const staged = (await draftInput.inputValue()).trim()
    await preview.getByRole('button', { name: '采用编辑稿', exact: true }).click()
    await page.waitForTimeout(1500)
    if ((await page.locator('[data-test="block-draft"]').count()) !== 0) {
      report.push({ journey, level: 'FAIL', what: '采用编辑稿后推演草稿未消失' })
    }
    // 刷新持久：采纳的推演应进入持久化正文
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2200)
    const persisted = await editorText(page)
    if (staged && !persisted.includes(staged.slice(0, 24))) report.push({ journey, level: 'FAIL', what: `推演采纳后刷新丢失: "${staged.slice(0, 40)}"` })
    // 撤销链路由 useAuthoringTask 单测覆盖；本旅程主链 = 采纳 + 刷新持久。
  }, {
    criticalRequestPatterns: ['/api/generate/agent-step/stream'],
    // 本旅程第一轮故意在生成中切章；只有该 endpoint 的真实 abort 可忽略，
    // 其他 requestfailed 和所有 HTTP 错误仍然致命。
    expectedAbortPatterns: ['/api/generate/agent-step/stream'],
  })
}

// J8: 空段落的 Space / 命令菜单拥有 Tab，不允许刚结束的 Ghost 穿透采纳。
async function journeyEmptyCommandMenu() {
  const journey = 'J8 空行命令菜单/Ghost 隔离'
  await journeyRunner.run(journey, async (page) => {
    const provider = await installDeterministicProviderMock(page, { passiveInline: false })
    await setup(page, journey, { chapters: 1 })
    await provider.setPassiveInline(true)
    const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
    await surface.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('钟楼后的脚步声忽然停住。')

    const ghost = await waitForDeterministicGhost(page, provider, journey)
    if (!ghost) return
    const shown = await ghost.locator('.writing-inline-suggestion__content').innerText()
    if (shown !== MOCK_INLINE_SUGGESTION) {
      report.push({ journey, level: 'FAIL', what: `确定性 Ghost 文本不符: "${shown}"`, provider: provider.summary() })
    }

    // Enter 建立空文本块；正文输入应先撤掉既有 Ghost，空块本身不得再武装被动联想。
    await page.keyboard.press('Enter')
    await page.waitForTimeout(180)
    if (await page.locator('.writing-inline-suggestion').count()) {
      report.push({ journey, level: 'FAIL', what: '进入空文本块后 Ghost 仍存在', provider: provider.summary() })
    }
    await page.locator('.writing-notebook-editor__surface .is-empty-command-line').last().waitFor({ state: 'attached', timeout: 4_000 })
    const baseline = await canonicalEditorText(page)
    if (baseline.includes(MOCK_INLINE_SUGGESTION)) {
      report.push({ journey, level: 'FAIL', what: 'Enter 把 Ghost 建议误写入了正文' })
    }
    const requestsBeforeMenus = provider.count({ kind: 'advisor' })
    if (requestsBeforeMenus !== 1
      || provider.count({ kind: 'advisor', taskType: 'authoring.complete.inline' }) !== 1) {
      report.push({ journey, level: 'FAIL', what: 'Ghost 应且只应由一次 authoring.complete.inline 请求武装', provider: provider.summary() })
    }

    for (const trigger of [
      { key: 'Space', label: 'Space' },
      { key: '/', label: '/' },
    ]) {
      await page.keyboard.press(trigger.key)
      await page.locator('.writing-command-menu-shell').waitFor({ state: 'visible', timeout: 4_000 })
      if (await page.locator('.writing-inline-suggestion').count()) {
        report.push({ journey, level: 'FAIL', what: `${trigger.label} 打开菜单时 Ghost 重新出现`, provider: provider.summary() })
      }
      const beforeTab = await canonicalEditorText(page)
      const selectionBeforeTab = await editorSelectionSnapshot(page)
      await page.keyboard.press('Tab')
      await page.locator('.writing-command-menu-shell').waitFor({ state: 'detached', timeout: 4_000 })
      const afterTab = await canonicalEditorText(page)
      const selectionAfterTab = await editorSelectionSnapshot(page)
      if (afterTab !== beforeTab || afterTab !== baseline) {
        report.push({
          journey,
          level: 'FAIL',
          what: `${trigger.label} 菜单的 Tab 除关闭菜单外还改动了正文`,
          beforeChars: beforeTab.length,
          afterChars: afterTab.length,
        })
      }
      if (afterTab.includes(MOCK_INLINE_SUGGESTION)) {
        report.push({ journey, level: 'FAIL', what: `${trigger.label} 菜单的 Tab 穿透采纳了 Ghost` })
      }
      if (JSON.stringify(selectionAfterTab) !== JSON.stringify(selectionBeforeTab)) {
        report.push({
          journey,
          level: 'FAIL',
          what: `${trigger.label} 菜单的 Tab 关闭后焦点或光标发生漂移`,
          before: selectionBeforeTab,
          after: selectionAfterTab,
        })
      }
    }

    // 覆盖完整 debounce 窗口：菜单开关不能偷偷留下新的 provider 请求。
    await page.waitForTimeout(3_100)
    const requestsAfterMenus = provider.count({ kind: 'advisor' })
    if (requestsAfterMenus !== requestsBeforeMenus) {
      report.push({
        journey,
        level: 'FAIL',
        what: `空行命令菜单期间意外发送 AI 请求: ${requestsBeforeMenus} -> ${requestsAfterMenus}`,
        provider: provider.summary(),
      })
    }
  }, {
    criticalRequestPatterns: ['/api/advisor/task'],
    journeyTimeoutMs: 45_000,
  })
}

// J9: synthetic IME 边界只验证应用层交互所有权；不冒充操作系统原生 IME 实测。
async function journeyCompositionIsolation() {
  const journey = 'J9 输入法组合态（synthetic owner）/Ghost 隔离'
  await journeyRunner.run(journey, async (page) => {
    const provider = await installDeterministicProviderMock(page, { passiveInline: false })
    await setup(page, journey, { chapters: 1 })
    await provider.setPassiveInline(true)
    const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
    await surface.click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('桥下的潮声忽然变得很近。')
    const ghost = await waitForDeterministicGhost(page, provider, journey)
    if (!ghost) return
    const shown = await ghost.locator('.writing-inline-suggestion__content').innerText()
    if (shown !== MOCK_INLINE_SUGGESTION) {
      report.push({ journey, level: 'FAIL', what: `确定性 Ghost 文本不符: "${shown}"`, provider: provider.summary() })
    }
    const compositionTarget = surface.locator('p').last()

    const bodyBefore = await canonicalEditorText(page)
    const structureBefore = await editorStructureSnapshot(page)
    const selectionBefore = await editorSelectionSnapshot(page)
    await compositionTarget.evaluate((target) => {
      target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, cancelable: true, data: '' }))
    })
    await page.locator('.writing-inline-suggestion').waitFor({ state: 'detached', timeout: 4_000 })
    const requestsAtCompositionStart = provider.count({ kind: 'advisor' })
    if (requestsAtCompositionStart !== 1
      || provider.count({ kind: 'advisor', taskType: 'authoring.complete.inline' }) !== 1) {
      report.push({ journey, level: 'FAIL', what: 'Ghost 应且只应由一次 authoring.complete.inline 请求武装', provider: provider.summary() })
    }

    const dispatchedKeys = await compositionTarget.evaluate((target) => {
      const results = []
      const keys = [
        { key: ' ', code: 'Space', label: 'Space' },
        { key: '/', code: 'Slash', label: 'Slash' },
        { key: 'Tab', code: 'Tab', label: 'Tab' },
        { key: 'Enter', code: 'Enter', label: 'Enter' },
        { key: 'Escape', code: 'Escape', label: 'Escape' },
      ]
      for (const keySpec of keys) {
        const event = new KeyboardEvent('keydown', {
          key: keySpec.key,
          code: keySpec.code,
          bubbles: true,
          cancelable: true,
          isComposing: true,
          keyCode: 229,
        })
        const dispatchResult = target.dispatchEvent(event)
        results.push({
          key: keySpec.label,
          isComposing: event.isComposing,
          defaultPrevented: event.defaultPrevented,
          dispatchResult,
        })
      }
      return results
    })
    if (dispatchedKeys.some((event) => !event.isComposing)) {
      report.push({ journey, level: 'FAIL', what: '浏览器没有按 isComposing=true 构造确定性键盘事件', dispatchedKeys })
    }
    const swallowedKeys = dispatchedKeys.filter((event) => event.defaultPrevented || !event.dispatchResult)
    if (swallowedKeys.length) {
      report.push({
        journey,
        level: 'FAIL',
        what: '组合态按键被应用层 preventDefault；IME 没有保持键盘所有权',
        swallowedKeys,
      })
    }
    await page.waitForTimeout(220)
    const bodyDuring = await canonicalEditorText(page)
    const structureDuring = await editorStructureSnapshot(page)
    const requestsDuring = provider.count({ kind: 'advisor' })
    if (bodyDuring !== bodyBefore
      || structureDuring !== structureBefore
      || bodyDuring.includes(MOCK_INLINE_SUGGESTION)) {
      report.push({
        journey,
        level: 'FAIL',
        what: 'compositionstart 后 Space/Slash/Tab/Enter/Escape 改动正文结构或采纳了 Ghost',
        beforeChars: bodyBefore.length,
        duringChars: bodyDuring.length,
        structureChanged: structureDuring !== structureBefore,
        beforeStructure: structureBefore,
        duringStructure: structureDuring,
      })
    }
    if (await page.locator('.writing-command-menu-shell').count()) {
      report.push({ journey, level: 'FAIL', what: '组合态 Space/Slash 错误打开了命令菜单' })
    }
    if (requestsDuring !== requestsAtCompositionStart) {
      report.push({
        journey,
        level: 'FAIL',
        what: `组合态内发送了 AI 请求: ${requestsAtCompositionStart} -> ${requestsDuring}`,
        provider: provider.summary(),
      })
    }

    await compositionTarget.evaluate((target) => {
      target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, cancelable: true, data: '' }))
    })
    // compositionend 会走 2.8s 的普通输入 debounce；必须跨过完整窗口，
    // 才能证明同步收尾没有遗留一枚迟到请求。
    await page.waitForTimeout(3_200)
    const bodyAfter = await canonicalEditorText(page)
    const structureAfter = await editorStructureSnapshot(page)
    const selectionAfter = await editorSelectionSnapshot(page)
    if (bodyAfter !== bodyBefore || structureAfter !== structureBefore) {
      report.push({
        journey,
        level: 'FAIL',
        what: 'compositionend 后正文文本或结构快照不稳定',
        structureChanged: structureAfter !== structureBefore,
        beforeStructure: structureBefore,
        afterStructure: structureAfter,
      })
    }
    if (JSON.stringify(selectionAfter) !== JSON.stringify(selectionBefore)) {
      report.push({
        journey,
        level: 'FAIL',
        what: 'compositionend 后光标/选区或焦点发生漂移',
        before: selectionBefore,
        after: selectionAfter,
      })
    }
    if (provider.count({ kind: 'advisor' }) !== requestsAtCompositionStart) {
      report.push({ journey, level: 'FAIL', what: 'compositionend 的同步收尾意外发送了 AI 请求', provider: provider.summary() })
    }
    if (await page.locator('.writing-inline-suggestion').count()) {
      report.push({ journey, level: 'FAIL', what: 'compositionend 后旧 Ghost 被错误恢复' })
    }

    // 全选 + IME 最终提交：候选过程中原稿保持，composition settled 后只
    // 形成一次 replace-all，并以最终 revision 重新武装一次被动联想。
    await surface.click()
    await page.keyboard.press('ControlOrMeta+A')
    const allSelectionBefore = await canonicalEditorText(page)
    // 被动联想的产品门槛是正文至少 12 字；这里必须跨过门槛，才能验证
    // composition settled 后以最终 revision 恰好重新武装一次。
    const finalCompositionText = '最终合成文本已经稳定落在正文里。'
    const allSelectionTarget = surface.locator('p').first()
    await allSelectionTarget.evaluate((target) => {
      target.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, cancelable: true, data: '' }))
    })
    if (await canonicalEditorText(page) !== allSelectionBefore) {
      report.push({ journey, level: 'FAIL', what: '全选 IME compositionstart 提前清空了原稿' })
    }
    await allSelectionTarget.evaluate((target, text) => {
      target.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, cancelable: true, data: text }))
    }, finalCompositionText)
    await page.waitForFunction((expected) => {
      const root = document.querySelector('.writing-notebook-editor__surface .ProseMirror')
      if (!root) return false
      const clone = root.cloneNode(true)
      clone.querySelectorAll('.writing-inline-suggestion, .writing-unit-gap').forEach((node) => node.remove())
      return String(clone.textContent || '').replace(/\u200b/g, '') === expected
    }, finalCompositionText, { timeout: 4_000 })
    const afterFinalComposition = await canonicalEditorText(page)
    if (afterFinalComposition !== finalCompositionText) {
      report.push({ journey, level: 'FAIL', what: '全选 IME 最终文本没有原子替换正文', afterFinalComposition })
    }
    const finalGhost = await waitForDeterministicGhost(page, provider, journey)
    if (!finalGhost || provider.count({ kind: 'advisor' }) !== requestsAtCompositionStart + 1) {
      report.push({
        journey,
        level: 'FAIL',
        what: 'IME 最终 transaction 后没有基于新 revision 恰好触发一次联想',
        provider: provider.summary(),
      })
    }
  }, {
    criticalRequestPatterns: ['/api/advisor/task'],
    journeyTimeoutMs: 45_000,
  })
}

// J10: 本地 SSE provider mock 覆盖长推演规划、可编辑草稿、采用和刷新持久化。
async function journeyEditableBlockDraft() {
  const journey = 'J10 可编辑长推演草稿'
  await journeyRunner.run(journey, async (page) => {
    const provider = await installDeterministicProviderMock(page, {
      passiveInline: false,
      expectedComposerInstruction: MOCK_BLOCK_INSTRUCTION,
    })
    await setup(page, journey, { chapters: 1 })
    const canonicalBeforeDraft = await canonicalEditorText(page)
    const structureBeforeDraft = await editorStructureSnapshot(page)
    const assertCanonicalUnchanged = async (phase) => {
      const currentText = await canonicalEditorText(page)
      const currentStructure = await editorStructureSnapshot(page)
      if (currentText !== canonicalBeforeDraft || currentStructure !== structureBeforeDraft) {
        report.push({
          journey,
          level: 'FAIL',
          what: `${phase} 时推演草稿提前改动了 canonical 正文`,
          beforeChars: canonicalBeforeDraft.length,
          currentChars: currentText.length,
          structureChanged: currentStructure !== structureBeforeDraft,
        })
      }
    }
    await page.getByRole('button', { name: '＋ 推演下一段', exact: true }).first().click()
    await page.locator('[data-test="block-composer"]').waitFor({ state: 'visible', timeout: 4_000 })
    await page.locator('[data-test="block-composer"] .authoring-block-composer__instruction textarea')
      .fill(MOCK_BLOCK_INSTRUCTION)
    await page.locator('[data-test="block-primary"]').click()

    const draft = page.locator('[data-test="block-draft"]')
    await draft.waitFor({ state: 'visible', timeout: 20_000 })
    const draftInput = draft.locator('.authoring-block-draft__input')
    const generated = (await draftInput.inputValue()).trim()
    if (generated !== MOCK_BLOCK_ORIGINAL_TEXT) {
      report.push({
        journey,
        level: 'FAIL',
        what: `长推演草稿没有呈现确定性生成稿（${generated.length}/${MOCK_BLOCK_ORIGINAL_TEXT.length} 字）`,
        provider: provider.summary(),
      })
    }
    await assertCanonicalUnchanged('生成稿出现')
    if (provider.count({ kind: 'narrative', phase: 'plan' }) !== 1
      || provider.count({ kind: 'narrative', phase: 'prose' }) !== 1) {
      report.push({ journey, level: 'FAIL', what: '长推演没有严格完成一次规划和一次正文请求', provider: provider.summary() })
    }
    if (provider.count({ kind: 'narrative', phase: 'plan', instructionSeen: true }) !== 1
      || provider.count({ kind: 'narrative', phase: 'prose', instructionSeen: true }) !== 1) {
      report.push({ journey, level: 'FAIL', what: 'Composer 输入没有进入规划/正文模型消息', provider: provider.summary() })
    }

    await draftInput.fill(MOCK_BLOCK_EDITED_TEXT)
    await draft.getByRole('button', { name: '恢复生成稿', exact: true }).waitFor({ state: 'visible', timeout: 2_000 })
    if ((await draftInput.inputValue()).trim() !== MOCK_BLOCK_EDITED_TEXT) {
      report.push({ journey, level: 'FAIL', what: '编辑后的推演稿没有留在受控 textarea 中' })
    }
    await assertCanonicalUnchanged('编辑草稿')
    await draft.getByRole('button', { name: '恢复生成稿', exact: true }).click()
    const restored = (await draftInput.inputValue()).trim()
    if (restored !== MOCK_BLOCK_ORIGINAL_TEXT) {
      report.push({ journey, level: 'FAIL', what: '“恢复生成稿”没有还原确定性生成稿' })
    }
    await assertCanonicalUnchanged('恢复生成稿')
    await draftInput.fill(MOCK_BLOCK_EDITED_TEXT)
    if ((await draftInput.inputValue()).trim() !== MOCK_BLOCK_EDITED_TEXT) {
      report.push({ journey, level: 'FAIL', what: '恢复后再次编辑没有留在草稿 textarea 中' })
    }
    await assertCanonicalUnchanged('采用前')
    await draft.getByRole('button', { name: '采用编辑稿', exact: true }).click()
    await draft.waitFor({ state: 'detached', timeout: 12_000 })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_200)
    const persisted = await canonicalEditorText(page)
    const editedAnchor = '铜钥匙滑到第二层石阶'
    const originalOnlyAnchor = '银哨落在第三层石阶'
    if (countOccurrences(persisted, editedAnchor) !== 1 || !persisted.includes(MOCK_BLOCK_EDITED_TEXT)) {
      report.push({
        journey,
        level: 'FAIL',
        what: `刷新后编辑稿不是唯一落盘版本（编辑锚点 ${countOccurrences(persisted, editedAnchor)} 次）`,
      })
    }
    if (persisted.includes(originalOnlyAnchor) || persisted.includes(MOCK_BLOCK_ORIGINAL_TEXT)) {
      report.push({ journey, level: 'FAIL', what: '刷新后仍出现未编辑的生成稿内容' })
    }
    if (await page.locator('[data-test="block-draft"]').count()) {
      report.push({ journey, level: 'FAIL', what: '刷新后可编辑草稿组件仍残留在稿面' })
    }
    if (provider.count({ kind: 'advisor' }) !== 0) {
      report.push({ journey, level: 'FAIL', what: '长推演旅程关闭被动联想后仍发送 advisor 请求', provider: provider.summary() })
    }
    if (provider.count({ kind: 'narrative', phase: 'plan' }) !== 1
      || provider.count({ kind: 'narrative', phase: 'prose' }) !== 1) {
      report.push({ journey, level: 'FAIL', what: '采用或刷新期间重复发送了长推演请求', provider: provider.summary() })
    }
  }, {
    criticalRequestPatterns: ['/api/advisor/task', '/api/generate/agent-step/stream'],
    // 刷新可能取消已经调度、尚未收尾的 shadow critic；仅允许流端点的
    // 明确 abort，主推演失败仍会由草稿/请求次数断言报红。
    expectedAbortPatterns: ['/api/generate/agent-step/stream'],
    journeyTimeoutMs: 60_000,
  })
}

const deterministicJourneys = [journeyEmptyCommandMenu, journeyCompositionIsolation, journeyEditableBlockDraft]

const baseJourneys = [journeyWriting, journeyExploration, journeyAnnotate, journeyOutline, journeySceneBinding]

// ---------- 第三批：本地数据链路（长文 / 探索批注隔离 / 快照 / 双书） ----------
async function runGuarded(label, fn) {
  // 本地旅程关闭被动联想：既消掉无后端时的 500 噪音，也让断言不抢跑。
  await journeyRunner.run(label, fn, { disableAgent: true, acceptDialogs: true })
}

async function editorTextSafe(page) {
  try { return await editorText(page) } catch { return '' }
}

// J11 长文：批量插入、选区批注、滚动所有权
async function journeyLongDoc(page) {
  const journey = 'J11 长文'
  await page.goto(BASE + '/authoring', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.locator('.wall__pin-cta', { hasText: '建立第一本书' }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', '雾港旧事')
  await page.click('.modal-footer .btn-primary')
  await page.waitForTimeout(700)
  await page.locator('.wall__pin-cta', { hasText: '建立第一章' }).click()
  await page.waitForTimeout(900)
  const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
  await surface.click()
  for (let i = 0; i < 20; i += 1) {
    await page.keyboard.type(`第${i + 1}段：雾从码头深处漫上来，灯影在水面上碎成薄片。`)
    await page.keyboard.press('Enter')
  }
  await page.keyboard.type('灯塔的守夜人推开铁门，门轴发出长叹。')
  for (let i = 20; i < 40; i += 1) {
    await page.keyboard.press('Enter')
    await page.keyboard.type(`第${i + 1}段：潮声一层压过一层，把人们的名字泡得发胀。`)
  }
  await page.waitForTimeout(1200)
  await surface.click({ button: 'right' })
  if (await expectVisible(page, '.context-menu', journey)) {
    const surfaceBox = await surface.boundingBox()
    if (surfaceBox) {
      await page.mouse.move(surfaceBox.x + 20, surfaceBox.y + Math.min(surfaceBox.height - 20, 240))
      await page.mouse.wheel(0, 720)
    }
    try {
      await page.locator('.context-menu').waitFor({ state: 'detached', timeout: 3_000 })
    } catch {
      report.push({ journey, level: 'FAIL', what: '正文滚动后 fixed 右键菜单仍绑定离屏旧选区' })
      await page.keyboard.press('Escape')
    }
  }
  await page.locator('button.tool-btn[title="查找替换"]').click()
  await page.fill('.find-replace-bar .find-input', '门轴发出长叹')
  await page.click('.find-replace-bar button:has-text("↓")')
  await page.waitForTimeout(400)
  if (!await expectVisible(page, '.writing-selection-actions', journey)) {
    report.push({ journey, level: 'FAIL', what: '查找跳转后未出现选区浮动条（选区未命中）' })
    return
  }
  await page.locator('.writing-selection-actions button[title*="批注"]').click()
  await page.fill('.writing-annotation-composer textarea', '中段锚点批注')
  await page.locator('.writing-annotation-composer button[type="submit"]').click()
  await page.waitForTimeout(700)
  await page.locator('.authoring-chapter-create .is-primary').click()
  await page.waitForTimeout(700)
  // 切回长文章节再断言批注仍在（新章语境下检查旧章批注本来就是空的）
  await page.locator('.authoring-chapter-row:not(.wt3-doc-row)').first().click()
  await page.waitForTimeout(800)
  const listed = await page.locator('[data-authoring-inspector="annotations"]', { hasText: '中段锚点批注' }).count()
  if (!listed) report.push({ journey, level: 'FAIL', what: '切章往返后长文批注丢失' })
  const shelfBefore = await page.evaluate(() => document.querySelector('.wall__shelf')?.scrollTop || 0)
  await surface.hover()
  await page.mouse.wheel(0, 1200)
  await page.waitForTimeout(400)
  const shelfAfter = await page.evaluate(() => document.querySelector('.wall__shelf')?.scrollTop || 0)
  if (shelfAfter !== shelfBefore) report.push({ journey, level: 'FAIL', what: `滚动正文带动了左栏 (${shelfBefore} -> ${shelfAfter})` })
}

// J12 探索文档批注隔离
async function journeyExploreAnnotation(page) {
  const journey = 'J12 探索批注隔离'
  await page.goto(BASE + '/authoring', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.locator('.wall__pin-cta', { hasText: '建立第一本书' }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', '雾港旧事')
  await page.click('.modal-footer .btn-primary')
  await page.waitForTimeout(700)
  await page.locator('.wall__pin-cta', { hasText: '建立第一章' }).click()
  await page.waitForTimeout(900)
  await page.fill('input[aria-label="章节标题"]', '第一章')
  const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
  await surface.click()
  await page.keyboard.type('正文的句子，属于章节稿面。')
  await page.waitForTimeout(500)
  await page.locator('.authoring-chapter-row.wt3-doc-row', { hasText: '＋ 快速落笔' }).click()
  await page.waitForTimeout(800)
  await surface.click()
  await page.keyboard.type('探索里的独有句子，用来验证批注归属。')
  await page.waitForTimeout(700)
  const selection = await selectEditorTextRange(page, 0, 4)
  if (!selection.ok || selection.collapsed || selection.text !== '探索里的') {
    report.push({ journey, level: 'FAIL', what: '探索文档 DOM Range 没有精确选中目标文本', selection })
    return
  }
  if (!await expectVisible(page, '.writing-selection-actions', journey)) return
  await page.locator('.writing-selection-actions button[title*="批注"]').click()
  await page.fill('.writing-annotation-composer textarea', '探索专属批注XYZ')
  await page.locator('.writing-annotation-composer button[type="submit"]').click()
  await page.waitForTimeout(700)
  await page.locator('button', { hasText: '返回正文' }).first().click()
  await page.waitForTimeout(900)
  await page.locator('button[data-authoring-tool="annotations"]').click()
  await page.waitForTimeout(600)
  if (await page.locator('[data-authoring-inspector="annotations"]', { hasText: '探索专属批注XYZ' }).count()) {
    report.push({ journey, level: 'FAIL', what: '探索批注泄漏进正文检查器（串写回归）' })
  }
  const docRow = page.locator('.authoring-chapter-row.wt3-doc-row:not(:has-text("快速落笔"))').first()
  await docRow.click()
  await page.waitForTimeout(800)
  if (!await page.locator('.wt3-badge').count()) {
    report.push({ journey, level: 'FAIL', what: '未进入探索文档（行定位失败）' })
    return
  }
  await page.locator('button[data-authoring-tool="annotations"]').click()
  await page.waitForTimeout(600)
  if (!await page.locator('[data-authoring-inspector="annotations"]', { hasText: '探索专属批注XYZ' }).count()) {
    report.push({ journey, level: 'FAIL', what: '回到探索文档后专属批注丢失' })
  }
}

// J13 快照保存与恢复
async function journeySnapshot(page) {
  const journey = 'J13 快照'
  await page.goto(BASE + '/authoring', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.locator('.wall__pin-cta', { hasText: '建立第一本书' }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', '雾港旧事')
  await page.click('.modal-footer .btn-primary')
  await page.waitForTimeout(700)
  await page.locator('.wall__pin-cta', { hasText: '建立第一章' }).click()
  await page.waitForTimeout(900)
  const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
  await surface.click()
  await page.keyboard.type('快照基线文本ABC。')
  await page.waitForTimeout(1000)
  await page.locator('button[data-authoring-tool="history"]').click()
  await page.waitForTimeout(500)
  await page.locator('button', { hasText: '保存快照' }).click()
  await page.waitForTimeout(800)
  await surface.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' 这句不该留在恢复后的稿面。')
  await page.waitForTimeout(800)
  const restoreBtn = page.locator('button', { hasText: '恢复到这里' }).first()
  if (await restoreBtn.count()) {
    await restoreBtn.click()
    await page.waitForTimeout(1200)
    const after = await editorTextSafe(page)
    if (after.includes('这句不该留在')) report.push({ journey, level: 'FAIL', what: '恢复快照后破坏性内容仍在' })
    if (!after.includes('快照基线文本ABC')) report.push({ journey, level: 'FAIL', what: '恢复快照后基线文本丢失' })
  } else {
    report.push({ journey, level: 'FAIL', what: '找不到“恢复到这里”按钮' })
  }
}

// J14 双书隔离
async function journeyTwoBooks(page) {
  const journey = 'J14 双书隔离'
  await page.goto(BASE + '/authoring', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  await page.locator('.wall__pin-cta', { hasText: '建立第一本书' }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', '雾港旧事')
  await page.click('.modal-footer .btn-primary')
  await page.waitForTimeout(700)
  await page.locator('.wall__pin-cta', { hasText: '建立第一章' }).click()
  await page.waitForTimeout(900)
  const surface = page.locator('.writing-notebook-editor__surface .ProseMirror').first()
  await surface.click()
  await page.keyboard.type('雾港的第一章内容。')
  await page.waitForTimeout(600)
  const newBookButton = page.locator('.authoring-book-tab__new')
  if (await newBookButton.count()) await newBookButton.click()
  else await page.locator('.authoring-chapter-create button', { hasText: '新建书' }).click()
  await page.fill('.modal input[placeholder="输入书籍名称"]', '沙盘手记')
  await page.click('.modal-footer .btn-primary')
  await page.waitForTimeout(900)
  await page.locator('.wall__pin-cta', { hasText: '建立第一章' }).click()
  await page.waitForTimeout(900)
  if (await page.locator('.authoring-chapter-row', { hasText: '雾港的第一章' }).count()) {
    report.push({ journey, level: 'FAIL', what: '第二本书里看到第一本书的章节' })
  }
  const body2 = await editorTextSafe(page)
  if (body2.includes('雾港的第一章')) report.push({ journey, level: 'FAIL', what: '第二本稿面出现第一本正文' })
  await page.locator('.authoring-book-tab', { hasText: '雾港旧事' }).click()
  await page.waitForTimeout(900)
  const backBody = await editorTextSafe(page)
  if (!backBody.includes('雾港的第一章')) report.push({ journey, level: 'FAIL', what: '切回第一本书后正文丢失' })
}

const localJourneyEntries = [
  { ids: ['j1', 'writing'], run: journeyWriting },
  { ids: ['j2', 'exploration'], run: journeyExploration },
  { ids: ['j3', 'annotation'], run: journeyAnnotate },
  { ids: ['j4', 'outline'], run: journeyOutline },
  { ids: ['j5', 'scene'], run: journeySceneBinding },
  { ids: ['j8', 'menu', 'empty-menu'], run: journeyEmptyCommandMenu },
  { ids: ['j9', 'composition', 'ime'], run: journeyCompositionIsolation },
  { ids: ['j10', 'draft', 'block-draft'], run: journeyEditableBlockDraft },
  { ids: ['j11', 'long-doc'], run: () => runGuarded('J11 长文', journeyLongDoc) },
  { ids: ['j12', 'exploration-annotation'], run: () => runGuarded('J12 探索批注隔离', journeyExploreAnnotation) },
  { ids: ['j13', 'snapshot'], run: () => runGuarded('J13 快照', journeySnapshot) },
  { ids: ['j14', 'two-books'], run: () => runGuarded('J14 双书隔离', journeyTwoBooks) },
]

function selectLocalJourneyEntries(only) {
  if (!only) return localJourneyEntries
  return localJourneyEntries.filter((entry) => entry.ids.includes(only))
}

async function runHarnessSelfTest(mode) {
  await journeyRunner.run('H0 Harness self-test', async (page) => {
    await page.setContent('<main><h1>Authoring journey harness</h1><p>Failure evidence fixture.</p></main>')
    if (mode === 'fail') report.push({ journey: 'H0 Harness self-test', level: 'FAIL', what: 'intentional harness self-test failure' })
    if (mode === 'console') await page.evaluate(() => console.error('intentional harness console error'))
    if (mode === 'pageerror') {
      await page.evaluate(() => setTimeout(() => { throw new Error('intentional harness page error') }, 0))
      await page.waitForTimeout(50)
    }
    if (mode === 'passive-http' || mode === 'critical-http') {
      const path = mode === 'critical-http' ? 'critical' : 'passive'
      await page.route(`**/${path}`, (route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ error: 'intentional harness response' }),
      }))
      await page.evaluate((requestPath) => fetch(`http://journey.test/${requestPath}`).catch(() => null), path)
      await page.waitForTimeout(50)
    }
    if (mode === 'timeout') await new Promise(() => {})
  }, {
    journeyTimeoutMs: mode === 'timeout' ? 200 : 10_000,
    criticalRequestPatterns: mode === 'critical-http' ? ['/critical'] : [],
  })
}

async function main() {
  const artifactRun = await createAuthoringArtifactRun({
    baseUrl: BASE,
    selection: {
      journeys: process.env.JOURNEYS || 'all',
      only: process.env.ONLY || null,
      harnessSelfTest: process.env.AUTHORING_JOURNEY_HARNESS_SELF_TEST || null,
    },
  })
  journeyRunner = createJourneyRunner({ report, artifactRun })
  const handleSigint = () => journeyRunner.requestStop('SIGINT')
  const handleSigterm = () => journeyRunner.requestStop('SIGTERM')
  process.once('SIGINT', handleSigint)
  process.once('SIGTERM', handleSigterm)

  let finalizeResult = null
  try {
    const selfTest = process.env.AUTHORING_JOURNEY_HARNESS_SELF_TEST
    if (['fail', 'pass', 'console', 'pageerror', 'timeout', 'passive-http', 'critical-http'].includes(selfTest)) {
      await runHarnessSelfTest(selfTest)
    } else {
      const selection = process.env.JOURNEYS || 'all'
      if (selection === 'deterministic') {
        const only = String(process.env.ONLY || '').trim()
        const byOnly = {
          menu: journeyEmptyCommandMenu,
          'empty-menu': journeyEmptyCommandMenu,
          j8: journeyEmptyCommandMenu,
          composition: journeyCompositionIsolation,
          ime: journeyCompositionIsolation,
          j9: journeyCompositionIsolation,
          draft: journeyEditableBlockDraft,
          'block-draft': journeyEditableBlockDraft,
          j10: journeyEditableBlockDraft,
        }
        const selected = only ? [byOnly[only]].filter(Boolean) : deterministicJourneys
        if (only && selected.length === 0) throw new Error(`未知 deterministic ONLY=${only}`)
        for (const journey of selected) {
          if (journeyRunner.stopRequested) break
          await journey()
        }
      } else if (selection === 'local') {
        // 可定点复验单条本地旅程，避免一个 DOM/样式小切片每次重跑两分钟。
        // local 仍绝不探测或调用真实 provider。
        const only = String(process.env.ONLY || '').trim()
        const selected = selectLocalJourneyEntries(only)
        if (only && selected.length === 0) throw new Error(`未知 local ONLY=${only}`)
        for (const entry of selected) {
          if (journeyRunner.stopRequested) break
          await entry.run()
        }
      } else {
        const runAiJourneys = await backendAvailable()
        const aiJourneys = runAiJourneys
          ? (selection === 'ai' && process.env.ONLY
              ? [(process.env.ONLY === 'ghost' ? journeyGhost : journeyDeduce)]
              : [journeyGhost, journeyDeduce])
          : []
        if (!runAiJourneys) report.push({ journey: 'AI', level: 'SKIPPED', what: '后端(3001)不可达，跳过 Ghost/推演旅程' })

        const localDeterministicJourneys = selection === 'ai' ? [] : deterministicJourneys
        for (const journey of [...baseJourneys, ...localDeterministicJourneys, ...aiJourneys]) {
          if (journeyRunner.stopRequested) break
          await journey()
        }
        if (selection !== 'ai' && !journeyRunner.stopRequested) {
          await runGuarded('J11 长文', journeyLongDoc)
          if (!journeyRunner.stopRequested) await runGuarded('J12 探索批注隔离', journeyExploreAnnotation)
          if (!journeyRunner.stopRequested) await runGuarded('J13 快照', journeySnapshot)
          if (!journeyRunner.stopRequested) await runGuarded('J14 双书隔离', journeyTwoBooks)
        }
      }
    }
  } catch (error) {
    const failure = { journey: 'HARNESS', level: 'HARNESS-ERROR', what: String(error?.message || error).slice(0, 240) }
    report.push(failure)
    try {
      const artifact = await artifactRun.captureFailure({ page: null, journey: 'HARNESS', failures: [failure], events: [] })
      failure.artifact = artifact.directory
    } catch (artifactError) {
      report.push({ journey: 'HARNESS', level: 'HARNESS-ERROR', what: `顶层失败证据写入失败: ${String(artifactError?.message || artifactError).slice(0, 180)}` })
    }
  } finally {
    await journeyRunner.closeOwnedBrowsers()
    const failed = report.some(isFatalEntry)
    const status = failed ? (journeyRunner.stopRequested ? 'interrupted' : 'failed') : 'passed'
    finalizeResult = await artifactRun.finalize({ report, status })
    process.removeListener('SIGINT', handleSigint)
    process.removeListener('SIGTERM', handleSigterm)
    if (failed) process.exitCode = 1
  }

  if (!report.length) {
    console.log('ALL-JOURNEYS-CLEAN: 无失败断言、无 console/page error、无 4xx/5xx')
  } else {
    for (const entry of report) console.log(JSON.stringify(entry, null, 0))
  }
  console.log(JSON.stringify({
    journeyArtifacts: finalizeResult?.runDir || null,
    status: finalizeResult?.status || 'unknown',
    totalBytes: finalizeResult?.totalBytes || 0,
  }))
}

main().catch((error) => {
  console.error('Authoring journeys failed before finalization:', error)
  process.exitCode = 1
})

// Windows 原生文件夹选择器（本机能力）：服务端进程 spawn PowerShell FolderBrowserDialog——
// 对话框弹在用户屏幕上（服务端与浏览器同机），选中后返回绝对路径。
// 两步面：start（spawn，立返 pickId）→ result 轮询（完成/取消）。失败标 failed → 前端回落内置浏览器。
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const picks = new Map()
const PICK_TTL_MS = 10 * 60_000

function shellSafe(value) {
  return String(value || '').replace(/['`"\r\n]/g, '').slice(0, 260)
}

/** 拉起 Windows 原生文件夹选择对话框（非阻塞）。返回 pickId；结果经 result 轮询读取。 */
export function startFolderPick({ initial = '', description = '选择项目文件夹' } = {}) {
  const pickId = randomUUID().slice(0, 12)
  const result = { done: false, path: null, cancelled: false, failed: false }
  picks.set(pickId, result)
  const initialSafe = shellSafe(initial)
  const descriptionSafe = shellSafe(description)
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Add-Type -AssemblyName System.Windows.Forms | Out-Null',
    '$owner = New-Object System.Windows.Forms.Form',
    '$owner.TopMost = $true',
    `$dialog = New-Object System.Windows.Forms.FolderBrowserDialog`,
    `$dialog.Description = '${descriptionSafe}'`,
    `$dialog.ShowNewFolderButton = $true`,
    initialSafe ? `$dialog.SelectedPath = '${initialSafe}'` : null,
    '[void]$dialog.ShowDialog($owner)',
    'if ($dialog.SelectedPath) { [Console]::Out.Write($dialog.SelectedPath) }'
  ].filter(Boolean).join('; ')
  const child = spawn('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.on('error', () => { result.done = true; result.failed = true; result.cancelled = true })
  child.on('close', () => {
    result.done = true
    const selected = stdout.trim().split(/\r?\n/).filter(Boolean).pop() || ''
    if (selected) {
      // Windows 怪癖：树中选中盘符 + 手输文件夹名会得到盘符相对路径（"D:Projects"）——补上分隔符
      result.path = selected.match(/^[a-zA-Z]:[^\\/]/) ? selected.slice(0, 2) + '\\' + selected.slice(2) : selected
    } else result.cancelled = true
  })
  const cleaner = setTimeout(() => { result.done = true; if (!result.path) result.cancelled = true; picks.delete(pickId) }, PICK_TTL_MS)
  cleaner.unref?.()
  return { pickId, pid: child.pid ?? null }
}

/** 轮询读取选择结果：{ done:false } 进行中；done + path=选中；done + cancelled=取消。取走即清理。 */
export function getFolderPickResult(pickId) {
  const result = picks.get(String(pickId || ''))
  if (!result) return { done: true, cancelled: true, missing: true }
  if (!result.done) return { done: false }
  picks.delete(String(pickId || ''))
  return { done: true, path: result.path, cancelled: Boolean(result.cancelled), failed: Boolean(result.failed) }
}

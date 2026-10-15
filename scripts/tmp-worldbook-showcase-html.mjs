// 把效果实拍 md 转成自包含 HTML（截图 base64 内嵌，任何浏览器/查看器零路径依赖）
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

const root = resolve(process.argv[2] || '.')
const mdPath = resolve(root, 'docs/plan/worldbook-showcase-20261008.md')
const outPath = resolve(root, 'docs/plan/worldbook-showcase-20261008.html')
const md = readFileSync(mdPath, 'utf8')

// 极简 md→html（标题/粗体/行内代码/列表/代码块/图片/段落——够展示文档用）
function renderInline(s) {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
}
const lines = md.split('\n')
const out = []
let inCode = false, codeBuf = [], inList = false
for (const line of lines) {
  if (line.startsWith('```')) {
    if (inCode) { out.push('<pre><code>' + codeBuf.join('\n').replace(/</g, '&lt;') + '</code></pre>'); codeBuf = []; inCode = false }
    else { inCode = true }
    continue
  }
  if (inCode) { codeBuf.push(line); continue }
  if (line.startsWith('![')) {
    const m = line.match(/!\[([^\]]*)\]\(([^)]+)\)/)
    if (m) {
      const imgPath = resolve(dirname(mdPath), m[2])
      const b64 = readFileSync(imgPath).toString('base64')
      out.push(`<figure><img src="data:image/png;base64,${b64}" alt="${m[1]}" /><figcaption>${m[1]}</figcaption></figure>`)
      continue
    }
  }
  if (/^- /.test(line)) { if (!inList) { out.push('<ul>'); inList = true } out.push('<li>' + renderInline(line.slice(2)) + '</li>'); continue }
  if (inList) { out.push('</ul>'); inList = false }
  if (line.startsWith('### ')) out.push('<h3>' + renderInline(line.slice(4)) + '</h3>')
  else if (line.startsWith('## ')) out.push('<h2>' + renderInline(line.slice(3)) + '</h2>')
  else if (line.startsWith('# ')) out.push('<h1>' + renderInline(line.slice(2)) + '</h1>')
  else if (line.startsWith('> ')) out.push('<blockquote>' + renderInline(line.slice(2)) + '</blockquote>')
  else if (line.trim() === '') out.push('')
  else out.push('<p>' + renderInline(line) + '</p>')
}
if (inList) out.push('</ul>')

const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<title>世界书统一化 · 效果实拍</title>
<style>
body{font-family:"Segoe UI","Microsoft YaHei",sans-serif;max-width:1080px;margin:0 auto;padding:32px 24px;background:#f6f7f9;color:#1c2733;line-height:1.75}
h1{font-size:26px;border-bottom:2px solid #2f6fbf;padding-bottom:10px}
h2{font-size:20px;margin-top:36px;color:#2f6fbf}
figure{margin:18px 0;text-align:center}
figure img{max-width:100%;border:1px solid #d7dde3;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
figcaption{font-size:13px;color:#5a6b7d;margin-top:6px}
code{background:#eef1f4;border-radius:4px;padding:1px 6px;font-size:13px}
pre{background:#1c2733;color:#dce6f0;border-radius:8px;padding:16px;overflow:auto;font-size:13px;line-height:1.5}
pre code{background:none;color:inherit}
blockquote{border-left:4px solid #2f6fbf;margin:12px 0;padding:6px 14px;background:#eef4fb;border-radius:0 6px 6px 0}
a{color:#2f6fbf}
</style></head><body>
${out.join('\n')}
</body></html>`
writeFileSync(outPath, html)
console.log('self-contained html written:', outPath, (html.length / 1024).toFixed(0) + 'KB')

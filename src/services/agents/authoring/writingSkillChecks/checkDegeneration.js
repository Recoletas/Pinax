// Oh Story story-review 退化指纹检测的 Pinax 适配版。
// 上游：https://github.com/zenstory-ai/oh-story-claudecode
// 固定版本 0ffe7db4fa02489f5d1989e58a22ce62d040a850 的
// skills/story-review/scripts/check-degeneration.js（MIT，
// 见 public/third-party/oh-story-claudecode-LICENSE.txt）。
// 上游逐字参照与 fixture 对照见 scripts/writing-skills/。
//
// 改造边界（相对上游）：
// - 拆掉 fs/path/process/CLI：输入字符串，返回 findings 数组；
//   上游 CLI 参照仅存于 scripts/writing-skills/upstream/，不得被应用代码引用。
// - 定位从「行/列」升级为稳定 locator：UTF-16 编辑 offset（start/end）+
//   逐字 exact 切片，行/列保留为诊断字段且与上游判定一致
//   （scripts/writing-skills-degeneration-eval.mjs 做同输入对照）。
// - 检测语义与上游逐条保持一致：逐行/长句复读、结尾截断、占位符与
//   元信息泄漏（含引号遮蔽/剥离、软信号只看引号外）、工程词 tier1/tier2。

const REPEAT_MIN_LEN = 12;
const REPEAT_MIN_COUNT = 3;
const ADJACENT_MIN_LEN = 8;

const PLACEHOLDER_PATTERNS = [
  { re: /作为(一个)?(AI|人工智能|大?语言模型|智能助手|聊天助手)(?:语言模型|大?模型|助手|机器人)?(?=[，,。、；;：:！!？?\s）)」』"】]|我|无法|不能|没法|$)/, label: '元信息泄漏（AI 自指）', hard: false },
  { re: /�/, label: '乱码（替换字符 �）', hard: true },
  { re: /^(Sure|Certainly|Here'?s|As an AI|I (?:cannot|can't|am unable|apologize))/, label: '元信息泄漏（英文 AI 腔）', hard: true },
  { re: /[（(](此处|以下|这里|下文|后续)?\s*(省略|略)(去|过)?[^）)]{0,10}[）)]/, label: '占位符（括号省略）', hard: true },
  { re: /(未完待续|TODO|占位符|placeholder)/, label: '占位符', hard: true },
  { re: /我(无法|不能)(继续(写|创作|生成|下去)|生成(内容|文本|正文)?|创作|续写|完成(这个|本)?(章|篇|创作|请求))/, label: '元信息泄漏（生成拒绝语）', hard: false },
];

const QUOTED_SPAN_PATTERNS = [
  /「[^」]*」/g,
  /『[^』]*』/g,
  /【[^】]*】/g,
  /“[^”]*”/g,
  /(?<![A-Za-z0-9_])‘(?:[^’]|(?<=[A-Za-z0-9_])’(?=[A-Za-z0-9_]))*(?!(?<=[A-Za-z0-9_])’[A-Za-z0-9_])’/g,
  /"[^"]*"/g,
  /(?<![A-Za-z0-9_])'(?:[^']|(?<=[A-Za-z0-9_])'(?=[A-Za-z0-9_]))*(?!(?<=[A-Za-z0-9_])'[A-Za-z0-9_])'/g,
];

const META_TIER1_RE = /细纲|情节点|卷纲|功能标签|目标情绪|字数目标|章首钩子|章尾钩子/;
const META_TIER2_RE = /第[一二三四五六七八九十百千万两0-9]+章|本章|这一章|上一章|下一章|上章|下章|前一章|后一章|前文|后文|伏笔|读者|任务描述/;

export const DEGENERATION_SEVERITIES = Object.freeze(['blocking', 'advisory']);
export const DEGENERATION_TYPES = Object.freeze(['verbatim-repeat', 'truncated', 'placeholder-leak', 'meta-leak']);

/**
 * 扫描一段正文，返回模型退化指纹 findings。
 * @param {string} input 任意长度正文；允许空串。
 * @returns {Array<{type: string, severity: 'blocking'|'advisory', message: string,
 *   excerpt: string, line: number, column: number,
 *   locator: {startOffset: number, endOffset: number, exact: string}}>}
 *   按（行, 列）升序，与上游一致。offset 为输入串的 UTF-16 编辑 offset。
 */
export function scanDegenerationFindings(input) {
  const source = String(input ?? '');
  const lines = source.split(/\r?\n/);
  // 行首绝对 offset 表：与上游 split 后逐行处理保持同一坐标基准。
  const lineStarts = [];
  let cursor = 0;
  for (const line of lines) {
    lineStarts.push(cursor);
    cursor += line.length + (source.slice(cursor + line.length).startsWith('\r\n') ? 2 : 1);
  }
  const at = (lineNo, column = 1) => lineStarts[lineNo - 1] + Math.max(0, column - 1);
  const finalize = (finding) => finalizeFinding(source, at, finding);

  const content = [];
  let fence = null;
  let inFrontMatter = hasYamlFrontMatter(lines);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (inFrontMatter) {
      if (index > 0 && trimmed === '---') inFrontMatter = false;
      continue;
    }
    const fenceMarker = /^(?:`{3,}|~{3,})/.exec(trimmed);
    if (fence) {
      if (fenceMarker && trimmed[0] === fence) fence = null;
      continue;
    }
    if (fenceMarker) {
      fence = trimmed[0];
      continue;
    }
    content.push({ text: line, trimmed, lineNo: index + 1 });
  }

  const findings = [];
  findings.push(...findRepetition(content));
  findings.push(...findTruncation(content));
  findings.push(...findPlaceholders(content));
  findings.push(...findMetaLeak(content));
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings.map(finalize);
}

function finalizeFinding(source, at, finding) {
  const { locator, ...rest } = finding;
  const startOffset = at(locator.startLine, locator.startColumn);
  const endOffset = at(locator.endLine, locator.endColumn);
  return {
    ...rest,
    locator: {
      startOffset,
      endOffset,
      exact: source.slice(startOffset, endOffset),
    },
  };
}

function isContent(trimmed) {
  return trimmed && !trimmed.startsWith('#') && !/^-{3,}$/.test(trimmed);
}

function leadingWhitespaceLength(text) {
  return text.length - text.trimStart().length;
}

function maskQuotedSpans(text) {
  let masked = text;
  for (const pattern of QUOTED_SPAN_PATTERNS) {
    masked = masked.replace(pattern, (match) => ' '.repeat(match.length));
  }
  return masked;
}

function stripQuoted(text) {
  let stripped = text;
  for (const pattern of QUOTED_SPAN_PATTERNS) {
    stripped = stripped.replace(pattern, '');
  }
  return stripped;
}

function visibleLength(text) {
  const m = text.match(/[一-鿿Ａ-ｚA-Za-z0-9]/g);
  return m ? m.length : 0;
}

function findRepetition(content) {
  const findings = [];
  const body = content.filter((c) => isContent(c.trimmed));

  for (let i = 1; i < body.length; i += 1) {
    if (
      body[i].trimmed === body[i - 1].trimmed
      && visibleLength(stripQuoted(body[i].trimmed)) >= ADJACENT_MIN_LEN
    ) {
      const indent = leadingWhitespaceLength(body[i].text);
      const startColumn = indent + 1;
      findings.push({
        line: body[i].lineNo,
        column: 1,
        type: 'verbatim-repeat',
        severity: 'blocking',
        message: '逐行复读（紧邻整行重复）：疑似模型打转，重写本段、删掉重复。',
        excerpt: compact(body[i].trimmed),
        locator: {
          startLine: body[i].lineNo,
          startColumn,
          endLine: body[i].lineNo,
          endColumn: startColumn + body[i].trimmed.length,
        },
      });
    }
  }

  const counts = new Map();
  for (const { trimmed } of body) {
    for (const sentence of stripQuoted(trimmed).split(/[。！？!?]/)) {
      const s = sentence.trim();
      if (visibleLength(s) < REPEAT_MIN_LEN) continue;
      const entry = counts.get(s) || { count: 0, firstLine: null };
      entry.count += 1;
      counts.set(s, entry);
    }
  }
  const flagged = new Set();
  for (const [s, entry] of counts) {
    if (entry.count >= REPEAT_MIN_COUNT) flagged.add(s);
  }
  if (flagged.size) {
    for (const { trimmed, lineNo } of body) {
      for (const sentence of stripQuoted(trimmed).split(/[。！？!?]/)) {
        const s = sentence.trim();
        if (flagged.has(s)) {
          findings.push({
            line: lineNo,
            column: 1,
            type: 'verbatim-repeat',
            severity: 'blocking',
            message: `长句复读（同句出现 ${counts.get(s).count} 次）：疑似模型打转，重写、保留一处。`,
            excerpt: compact(s),
            // 长句复读定位到句本身（引号剥离后的首处出现），不只标整行。
            locator: locateSentence(body, lineNo, s),
          });
          flagged.delete(s);
        }
      }
    }
  }

  return findings;
}

function locateSentence(body, lineNo, sentence) {
  const lineEntry = body.find((entry) => entry.lineNo === lineNo);
  const text = lineEntry?.text || '';
  const stripped = stripQuoted(text);
  const relative = stripped.indexOf(sentence);
  if (relative >= 0) {
    // 引号剥离只删除片段，前方字符保留原位：stripped 的下标即原行下标。
    const start = leadingWhitespaceLength(text) + relative;
    return {
      startLine: lineNo,
      startColumn: start + 1,
      endLine: lineNo,
      endColumn: start + sentence.length + 1,
    };
  }
  const fallbackStart = leadingWhitespaceLength(text);
  return {
    startLine: lineNo,
    startColumn: fallbackStart + 1,
    endLine: lineNo,
    endColumn: fallbackStart + text.trim().length + 1,
  };
}

function findTruncation(content) {
  const body = content.filter((c) => isContent(c.trimmed));
  if (body.length === 0) return [];
  const last = body[body.length - 1];
  if (/[。！？!?…”"』」）)】]$/.test(last.trimmed)) return [];
  const indent = leadingWhitespaceLength(last.text);
  const tailStart = Math.max(indent, last.text.length - 24);
  return [{
    line: last.lineNo,
    column: last.trimmed.length,
    type: 'truncated',
    severity: 'blocking',
    message: '疑似截断：正文末尾未以句末/收尾标点结束，可能被模型中途切断；补完结尾或重写收尾。',
    excerpt: compact(last.trimmed.slice(-24)),
    locator: {
      startLine: last.lineNo,
      startColumn: tailStart + 1,
      endLine: last.lineNo,
      endColumn: last.text.length + 1,
    },
  }];
}

function findPlaceholders(content) {
  const findings = [];
  for (const { trimmed, lineNo, text } of content) {
    if (!isContent(trimmed)) continue;
    const outsideQuotes = maskQuotedSpans(trimmed);
    for (const { re, label, hard } of PLACEHOLDER_PATTERNS) {
      const m = re.exec(hard ? trimmed : outsideQuotes);
      if (m) {
        const index = m.index || 0;
        const indent = leadingWhitespaceLength(text);
        findings.push({
          line: lineNo,
          column: index + 1,
          type: 'placeholder-leak',
          severity: 'blocking',
          message: `${label}：正文混入元信息/拒绝语/占位符，重写本段干净落地。`,
          excerpt: compact(trimmed.slice(Math.max(0, index - 4), index + 20)),
          locator: {
            startLine: lineNo,
            startColumn: indent + index + 1,
            endLine: lineNo,
            endColumn: indent + index + m[0].length + 1,
          },
        });
        break; // one finding per line is enough
      }
    }
  }
  return findings;
}

function findMetaLeak(content) {
  const findings = [];
  let firstContentSeen = false;
  for (const { trimmed, lineNo, text } of content) {
    if (!isContent(trimmed)) continue;
    if (!firstContentSeen) {
      firstContentSeen = true;
      if (/^第[一二三四五六七八九十百千万两0-9]+章/.test(trimmed)) continue;
    }
    const outsideQuotes = maskQuotedSpans(trimmed);
    let m = META_TIER1_RE.exec(outsideQuotes);
    let quotedTier1 = false;
    if (!m) {
      m = META_TIER1_RE.exec(trimmed);
      quotedTier1 = Boolean(m);
    }
    if (m) {
      const indent = leadingWhitespaceLength(text);
      findings.push({
        line: lineNo,
        column: m.index + 1,
        type: 'meta-leak',
        severity: quotedTier1 ? 'advisory' : 'blocking',
        message: `工程词泄漏：「${m[0]}」是写作流水线术语，正文里不该出现；改成角色/场景内表达。${quotedTier1 ? '例外：角色为作者/编剧、在故事内真实讨论创作时，台词里可能合法。' : ''}`,
        excerpt: compact(trimmed.slice(Math.max(0, m.index - 6), m.index + 18)),
        locator: {
          startLine: lineNo,
          startColumn: indent + m.index + 1,
          endLine: lineNo,
          endColumn: indent + m.index + m[0].length + 1,
        },
      });
      continue;
    }
    m = META_TIER2_RE.exec(trimmed);
    if (m) {
      const indent = leadingWhitespaceLength(text);
      findings.push({
        line: lineNo,
        column: m.index + 1,
        type: 'meta-leak',
        severity: 'advisory',
        message: `元信息泄漏：「${m[0]}」疑似工程/章节结构词混入正文；改成角色当下可感知的事件锚点或相对时间。例外：角色在故事内真实阅读/讨论「第X章」、真身为作者/读者、或故事内系统/界面用语。`,
        excerpt: compact(trimmed.slice(Math.max(0, m.index - 6), m.index + 18)),
        locator: {
          startLine: lineNo,
          startColumn: indent + m.index + 1,
          endLine: lineNo,
          endColumn: indent + m.index + m[0].length + 1,
        },
      });
    }
  }
  return findings;
}

function hasYamlFrontMatter(lines) {
  if (!lines[0] || lines[0].trim() !== '---') return false;
  let sawYamlField = false;
  for (let i = 1; i < Math.min(lines.length, 40); i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '---') return sawYamlField;
    if (/^[A-Za-z0-9_-]+:\s*/.test(trimmed)) sawYamlField = true;
  }
  return false;
}

function compact(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}

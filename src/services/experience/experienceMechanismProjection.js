// Experience 机制/里程碑/内联事件纯检测投影（R-X3）：
// 只解析模型回应文本，返回事件描述；不弹 UI、不持 timer、不写 store。
// legacy heuristic：面向中文叙事的正则规则，与 gameStore 迁出前逐字一致。

// 机制触发检测：combat/trade/quest/dialogue 四类。返回 payload 或 null。
// content 为空或非字符串返回 null。
export function detectMechanismTriggersFromContent(content, { extractDialogueMechanism }) {
  if (!content || typeof content !== 'string') return null

  // 更严格的触发条件：需要明确的场景描述
  const triggers = {
    combat: {
      patterns: [
        /战斗[开始爆发即将]/,
        /拔[出剑].*迎战/,
        /敌人.*攻击/,
        /挥剑.*冲向/,
        /陷入.*苦战/,
        /抽[出枪].*射击/,
        /扣下扳机/,
        /火[光焰].*喷[射出]/,
        /冲入.*房间/,
        /闪避.*攻击/,
        /举起.*武器/
      ],
      excludePatterns: [
        /想起.*战斗/,
        /回忆.*战斗/,
        /听说.*战斗/,
        /关于.*战斗/
      ]
    },
    trade: {
      patterns: [
        /商店.*老板/,
        /摊位.*摆满/,
        /商人.*问道/,
        /购买.*商品/,
        /交易.*完成/
      ],
      excludePatterns: [
        /听说.*交易/,
        /回忆.*交易/
      ]
    },
    quest: {
      patterns: [
        /任务目标[是为]/,
        /委托[你你去]/,
        /悬赏.*公告/,
        /接受.*任务/
      ],
      excludePatterns: []
    },
    dialogue: {
      patterns: [
        /"([^"]{5,})"/,  // 引号内至少5个字
        /“([^”]{5,})”/,
        /「([^」]{5,})」/
      ],
      excludePatterns: []
    }
  }

  for (const [type, config] of Object.entries(triggers)) {
    const { patterns, excludePatterns } = config

    // 先检查排除模式
    if (excludePatterns.some((exclude) => exclude.test(content))) {
      continue
    }

    // 再检查触发模式
    for (const pattern of patterns) {
      const match = content.match(pattern)
      if (match) {
        const payload = {
          type,
          match: match[0],
          context: match[1] || match[2] || match[0],
          preview: String(content).replace(/\s+/g, ' ').trim().slice(0, 120)
        }

        // 额外检查：确保不是叙述性提及
        const beforeText = content.slice(0, match.index)
        if (/(回忆|想起|听说|关于|曾经)/.test(beforeText.slice(-20))) {
          continue
        }

        if (type === 'dialogue') {
          return {
            ...payload,
            ...extractDialogueMechanism(content, match)
          }
        }

        return payload
      }
    }
  }

  return null
}

// 对话机制细节：说话人 + 引文正文 + 预览
export function extractDialogueMechanism(content, match, { extractDialogueSpeaker }) {
  const fullText = String(content || '')
  const quoteText = String(match?.[0] || '').trim()
  const quoteBody = String(
    match?.[1]
    || match?.[2]
    || quoteText.replace(/^["“「]|["”」]$/g, '')
    || quoteText
  ).trim()
  const speaker = extractDialogueSpeaker(fullText, match)

  return {
    speaker,
    dialogue: quoteBody,
    preview: quoteText ? quoteText.slice(0, 120) : fullText.replace(/\s+/g, ' ').trim().slice(0, 120)
  }
}

// 说话人提取：从引文前缀推断说话者名字
export function extractDialogueSpeaker(content, match) {
  const fullText = String(content || '')
  const matchIndex = Number.isInteger(match?.index) ? match.index : fullText.indexOf(match?.[0] || '')
  if (matchIndex < 0) return ''

  const prefix = fullText.slice(0, matchIndex).replace(/\s+/g, ' ').trim()
  const tail = prefix.slice(-40)
  const speakerPatterns = [
    /([^\s，。！？、“”"'《》]{2,12}?)(?:低声说|轻声说|沉声说|喃喃道|回应道|开口道|说道|问道|答道|笑道|喊道|叹道|说|道)(?:[:：]?)$/,
    /([^\s，。！？、“”"'《》]{2,12})[:：]?$/
  ]

  for (const pattern of speakerPatterns) {
    const found = tail.match(pattern)
    if (found?.[1]) {
      const candidate = found[1].trim()
      if (!/^(我|你|他|她|它|这|那|一个|一位|对方|别人)$/.test(candidate)) {
        return candidate
      }
    }
  }

  return ''
}

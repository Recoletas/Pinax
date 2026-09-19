// S05 方法组合与检查器整合的对照样本（计划 §7 S05：方法有对照样本）。
// 只服务 scripts/writing-skills-* eval；不是前端运行时依赖。
import { createWritingDocument } from '../../src/services/writing/writingDocumentSchema.js'

export function createWritingSkillFixtures() {
  const paragraphs = [
    '雾在黄昏时涨得最快，等莉娜数完第三盏航灯，码头石阶已经只剩顶端一线。',
    '抄表员的规矩是黄昏起雾时数航灯，灯亮一盏记一盏，灯灭一盏也记一盏。',
    '旧港的钟楼在雾里敲了七下，第七下拖得很长，像有人按住了钟舌。',
    '莉娜记得清清楚楚，钟楼的钟三年前就裂了，簿册上也早就把它除了名。',
    '更奇怪的是灯塔，塔顶的灯没有转，光柱直直指着海湾深处的黑石礁。',
    '回家的路上她数了七次心跳，雾才重新合拢，今晚一定有什么不一样。',
    '她压低声音说：‘这话我只告诉你一个人。”然后把册子收进木箱。'
  ]
  const document = createWritingDocument(paragraphs.join('\n\n'))

  // 既有本地校对规则的对照样本：嵌套引号开引号层级错误，应产出 quote finding。
  const quoteBreakBlock = {
    nodeId: 'sample-quote-break',
    text: '她压低声音说：‘这话我只告诉你一个人。”然后把册子收进木箱。'
  }

  // 退化检测对照样本：同块内长句复读、结尾截断、括号省略占位。
  const degenerationBlocks = [
    {
      nodeId: 'sample-repeat',
      text: [
        '守卫沿着湿滑的石阶向上奔跑，灯笼在风里摇晃。',
        '守卫沿着湿滑的石阶向上奔跑，灯笼在风里摇晃。',
        '守卫沿着湿滑的石阶向上奔跑，灯笼在风里摇晃。'
      ].join('')
    },
    {
      nodeId: 'sample-truncated',
      text: '灯下的人抬起头，还没来得及说完那句'
    },
    {
      nodeId: 'sample-placeholder',
      text: '他们搜遍了整个税务所（此处省略），最后在钟楼里找到了那册账本。'
    }
  ]

  // 干净样本：修辞性重复与台词不算退化，必须零命中。
  const cleanBlocks = [
    {
      nodeId: 'sample-clean-parallel',
      text: '她数航灯，他数心跳，我数雾。灯亮了。灯灭了。灯又亮了。'
    },
    {
      nodeId: 'sample-clean-dialogue',
      text: '“作为AI，我会保护你。”她照着剧本念完，把册子合上，收在句号里。'
    }
  ]

  const source = {
    projectId: 'eval-writing-skills',
    documentRole: 'manuscript',
    documentId: 'eval-ch-1',
    chapterId: 'eval-ch-1',
    documentRevision: '3',
    title: '魔力异常',
    document
  }
  return { source, quoteBreakBlock, degenerationBlocks, cleanBlocks }
}

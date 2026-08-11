const scene = (index, length = 820) => {
  const seed = `第${index}场\n\n窗外的雨落在旧站台上，铁轨把远处的灯光切成一段一段。${index % 2 ? '她没有立刻回答，只把手放在门栓上。' : '他翻过手里的纸页，确认墨迹还没有被潮气晕开。'} `
  const paragraph = '候车厅里没有人催促，只有钟摆在墙面后面规律地敲响。这个细节让场景保持安静，也给下一步动作留下清楚的位置。'
  return `${seed}${(seed + paragraph).repeat(Math.max(1, Math.ceil(length / (seed.length + paragraph.length))))}`.slice(0, length)
}

export const writingNotebookFixtures = [
  { id: 'empty', label: '空章', markdown: '' },
  {
    id: 'short',
    label: '多人对白与批注',
    markdown: '# 雾港报到\n\n> 作者注：保留安静的开场节奏。\n\n“你也是今天到的吗？”她问。\n\n“是。”他看了一眼门外的雨。\n\n---\n\n> 来源：素材页·雾港车站\n\n他把通知单折好，走进亮着黄灯的候车厅。'
  },
  { id: 'five-k', label: '5k 中文章节', markdown: scene(1, 5000) },
  { id: 'twenty-k', label: '20k 中文章节', markdown: scene(2, 20000) },
  { id: 'hundred-k', label: '100k 中文章节', markdown: scene(3, 100000) },
  {
    id: 'mixed-markdown',
    label: '混合 Markdown',
    markdown: '# 第一幕\n\n普通段落里有**重点**、*心理*、`术语`和[来源](https://example.com)。\n\n> 作者注：不要提前引入冲突。\n\n## 第二场\n\n---\n\n结尾保留空行。\n\n'
  }
]

export default writingNotebookFixtures

import { defineConfig } from 'vitepress'

// 本地开发走 :5174，不和前端 Vite (:5173) 抢端口
// base 留 '/'; 真要部署到 GitHub Pages (recoletas.github.io/Pinax) 时改为 '/Pinax/'
export default defineConfig({
  title: 'Pinax 工程文档',
  description: 'Pinax 的开发、架构、验证与维护记录',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  server: {
    port: 5174,
    strictPort: false,
  },

  themeConfig: {
    nav: [
      { text: '工程首页', link: '/' },
      { text: '使用 Pinax', link: 'https://github.com/Recoletas/Pinax/tree/main/docs/user-manual' },
      { text: '自行部署', link: 'https://github.com/Recoletas/Pinax#开发者本地运行' },
      {
        text: '仓库',
        items: [
          { text: 'GitHub', link: 'https://github.com/Recoletas/Pinax' },
          { text: '贡献指南', link: 'https://github.com/Recoletas/Pinax/blob/main/CONTRIBUTING.md' },
        ],
      },
    ],

    sidebar: [
      {
        text: '概览',
        items: [
          { text: '框架入口', link: '/' },
          { text: '代码库地图', link: '/code-map' },
          { text: '已知问题', link: '/known-issues' },
          { text: '测例状态', link: '/test-status' },
        ],
      },
      {
        text: '决策记录',
        items: [
          { text: 'ADR 索引', link: '/decisions/' },
          { text: 'ADR-0001 perf-profiling', link: '/decisions/ADR-0001-map-gen-perf-profiling' },
          { text: 'ADR-0002 nations-perf-fix', link: '/decisions/ADR-0002-nations-perf-fix' },
          { text: 'ADR-0003 azgaar-pipeline', link: '/decisions/ADR-0003-azgaar-pipeline' },
          { text: 'ADR-0004 oss-replacements', link: '/decisions/ADR-0004-engine-oss-replacements' },
        ],
      },
      {
        text: '公开草案 (RFC)',
        items: [
          { text: 'RFC 索引', link: '/rfcs/' },
          { text: 'perf-profiling', link: '/rfcs/perf-profiling/' },
          { text: 'nations-perf-fix', link: '/rfcs/nations-perf-fix/' },
          { text: 'azgaar-pipeline', link: '/rfcs/azgaar-pipeline/' },
          { text: 'engine-oss-replacements', link: '/rfcs/engine-oss-replacements/' },
        ],
      },
      {
        text: 'Legacy Archive (GitHub)',
        items: [
          { text: 'superpowers/specs/ (历史规格)', link: 'https://github.com/Recoletas/Pinax/tree/main/docs/superpowers/specs' },
          { text: 'superpowers/plans/ (历史实施计划)', link: 'https://github.com/Recoletas/Pinax/tree/main/docs/superpowers/plans' },
          { text: 'superpowers/notes/ (perf-overlay 等)', link: 'https://github.com/Recoletas/Pinax/tree/main/docs/superpowers/notes' },
          { text: 'plan/ (历史迭代计划)', link: 'https://github.com/Recoletas/Pinax/tree/main/docs/plan' },
          { text: 'LOG.md (开发日志)', link: 'https://github.com/Recoletas/Pinax/blob/main/docs/LOG.md' },
          { text: 'PLAN.md (项目主线)', link: 'https://github.com/Recoletas/Pinax/blob/main/docs/PLAN.md' },
        ],
      },
    ],

    search: { provider: 'local' },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Recoletas/Pinax' },
    ],

    footer: {
      message: '工程站记录开发事实；作者操作请查看使用指南',
      copyright: ' ',
    },
  },
})

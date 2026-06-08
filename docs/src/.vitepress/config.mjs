import { defineConfig } from 'vitepress'

// 本地开发走 :5174，不和前端 Vite (:5173) 抢端口
// base 留 '/'; 真要部署到 GitHub Pages (recoletas.github.io/Pinax) 时改为 '/Pinax/'
export default defineConfig({
  title: 'Pinax 内文档',
  description: '项目内文档框架 — 高信号、agent 友好',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,

  server: {
    port: 5174,
    strictPort: false,
  },

  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      {
        text: '外部',
        items: [
          { text: 'GitHub', link: 'https://github.com/Recoletas/Pinax' },
          { text: '用户手册 (GitHub)', link: 'https://github.com/Recoletas/Pinax/tree/main/docs/user-manual' },
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
      message: 'docs/src 是项目内文档框架 — 高信号、agent 友好',
      copyright: ' ',
    },
  },
})

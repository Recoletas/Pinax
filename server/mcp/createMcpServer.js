import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError
} from '@modelcontextprotocol/sdk/types.js'
import { projectTools } from './tools/projectTools.js'
import { chapterTools } from './tools/chapterTools.js'
import { worldbookTools } from './tools/worldbookTools.js'
import { outlineTools } from './tools/outlineTools.js'
import { agentTools } from './tools/agentTools.js'
import { expertTools } from './tools/expertTools.js'
import { writeTools } from './tools/writeTools.js'
import { importTools } from './tools/importTools.js'
import { knowledgeTools } from './tools/knowledgeTools.js'

export const MCP_SERVER_NAME = 'pinax-local'
export const MCP_SERVER_VERSION = '0.5.0'

export const tools = [
  ...projectTools,
  ...chapterTools,
  ...worldbookTools,
  ...outlineTools,
  ...agentTools,
  ...expertTools,
  ...writeTools,
  ...importTools,
  ...knowledgeTools
]
const toolsByName = new Map(tools.map((tool) => [tool.name, tool]))

const INSTRUCTIONS = [
  'Pinax 本地 MCP：只服务本地项目文件夹（含 .pinax/project.json）。',
  '浏览器缓存项目没有可读目录，调用会返回 ERR_NOT_LOCAL_PROJECT。',
  '先 pinax_project_list / pinax_project_open 定位项目，再用 chapter / worldbook / outline 工具读取。',
  '章节正文用 pinax_chapter_read 分页读取，避免一次塞满上下文。',
  '新建项目用 pinax_project_init；作者既有稿子整目录进项目用 pinax_project_import（先 dryRun 看计划，再 dryRun:false 落盘），单类文本用 pinax_rule_write / pinax_worldbook_write / pinax_chapter_import（只导入，不生成）。',
  'RAG 是文件目录的派生投影：导入或改完资料后用 pinax_project_index（status 只盘点，sync 走既有索引链）同步，检索用 pinax_knowledge_search；正文/大纲不进 RAG 输入集。',
  'pinax_agent_ask 会把项目上下文交给本机 Pinax 既有 Agent 任务链做只读问答，不写文件。',
  'pinax_expert_list / pinax_expert_invoke 使用专家配置（应用数据目录 experts.json）提问，仍只读。',
  'pinax_chapter_write 只把改写写成 .pinax/proposals/ 审阅提案，绝不修改 正文/ 原稿。'
].join('\n')

function publicTool(tool) {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations
  }
}

/** 工具入参运行时校验：类型/范围/枚举/additionalProperties。required 与 anyOf/allOf
 *  仍由各工具给出业务化 typed error（例如缺 question 时返回 ERR_QUESTION_REQUIRED）。 */
function validateToolArguments(tool, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: expected an object`)
  }
  const schema = tool.inputSchema || {}
  const properties = schema.properties || {}
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) {
      if (!Object.prototype.hasOwnProperty.call(properties, key)) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: unknown property "${key}"`)
      }
    }
  }
  for (const [key, def] of Object.entries(properties)) {
    const value = args[key]
    if (value === undefined || value === null) continue
    const expected = def?.type
    const typeOk = expected === 'integer'
      ? Number.isInteger(value)
      : expected === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : expected === 'string'
          ? typeof value === 'string'
          : expected === 'boolean'
            ? typeof value === 'boolean'
            : expected === 'array'
              ? Array.isArray(value)
              : expected === 'object'
                ? typeof value === 'object' && !Array.isArray(value)
                : true
    if (!typeOk) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: "${key}" must be ${expected}`)
    }
    if (typeof value === 'string') {
      if (typeof def.minLength === 'number' && value.length < def.minLength) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: "${key}" is shorter than ${def.minLength}`)
      }
      if (typeof def.maxLength === 'number' && value.length > def.maxLength) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: "${key}" is longer than ${def.maxLength}`)
      }
    }
    if (typeof value === 'number') {
      if (typeof def.minimum === 'number' && value < def.minimum) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: "${key}" is below ${def.minimum}`)
      }
      if (typeof def.maximum === 'number' && value > def.maximum) {
        throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: "${key}" is above ${def.maximum}`)
      }
    }
    if (Array.isArray(def.enum) && !def.enum.includes(value)) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: "${key}" must be one of ${def.enum.join('/')}`)
    }
    if (Array.isArray(value) && def.items?.type === 'string' && value.some((item) => typeof item !== 'string')) {
      throw new McpError(ErrorCode.InvalidParams, `Invalid arguments for tool ${tool.name}: "${key}" must be an array of strings`)
    }
  }
}

function textResult(payload, isError = false) {
  const object = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null
  return {
    content: [{ type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2) }],
    ...(object ? { structuredContent: object } : {}),
    ...(isError ? { isError: true } : {})
  }
}

export function createPinaxMcpServer({ name = MCP_SERVER_NAME, version = MCP_SERVER_VERSION, advisorBaseUrl } = {}) {
  const server = new Server(
    { name, version },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools.map(publicTool) }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = toolsByName.get(request.params?.name)
    if (!tool) {
      // MCP 规范：未知工具按协议错误 -32602 返回（与官方 SDK 高层实现一致）。
      throw new McpError(ErrorCode.InvalidParams, `Tool ${request.params?.name} not found`)
    }
    validateToolArguments(tool, request.params?.arguments || {})
    try {
      const result = await tool.run(request.params?.arguments || {}, { advisorBaseUrl })
      return textResult({ ok: true, ...(result && typeof result === 'object' ? result : { result }) })
    } catch (error) {
      return textResult({
        ok: false,
        code: error?.code || 'ERR_MCP_TOOL_FAILED',
        message: error?.message || String(error)
      }, true)
    }
  })

  return server
}

// 上下文注入：每 turn 把 Pinax 随请求带来的会话状态拼成 system prompt（注意事项 4）。
// kernel.blocks 直接复用 Pinax 已预算化的 serializeKernelWithinTextPartBudget 产物——
// 预算在源头算过一次，适配器不重算第二套真相。
import { NARRATIVE_TOOL_LIMITS, type PinaxToolName } from "./contract.ts";

export interface KernelBlock {
  kind: string;
  title?: string;
  text?: string;
  [key: string]: unknown;
}

export interface TurnRequest {
  taskId?: string;
  requestId: string;
  /** 作品归属（PR #4 审阅②）：任务开始时固定；resume 由客户端重发同值 */
  bookId?: string;
  mode: "init" | "continue" | "auto" | "respond";
  intent?: string | null;
  formatInstructions?: string;
  maxTokens?: number;
  /** Pinax serializeKernelWithinTextPartBudget 的产物 */
  kernel: { revision?: string; blocks: KernelBlock[]; toolCatalog?: { name: string }[] };
  /** 资源快照（工具桥数据源） */
  resources: {
    revision?: string;
    currentPlaceId?: string;
    domains: Partial<Record<PinaxToolName, unknown[]>>;
  };
  budget?: {
    agentTimeoutMs?: number;
    maxModelSteps?: number;
    maxCallsPerTurn?: number;
    maxToolResultChars?: number;
  };
  /** 恢复：附带已完成 turn 的转录，续跑而非重跑 */
  resumeFrom?: string;
}

export function buildSystemPrompt(req: TurnRequest, toolNames: PinaxToolName[]): string {
  const blocks = (req.kernel.blocks || [])
    .map((b) => {
      const t = String(b.text ?? "").trim();
      if (!t) return "";
      return `【${b.title || b.kind}】\n${t}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const toolsGuide = toolNames.length
    ? `你可以调用以下资料工具核实设定，禁止凭记忆或虚构回答资料可查的问题：\n${toolNames
        .map((n) => `- ${n}：actions=${(["world_lookup","geo_lookup","history_lookup","memory_lookup","politics_lookup"] as const).includes(n) ? "" : ""}${JSON.stringify((TOOL_ACTIONS as Record<string, readonly string[]>)[n])}（单次最多返回 ${NARRATIVE_TOOL_LIMITS.maxItems} 条，结果≤${NARRATIVE_TOOL_LIMITS.maxResultChars}字）`)
        .join("\n")}`
    : "本轮无资料工具可用；对没有把握的设定明确说不知道，不得编造。";

  return [
    "你是 Pinax 叙事引擎中的场景生成 Agent（由 StoryFlow harness 驱动）。",
    "你的任务：依据下述会话上下文与资料工具，产出连贯、可信、符合格式要求的叙事正文。",
    "",
    "== 会话上下文（Pinax Kernel，按注入预算裁剪，revision: " + (req.kernel.revision || "-") + "）==",
    blocks || "（无注入块）",
    "",
    "== 资料工具纪律 ==",
    toolsGuide,
    "- 工具返回的 items 是唯一可信资料；引用时保持设定一致，冲突时以资料为准。",
    `- 每轮最多 ${NARRATIVE_TOOL_LIMITS.maxCallsPerRound} 次工具调用，全程最多 ${NARRATIVE_TOOL_LIMITS.maxCallsPerTurn} 次；预算耗尽必须直接产出正文。`,
    "",
    req.formatInstructions ? `== 输出格式要求 ==\n${req.formatInstructions}` : "",
  ].filter(Boolean).join("\n");
}

const TOOL_ACTIONS: Record<string, readonly string[]> = {
  world_lookup: ["search", "get", "related"],
  geo_lookup: ["current", "get", "nearby", "route"],
  history_lookup: ["search", "get", "trace"],
  memory_lookup: ["search", "get"],
  politics_lookup: ["current", "get", "trace"],
};

export function buildUserPrompt(req: TurnRequest): string {
  const modeHint: Record<TurnRequest["mode"], string> = {
    init: "开场：建立场景、人物处境与压迫感入口，铺开第一段。",
    continue: "续写当前场景，衔接最近正文，不重播已发生事件。",
    auto: "按玩家行动自动推进剧情。",
    respond: "回应玩家/角色的当前行动与对白。",
  };
  return [
    `模式：${req.mode}。${modeHint[req.mode] || ""}`,
    req.intent ? `本轮意图：${req.intent}` : "",
    `目标产出：叙事正文（约 ${req.maxTokens || 1600} tokens 预算内，先查资料后动笔）。`,
  ].filter(Boolean).join("\n");
}

// 恢复/追问：转录末尾是 assistant 正文时 pi-agent 的 continue() 会拒绝
// （Cannot continue from message role: assistant），必须以新 user 轮续接转录。
export function buildResumePrompt(req: TurnRequest): string {
  return [
    req.intent ? `作者追问/指令：${req.intent}` : "作者要求继续推进。请接着当前转录产出叙事正文，不重播已发生事件。",
    `目标产出：叙事正文（约 ${req.maxTokens || 1600} tokens 预算内，可先查资料）。`,
  ].join("\n");
}

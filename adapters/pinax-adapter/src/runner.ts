// 运行器：pi-agent 回合循环（Node 侧拥有循环）→ 事件翻译为 Pinax SSE 契约。
// 预算守护镜像 Pinax NARRATIVE_AGENT_RUNTIME_LIMITS：超限=强制收敛（收工具+要正文），不静默截断。
import { Agent } from "@earendil-works/pi-agent-core";
import {
  createNarrativeAgentStreamEvent,
  serializeNarrativeAgentSseEvent,
  NARRATIVE_TOOL_LIMITS,
  type PinaxToolName,
  type NarrativeStreamEventType,
} from "./contract.ts";
import { buildPinaxTools, type ResourceSnapshot } from "./tools.ts";
import { buildSystemPrompt, buildUserPrompt, buildResumePrompt, type TurnRequest } from "./prompt.ts";
import type { BeatPlan } from "./beatPlan.ts";
import type { AdapterConfig } from "./config.ts";
import type { TaskSnapshot } from "./store.ts";

// ---- LLM 绑定（与 storyharness/src/llm.ts 同口径：pi-ai Models，自定义端点走 setProvider）----
import {
  createModels,
  createProvider,
  envApiKeyAuth,
  type Model,
  type Models,
} from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { zaiProvider } from "@earendil-works/pi-ai/providers/zai";

export function makeModels(cfg: AdapterConfig): Models {
  const models = createModels();
  if (cfg.baseUrl) {
    const ambient = envApiKeyAuth("pinax-adapter key", ["MINIFLOW_AGENT_KEY", "ZAI_API_KEY"]);
    models.setProvider(
      createProvider({
        id: cfg.provider,
        name: cfg.provider,
        baseUrl: cfg.baseUrl,
        auth: {
          apiKey: {
            name: cfg.apiKey ? "adapter 端点 key（配置内联）" : ambient.name,
            ...(ambient.login ? { login: ambient.login } : {}),
            resolve: async (input: Parameters<NonNullable<typeof ambient.resolve>>[0]) =>
              cfg.apiKey
                ? { auth: { apiKey: cfg.apiKey }, source: "配置内联 apiKey" }
                : ambient.resolve(input),
          },
        },
        models: [
          {
            id: cfg.model,
            provider: cfg.provider,
            api: "openai-completions",
            name: cfg.model,
            baseUrl: cfg.baseUrl,
            reasoning: true,
            input: ["text"],
            contextWindow: 128_000,
            maxTokens: 16_384,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            // dots.ai 等国产 OpenAI 兼容端点实测：拒绝 developer 角色（400 provider.client_bad_request），
            // 不发 reasoning_effort；思维链以 reasoning_content 增量返回（pi-ai 原生解析）。
            compat: { supportsDeveloperRole: false, supportsStore: false, supportsReasoningEffort: false, maxTokensField: "max_tokens" },
          },
        ],
        api: openAICompletionsApi(),
        headers: cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : undefined,
      }),
    );
    return models;
  }
  if (cfg.provider === "zai") {
    if (cfg.apiKey) process.env.ZAI_API_KEY = cfg.apiKey;
    models.setProvider(zaiProvider());
  }
  return models;
}

const BUDGETS: Record<string, { minimal?: number; low?: number; medium?: number; high?: number }> = {
  off: {},
  low: { low: 1024, medium: 2048, high: 4096 },
  medium: { low: 2048, medium: 8192, high: 16384 },
  high: { low: 4096, medium: 16384, high: 32384 },
};

export interface RunHandle {
  taskId: string;
  requestId: string;
  /** 订阅翻译后的 Pinax SSE 帧（含任务尾部扩展帧） */
  onFrame: (listener: (frame: string) => void) => () => void;
  abort: (reason?: string) => void;
  done: Promise<TaskSnapshot>;
}

interface RunCounters {
  steps: number;
  toolCalls: number;
  roundsInTurn: number;
  turnToolFlags: boolean;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
}

function usageOf(message: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } | undefined {
  const u = (message as { usage?: Record<string, number> })?.usage;
  if (!u) return undefined;
  return {
    inputTokens: Number(u.input ?? u.inputTokens ?? 0),
    outputTokens: Number(u.output ?? u.outputTokens ?? 0),
    totalTokens: Number(u.totalTokens ?? (Number(u.input ?? 0) + Number(u.output ?? 0))),
  };
}

export function createRun(req: TurnRequest, cfg: AdapterConfig, snapshot: ResourceSnapshot, opts: { resumeMessages?: unknown[] } = {}): RunHandle {
  const listeners = new Set<(frame: string) => void>();
  let seq = 0;
  const emit = (type: NarrativeStreamEventType, payload: Record<string, unknown>) => {
    const frame = serializeNarrativeAgentSseEvent(
      createNarrativeAgentStreamEvent(type, payload, { requestId: req.requestId, seq: ++seq, at: Date.now() }),
    );
    for (const l of listeners) l(frame);
    return frame;
  };
  // 扩展帧：Pinax 流契约之外的任务生命周期信号（客户端可安全忽略未知事件）
  const emitTask = (event: string, data: Record<string, unknown>) => {
    const frame = `event: task.${event}\ndata: ${JSON.stringify({ requestId: req.requestId, at: Date.now(), ...data })}\n\n`;
    for (const l of listeners) l(frame);
  };

  const budget = { ...cfg.budget, ...(req.budget || {}) };
  const counters: RunCounters = { steps: 0, toolCalls: 0, roundsInTurn: 0, turnToolFlags: false, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };

  const models = makeModels(cfg);
  const model = models.getModel(cfg.provider, cfg.model) as Model<any>;
  if (!model) throw new Error(`模型不可解析：${cfg.provider}/${cfg.model}（自定义端点需配 baseUrl）`);

  const toolNames = (Object.keys(snapshot.domains) as PinaxToolName[]).filter((n) => (snapshot.domains[n]?.length || 0) > 0);
  // BeatPlan 规划轮（②）：init/auto/respond 计划先行；continue 复用当前计划不暴露。
  // 受理的节拍计划落 runExtras + 扩展帧 beat.plan（契约枚举外，上游 parser 安全忽略）。
  const runExtras: { beatPlan: Record<string, unknown> | null } = { beatPlan: null };
  const beatPlanEnabled = req.mode !== "continue";
  const toolHooks: Parameters<typeof buildPinaxTools>[2] = beatPlanEnabled
    ? {
        onBeatPlan: (plan: BeatPlan, revision: string) => {
          runExtras.beatPlan = { ...plan, revision };
          const frame = `event: beat.plan\ndata: ${JSON.stringify({ requestId: req.requestId, at: Date.now(), plan: runExtras.beatPlan })}\n\n`;
          for (const l of listeners) l(frame);
        },
      }
    : undefined;
  const tools = buildPinaxTools(snapshot, toolNames, toolHooks);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("PINAX_ADAPTER_AGENT_TIMEOUT")), budget.agentTimeoutMs);

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(req, toolNames, { beatPlanEnabled }),
      model,
      tools,
      ...(opts.resumeMessages?.length ? { messages: opts.resumeMessages as never } : {}),
    },
    thinkingBudgets: BUDGETS[cfg.thinking] ?? BUDGETS.medium,
    streamFn: (m, context, options) =>
      models.streamSimple(m, context as never, { ...(options as Record<string, unknown> | undefined), maxTokens: req.maxTokens && req.maxTokens > 8000 ? req.maxTokens : 32_768, timeoutMs: budget.agentTimeoutMs } as never) as never,
    beforeToolCall: async (ctx) => {
      // 单轮调用限额（镜像 maxCallsPerRound）
      if (counters.roundsInTurn >= NARRATIVE_TOOL_LIMITS.maxCallsPerRound) {
        return { block: true, reason: `本轮工具调用已达上限（${NARRATIVE_TOOL_LIMITS.maxCallsPerRound}），请直接依据已有资料产出正文。` };
      }
      return undefined;
    },
  });

  let finalText = "";

  agent.subscribe((ev) => {
    switch (ev.type) {
      case "turn_start":
        counters.steps += 1;
        counters.roundsInTurn = 0;
        counters.turnToolFlags = false;
        emit("step.start", { stepIndex: Math.min(counters.steps - 1, 20), toolChoice: agent.state.tools.length ? "auto" : "none" });
        break;
      case "message_update": {
        const aev = (ev as { assistantMessageEvent?: { type: string; delta?: string } }).assistantMessageEvent;
        if (aev?.type === "text_delta" && aev.delta) emit("text.delta", { content: aev.delta });
        // 思维链增量（dots 等深度思考模型）：契约枚举之外的扩展帧，上游 parser 按设计安全忽略
        if (aev?.type === "thinking_delta" && aev.delta) {
          const frame = `event: reasoning.delta\ndata: ${JSON.stringify({ requestId: req.requestId, at: Date.now(), delta: String(aev.delta) })}\n\n`;
          for (const l of listeners) l(frame);
        }
        break;
      }
      case "message_end": {
        const u = usageOf((ev as { message?: unknown }).message);
        if (u) {
          counters.usage.inputTokens += u.inputTokens;
          counters.usage.outputTokens += u.outputTokens;
          counters.usage.totalTokens += u.totalTokens;
          emit("usage", { usage: u });
        }
        const msg = (ev as { message?: { role?: string; content?: unknown[] } }).message;
        if (msg?.role === "assistant") {
          const text = (msg.content || [])
            .filter((b) => (b as { type?: string }).type === "text")
            .map((b) => (b as { text?: string }).text || "")
            .join("");
          if (text) finalText = text;
        }
        break;
      }
      case "tool_execution_start": {
        counters.toolCalls += 1;
        counters.roundsInTurn += 1;
        counters.turnToolFlags = true;
        const args = (ev as { args?: Record<string, unknown> }).args || {};
        emit("tool.input.delta", { callId: (ev as { toolCallId?: string }).toolCallId, toolName: (ev as { toolName?: string }).toolName, input: args });
        emit("tool.call", { callId: (ev as { toolCallId?: string }).toolCallId, toolName: (ev as { toolName?: string }).toolName, action: String(args.action || "") });
        break;
      }
      case "turn_end":
        emit("step.finish", {
          stepIndex: Math.min(counters.steps - 1, 20),
          status: counters.turnToolFlags ? "tool_calls" : "final_ready",
          terminalMode: counters.turnToolFlags ? "tool-round" : "direct-text",
          toolRounds: counters.turnToolFlags ? 1 : 0,
          totalCalls: counters.toolCalls,
          finishReason: "",
        });
        // 收敛闸：达步数上限仍在用工具 → 收掉工具，下一回合只能成文（镜像 Pinax evidenceExhausted→toolChoice:none）
        if (counters.turnToolFlags && counters.steps >= budget.maxModelSteps && agent.state.tools.length) {
          agent.state.tools.length = 0;
        }
        break;
      default:
        break;
    }
  });

  const abort = (reason = "PINAX_ADAPTER_CANCELLED") => {
    try { ac.abort(new Error(reason)); } catch { /* already aborted */ }
  };
  ac.signal.addEventListener("abort", () => { try { agent.abort(); } catch { /* not running */ } });

  const start = async (): Promise<TaskSnapshot> => {
    // PR #4 审阅④：启动即广播 taskId——此前客户端要等任务结束才知道 id，运行中取消无从下手
    emitTask("started", { status: "running", taskId: req.taskId || "", ...(req.bookId ? { bookId: req.bookId } : {}) });
    const base: Omit<TaskSnapshot, "status" | "finalText" | "messages" | "error"> = {
      taskId: req.taskId || "", requestId: req.requestId, createdAt: Date.now(), updatedAt: Date.now(),
      mode: req.mode, ...(req.bookId ? { bookId: req.bookId } : {}),
      steps: counters.steps, toolCalls: counters.toolCalls, usage: counters.usage,
    };
    // abort 竞速：provider 侧悬挂时 Promise 可能不 settle，取消必须硬落账（cancellation 可用性）
    const abortGate = new Promise<never>((_, reject) => {
      if (ac.signal.aborted) reject(new Error("PINAX_ADAPTER_ABORTED"));
      ac.signal.addEventListener("abort", () => reject(new Error(String((ac.signal.reason as Error)?.message || "PINAX_ADAPTER_ABORTED"))));
    });
    try {
      await Promise.race([
        opts.resumeMessages?.length ? agent.prompt(buildResumePrompt(req)) : agent.prompt(buildUserPrompt(req)),
        abortGate,
      ]);
      if (!finalText.trim()) {
        // 守卫：provider 无 key/端点异常曾被静默吞成「空成功」——这里显式落 failed（实验抓到的缺陷）
        const err = { code: "PINAX_ADAPTER_EMPTY_COMPLETION", message: "回合结束但未产出正文（多为 provider 鉴权失败或端点异常）", retryable: false };
        emit("error", { code: err.code, message: err.message, retryable: err.retryable });
        emitTask("failed", { status: "failed", taskId: req.taskId || base.taskId, error: err });
        return { ...base, steps: counters.steps, toolCalls: counters.toolCalls, beatPlan: runExtras.beatPlan, status: "failed", finalText, messages: agent.state.messages as unknown[], error: err };
      }
      emit("usage", { usage: counters.usage });
      emitTask("completed", { status: "completed", taskId: req.taskId || base.taskId, model: `${cfg.provider}.${cfg.model}`, usage: counters.usage, steps: counters.steps, toolCalls: counters.toolCalls, textChars: finalText.length, beatPlan: runExtras.beatPlan });
      return { ...base, steps: counters.steps, toolCalls: counters.toolCalls, beatPlan: runExtras.beatPlan, status: "completed", finalText, messages: agent.state.messages as unknown[] };
    } catch (e) {
      const aborted = ac.signal.aborted;
      const msg = String((e as Error)?.message || e);
      const err = aborted
        ? { code: "PINAX_ADAPTER_ABORTED", message: "任务已取消/超时", retryable: true }
        : { code: "PINAX_AGENT_RUN_FAILED", message: msg.slice(0, 240), retryable: /terminated|fetch|ECONN|network|timed out/i.test(msg) };
      emit("error", { code: err.code, message: err.message, retryable: err.retryable });
      emitTask("failed", { status: aborted ? "cancelled" : "failed", taskId: req.taskId || base.taskId, error: err });
      return { ...base, steps: counters.steps, toolCalls: counters.toolCalls, beatPlan: runExtras.beatPlan, status: aborted ? "cancelled" : "failed", finalText, messages: agent.state.messages as unknown[], error: err };
    } finally {
      clearTimeout(timer);
    }
  };

  // 启动推迟一个微任务：server 在 createRun 返回后才订阅 onFrame——同步启动会让
  // task.started 帧发进空监听集（客户端永远收不到 taskId，运行中取消无从下手）
  const run: Promise<TaskSnapshot> = Promise.resolve().then(start);
  return {
    taskId: req.taskId || "",
    requestId: req.requestId,
    onFrame: (l) => { listeners.add(l); return () => listeners.delete(l); },
    abort,
    done: run,
  };
}

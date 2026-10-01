// 接入件类型面（实现为 JS，供 TS 侧消费；Pinax 本体是 JS，此文件只服务类型检查）
export interface BridgeBudget {
  agentTimeoutMs?: number;
  maxModelSteps?: number;
  maxCallsPerTurn?: number;
  maxItemsPerDomain?: number;
}

export interface BridgeRunArgs {
  kernel: any;
  index: any;
  registry?: { revision?: string } | null;
  mode?: "init" | "continue" | "auto" | "respond";
  intent?: string | null;
  formatInstructions?: string;
  maxTokens?: number;
  requestId?: string;
  /** 作品归属（PR #4 审阅②）：任务开始时固定，适配器全程携带并落账 */
  bookId?: string | null;
  signal?: AbortSignal | null;
  callbacks?: {
    onChunk?: (chunk: { content: string }) => void;
    onComplete?: (r: { content: string }) => void;
    onTask?: (data: Record<string, unknown> | null, eventName: string) => void;
    onReasoning?: (chunk: { content: string }) => void;
  };
  onStatus?: ((status: unknown) => void) | null;
  budget?: BridgeBudget | null;
  taskId?: string | null;
}

export interface BridgeRunResult {
  ok: boolean;
  finalContent: string;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  toolRounds: number;
  totalCalls: number;
  trace: {
    engine: string;
    taskId: string | null;
    status: string;
    steps?: number;
    toolRounds?: number;
    calls?: { name: string; action?: string }[];
    [key: string]: any;
  };
  finalToolResults: unknown[];
}

export interface BridgeResumeArgs {
  taskId: string;
  kernel: any;
  index: any;
  intent?: string | null;
  /** 归属不变式：续跑重发同值；漏发时适配器以快照为准（旧任务永远归旧作品） */
  bookId?: string | null;
  callbacks?: {
    onChunk?: (chunk: { content: string }) => void;
    onComplete?: (r: { content: string }) => void;
    onTask?: (data: Record<string, unknown> | null, eventName: string) => void;
    onReasoning?: (chunk: { content: string }) => void;
  };
  onStatus?: ((status: unknown) => void) | null;
  signal?: AbortSignal | null;
  requestId?: string;
}

export interface PinaxNarrativeAgentBridge {
  healthz(): Promise<Record<string, unknown> | null>;
  run(args: BridgeRunArgs): Promise<BridgeRunResult>;
  status(taskId: string): Promise<Record<string, unknown> | null>;
  cancel(taskId: string): Promise<Record<string, unknown> | null>;
  resume(args: BridgeResumeArgs): Promise<{ ok: boolean; finalContent: string; trace: Record<string, unknown> }>;
  tasks(): Promise<Record<string, unknown> | null>;
}

export declare function createPiNarrativeAgentBridge(options?: {
  endpoint?: string;
  fetchImpl?: typeof globalThis.fetch;
  parseEvent?: ((raw: string) => Record<string, unknown> | null) | null;
}): PinaxNarrativeAgentBridge;

export declare function buildResourceSnapshot(
  index: any,
  options?: { maxItemsPerDomain?: number },
): { revision: string; currentPlaceId: string; domains: Record<string, Record<string, unknown>[]> };

export declare function buildKernelPayload(kernel: any): { revision: string; blocks: { kind: string; title: string; text: string }[] };

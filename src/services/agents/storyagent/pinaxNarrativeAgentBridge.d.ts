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
  signal?: AbortSignal | null;
  callbacks?: { onChunk?: (chunk: { content: string }) => void; onComplete?: (r: { content: string }) => void };
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
  callbacks?: { onChunk?: (chunk: { content: string }) => void; onComplete?: (r: { content: string }) => void };
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

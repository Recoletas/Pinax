// 任务状态仓：运行态落盘（Issue #3 的 task state / cancellation / recovery）。
// 形态沿底座纪律：JSONL 追加 + 末行快照，坏行跳过不炸整读。
import * as fs from "node:fs";
import path from "node:path";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskSnapshot {
  taskId: string;
  requestId: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  mode: string;
  /** 作品归属（PR #4 审阅②）：任务创建时固定的归属锚（面板传当前作品绑定 id）；缺省 = 未归属（历史任务） */
  bookId?: string;
  steps: number;
  toolCalls: number;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  /** pi-agent 转录（AgentMessage[]），恢复时重放 */
  messages: unknown[];
  finalText: string;
  /** BeatPlan 规划轮（②）：本回合受理的节拍计划（含 revision）；continue 模式或未提交时缺省 */
  beatPlan?: Record<string, unknown> | null;
  error?: { code: string; message: string; retryable?: boolean };
}

export class TaskStore {
  private readonly dir: string;

  constructor(tasksDir: string) {
    this.dir = tasksDir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private fileFor(taskId: string): string {
    const safe = String(taskId).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    return path.join(this.dir, `task-${safe}.jsonl`);
  }

  append(snapshot: TaskSnapshot): void {
    const line = JSON.stringify({ ...snapshot, updatedAt: Date.now() }) + "\n";
    fs.appendFileSync(this.fileFor(snapshot.taskId), line, "utf-8");
  }

  load(taskId: string): TaskSnapshot | undefined {
    const f = this.fileFor(taskId);
    if (!fs.existsSync(f)) return undefined;
    let last: TaskSnapshot | undefined;
    for (const raw of fs.readFileSync(f, "utf-8").split(/\r?\n/)) {
      if (!raw.trim()) continue;
      try {
        last = JSON.parse(raw);
      } catch { /* 坏行跳过（一行坏不炸整读） */ }
    }
    return last;
  }

  list(limit = 50): { taskId: string; status: TaskStatus; updatedAt: number; bookId?: string }[] {
    const out: { taskId: string; status: TaskStatus; updatedAt: number; bookId?: string }[] = [];
    for (const name of fs.readdirSync(this.dir)) {
      const m = /^task-(.+)\.jsonl$/.exec(name);
      if (!m) continue;
      const snap = this.load(m[1]);
      // bookId 随列表外露（PR #4 审阅②）：面板按作品过滤会话的数据源
      if (snap) out.push({ taskId: snap.taskId, status: snap.status, updatedAt: snap.updatedAt, ...(snap.bookId ? { bookId: snap.bookId } : {}) });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }
}

export function newTaskId(): string {
  return `ptask_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

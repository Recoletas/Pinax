// HTTP/SSE 门面：任务级端点。Pinax 客户端经 fetch+ReadableStream 消费。
// 端点：POST /v1/pinax/tasks（开跑+SSE）、POST /v1/pinax/tasks/:id/resume（恢复+SSE）、
//       POST /v1/pinax/tasks/:id/cancel（取消）、GET /v1/pinax/tasks/:id（状态）、GET /healthz
import * as http from "node:http";
import { loadConfig } from "./config.ts";
import { TaskStore, newTaskId, type TaskSnapshot } from "./store.ts";
import { createRun, type RunHandle } from "./runner.ts";
import { parseNarrativeAgentSseEvent, createNarrativeAgentStreamEvent, serializeNarrativeAgentSseEvent, NARRATIVE_TOOL_LIMITS } from "./contract.ts";
import type { TurnRequest } from "./prompt.ts";

const active = new Map<string, RunHandle>();

function json(res: http.ServerResponse, code: number, body: unknown) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  });
  res.end(JSON.stringify(body));
}

function sseHead(res: http.ServerResponse) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "access-control-allow-origin": "*",
  });
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf-8");
}

function validate(reqBody: unknown): { ok: true; value: TurnRequest } | { ok: false; error: string } {
  const b = reqBody as TurnRequest;
  if (!b || typeof b !== "object") return { ok: false, error: "请求体必须是 JSON 对象" };
  if (!b.requestId || typeof b.requestId !== "string") return { ok: false, error: "requestId 必填" };
  if (!["init", "continue", "auto", "respond"].includes(b.mode)) return { ok: false, error: "mode 必须是 init/continue/auto/respond" };
  if (!b.kernel || !Array.isArray(b.kernel.blocks)) return { ok: false, error: "kernel.blocks 必填（Pinax serializeKernelWithinTextPartBudget 产物）" };
  if (!b.resources || typeof b.resources.domains !== "object") return { ok: false, error: "resources.domains 必填（Pinax 资源快照）" };
  return { ok: true, value: b };
}

export function startServer(overrides = {}) {
  const cfg = loadConfig(overrides);
  const store = new TaskStore(cfg.tasksDir);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${cfg.host}`);
    const seg = url.pathname.split("/").filter(Boolean);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      return res.end();
    }
    if (url.pathname === "/healthz") return json(res, 200, { ok: true, service: "pinax-adapter", port: cfg.port });

    try {
      // POST /v1/pinax/tasks
      if (req.method === "POST" && seg.join("/") === "v1/pinax/tasks") {
        const parsed = validate(JSON.parse(await readBody(req)));
        if (!parsed.ok) return json(res, 400, { error: parsed.error });
        const turn = parsed.value;
        const taskId = turn.taskId || newTaskId();
        turn.taskId = taskId;
        const snapshot: TaskSnapshot = {
          taskId, requestId: turn.requestId, status: "running", createdAt: Date.now(), updatedAt: Date.now(),
          mode: turn.mode, steps: 0, toolCalls: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
          messages: [], finalText: "",
        };
        store.append(snapshot);
        sseHead(res);
        const run = createRun(turn, cfg, { revision: turn.resources.revision, currentPlaceId: turn.resources.currentPlaceId, domains: turn.resources.domains as never });
        active.set(taskId, run);
        const off = run.onFrame((f) => res.write(f));
        const final = await run.done;
        off();
        store.append({ ...final, taskId, status: final.status });
        active.delete(taskId);
        return res.end();
      }

      // POST /v1/pinax/tasks/:id/resume | /cancel, GET /v1/pinax/tasks/:id
      if (seg[0] === "v1" && seg[1] === "pinax" && seg[2] === "tasks" && seg[3]) {
        const taskId = seg[3];
        const action = seg[4];
        if (req.method === "GET" && !action) {
          if (taskId === "list") return json(res, 200, { tasks: store.list() });
          const snap = store.load(taskId);
          return snap ? json(res, 200, { ...snap, messages: undefined, finalTextChars: snap.finalText.length })
            : json(res, 404, { error: "task-not-found" });
        }
        if (req.method === "POST" && action === "cancel") {
          const run = active.get(taskId);
          if (run) {
            run.abort("PINAX_ADAPTER_CANCELLED");
            return json(res, 200, { ok: true, cancelling: true });
          }
          const snap = store.load(taskId);
          if (!snap) return json(res, 404, { error: "task-not-found" });
          if (snap.status === "running") store.append({ ...snap, status: "cancelled" });
          return json(res, 200, { ok: true, status: snap.status === "running" ? "cancelled" : snap.status });
        }
        if (req.method === "POST" && action === "resume") {
          const snap = store.load(taskId);
          if (!snap) return json(res, 404, { error: "task-not-found" });
          if (snap.status === "running" && active.has(taskId)) return json(res, 409, { error: "task-already-running" });
          if (!snap.messages?.length) return json(res, 422, { error: "task-not-resumable", hint: "无转录快照" });
          // resume 需要一个最小 TurnRequest（mode/kernel/resources 由客户端重发，转录来自快照）
          const parsed = validate(JSON.parse(await readBody(req)));
          if (!parsed.ok) return json(res, 400, { error: parsed.error });
          const turn = { ...parsed.value, taskId, requestId: parsed.value.requestId || snap.requestId };
          sseHead(res);
          const run = createRun(turn, cfg, { revision: turn.resources.revision, currentPlaceId: turn.resources.currentPlaceId, domains: turn.resources.domains as never }, { resumeMessages: snap.messages });
          active.set(taskId, run);
          const off = run.onFrame((f) => res.write(f));
          const final = await run.done;
          off();
          store.append({ ...final, taskId, status: final.status });
          active.delete(taskId);
          return res.end();
        }
      }

      // 契约自检：GET /v1/pinax/contract 回显一帧，供 Pinax 侧用 parseNarrativeAgentSseEvent 验证接线
      if (req.method === "GET" && url.pathname === "/v1/pinax/contract") {
        sseHead(res);
        const frame = serializeNarrativeAgentSseEvent(
          createNarrativeAgentStreamEvent("step.start", { stepIndex: 0, toolChoice: "auto" }, { requestId: "contract-probe", seq: 1, at: Date.now() }),
        );
        res.write(frame);
        // 自检用同一把 parser：解析不出自己发的帧 = 契约镜像件坏了
        if (!parseNarrativeAgentSseEvent(frame)) {
          res.write(serializeNarrativeAgentSseEvent(createNarrativeAgentStreamEvent("error", { code: "SELF_CHECK_FAILED", message: "本地契约件无法解析自身产物" }, { requestId: "contract-probe", seq: 2 })));
        }
        return res.end();
      }

      return json(res, 404, { error: "not-found", endpoints: ["/v1/pinax/tasks", "/v1/pinax/tasks/:id", "/v1/pinax/tasks/:id/resume", "/v1/pinax/tasks/:id/cancel", "/v1/pinax/contract", "/healthz"] });
    } catch (e) {
      return json(res, 500, { error: "adapter-internal", message: String((e as Error).message).slice(0, 300) });
    }
  });

  server.listen(cfg.port, cfg.host, () => {
    console.error(`[pinax-adapter] listening on http://${cfg.host}:${cfg.port} (model=${cfg.provider}.${cfg.model}, toolResultCap=${NARRATIVE_TOOL_LIMITS.maxResultChars})`);
  });
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href) {
  startServer();
}

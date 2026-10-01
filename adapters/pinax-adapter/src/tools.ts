// 工具桥：Pinax 五 lookup → pi-agent 工具环。
// 数据源 = 请求携带的资源快照（snapshot），由 Pinax 客户端从 narrativeResourceIndex 现建带上来——
// 这解决了「数据在浏览器 stores、Node fs 看不见」的一致性缺口（注意事项 3 的落地答案）。
// 语义镜像上游：action 枚举、限额（maxItems/maxQueryChars/maxResultChars）、结果形状（domain/action/items/revision/warnings）。
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { NARRATIVE_TOOL_LIMITS, NARRATIVE_READ_TOOLS, PINAX_TOOL_NAMES, type PinaxToolName } from "./contract.ts";
import { NARRATIVE_BEAT_PLAN_TOOL, narrativeBeatPlanRevision, narrativeBeatPlanToolSchema, validateNarrativeBeatPlanInput, type BeatPlan } from "./beatPlan.ts";

const L = NARRATIVE_TOOL_LIMITS;

export interface SnapshotItem {
  id: string;
  title?: string;
  type?: string;
  summary?: string;
  text?: string;
  aliases?: string[];
  tags?: string[];
  relations?: { type: string; targetId: string }[];
  trust?: string;
  sourceRefs?: string[];
  /** geo 专用 */
  position?: { x: number; y: number };
  connectedPlaces?: string[];
  routeFrom?: string;
  /** politics 专用 */
  faction?: string;
  controls?: string[];
  /** history 专用 */
  time?: string;
  cause?: string;
}

export interface ResourceSnapshot {
  revision?: string;
  currentPlaceId?: string;
  domains: Partial<Record<PinaxToolName, SnapshotItem[]>>;
}

function clip(value: string, limit: number): string {
  const s = String(value ?? "");
  return s.length > limit ? `${s.slice(0, limit - 1)}…` : s;
}

function itemLine(item: SnapshotItem, limit: number): string {
  const parts = [
    item.id,
    item.title ? `《${item.title}》` : "",
    item.type ? `[${item.type}]` : "",
    item.trust ? `(${item.trust})` : "",
    clip(item.summary || item.text || "", limit),
  ].filter(Boolean);
  return parts.join(" ");
}

function matchScore(item: SnapshotItem, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const hay = [item.title, item.summary, item.text, ...(item.aliases || []), ...(item.tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  for (const token of q.split(/\s+/)) {
    if (!token) continue;
    if (item.title && item.title.toLowerCase().includes(token)) score += 4;
    if (item.aliases?.some((a) => a.toLowerCase().includes(token))) score += 3;
    if (hay.includes(token)) score += 1;
  }
  return score;
}

function search(domain: PinaxToolName, snapshot: ResourceSnapshot, query: string): SnapshotItem[] {
  const items = snapshot.domains[domain] || [];
  return items
    .map((item) => ({ item, score: matchScore(item, String(query || "").slice(0, L.maxQueryChars)) }))
    .filter((x) => x.score > 0 || !String(query || "").trim())
    .sort((a, b) => b.score - a.score)
    .slice(0, L.maxItems)
    .map((x) => x.item);
}

function getById(domain: PinaxToolName, snapshot: ResourceSnapshot, id: string): SnapshotItem | undefined {
  return (snapshot.domains[domain] || []).find((i) => i.id === id);
}

function resultEnvelope(domain: PinaxToolName, action: string, snapshot: ResourceSnapshot, items: SnapshotItem[], warnings: string[] = []) {
  const perItem = action === "get" ? L.maxGetItemChars : L.maxItemChars;
  const lines = items.map((item) => {
    const head = itemLine(item, perItem);
    const rel = (item.relations || []).slice(0, 8).map((r) => `${r.type}->${r.targetId}`).join(",");
    return rel ? `${head} 关系[${rel}]` : head;
  });
  const body = JSON.stringify({
    domain,
    action,
    revision: snapshot.revision || "snapshot",
    items: lines,
    warnings,
  });
  return clip(body, L.maxResultChars);
}

const SearchParams = Type.Object({
  action: Type.Union([Type.Literal("search"), Type.Literal("get"), Type.Literal("related")]),
  query: Type.Optional(Type.String({ description: `关键词，≤${L.maxQueryChars}字` })),
  id: Type.Optional(Type.String({ description: "条目 id（get/related 用）" })),
});

const GeoParams = Type.Object({
  action: Type.Union([Type.Literal("current"), Type.Literal("get"), Type.Literal("nearby"), Type.Literal("route")]),
  id: Type.Optional(Type.String()),
  to: Type.Optional(Type.String({ description: "route 目标地点 id" })),
});

const TraceParams = Type.Object({
  action: Type.Union([Type.Literal("search"), Type.Literal("get"), Type.Literal("trace")]),
  query: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
});

const GetSearchParams = Type.Object({
  action: Type.Union([Type.Literal("search"), Type.Literal("get")]),
  query: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
});

const PoliticsParams = Type.Object({
  action: Type.Union([Type.Literal("current"), Type.Literal("get"), Type.Literal("trace")]),
  query: Type.Optional(Type.String()),
  id: Type.Optional(Type.String()),
});

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

export function buildPinaxTools(snapshot: ResourceSnapshot, allowed?: string[], hooks?: { onBeatPlan?: (plan: BeatPlan, revision: string) => void }): AgentTool<any>[] {
  // 只暴露「快照里有资源」的域——镜像上游 registry 的 availableToolNames（无资源域不进目录）
  const present = PINAX_TOOL_NAMES.filter((n) => (snapshot.domains[n]?.length || 0) > 0);
  const names = allowed?.length ? present.filter((n) => allowed.includes(n)) : present;
  const tools: AgentTool<any>[] = [];

  if (names.includes("world_lookup")) {
    tools.push({
      name: "world_lookup",
      label: "世界书查询",
      description: NARRATIVE_READ_TOOLS.world_lookup.description + ` 单次最多返回 ${L.maxItems} 条。`,
      parameters: SearchParams,
      execute: async (_id, p: any) => {
        if (p.action === "get") {
          const item = getById("world_lookup", snapshot, p.id || "");
          return textResult(resultEnvelope("world_lookup", "get", snapshot, item ? [item] : [], item ? [] : ["entry-not-found"]));
        }
        if (p.action === "related") {
          const anchor = getById("world_lookup", snapshot, p.id || "");
          const targets = (anchor?.relations || []).map((r) => getById("world_lookup", snapshot, r.targetId)).filter(Boolean) as SnapshotItem[];
          return textResult(resultEnvelope("world_lookup", "related", snapshot, targets.slice(0, L.maxItems), anchor ? [] : ["anchor-not-found"]));
        }
        return textResult(resultEnvelope("world_lookup", "search", snapshot, search("world_lookup", snapshot, p.query || "")));
      },
    });
  }

  if (names.includes("geo_lookup")) {
    tools.push({
      name: "geo_lookup",
      label: "地理查询",
      description: NARRATIVE_READ_TOOLS.geo_lookup.description,
      parameters: GeoParams,
      execute: async (_id, p: any) => {
        const items = snapshot.domains.geo_lookup || [];
        if (p.action === "current") {
          const cur = items.find((i) => i.id === snapshot.currentPlaceId) || items.slice(0, 1);
          return textResult(resultEnvelope("geo_lookup", "current", snapshot, Array.isArray(cur) ? cur.slice(0, L.maxItems) : [cur]));
        }
        if (p.action === "get") {
          const item = getById("geo_lookup", snapshot, p.id || "");
          return textResult(resultEnvelope("geo_lookup", "get", snapshot, item ? [item] : [], item ? [] : ["place-not-found"]));
        }
        if (p.action === "route") {
          const from = getById("geo_lookup", snapshot, p.id || "") || items[0];
          const to = getById("geo_lookup", snapshot, p.to || "");
          if (!from || !to) return textResult(resultEnvelope("geo_lookup", "route", snapshot, [], ["endpoint-not-found"]));
          const hop = (from.connectedPlaces || []).includes(to.id) ? "直达" : "无已知直达路线（不得虚构行程）";
          return textResult(resultEnvelope("geo_lookup", "route", snapshot, [from, to], [`route:${hop}`]));
        }
        const cur = getById("geo_lookup", snapshot, snapshot.currentPlaceId || "");
        const near = cur?.connectedPlaces?.map((id) => getById("geo_lookup", snapshot, id)).filter(Boolean) as SnapshotItem[];
        return textResult(resultEnvelope("geo_lookup", "nearby", snapshot, (near || items).slice(0, L.maxItems)));
      },
    });
  }

  const traceTool = (name: PinaxToolName, label: string, params: any) => {
    tools.push({
      name,
      label,
      description: NARRATIVE_READ_TOOLS[name].description,
      parameters: params,
      execute: async (_id: string, p: any) => {
        if (p.action === "get" || p.action === "current") {
          const item = getById(name, snapshot, p.id || "");
          return textResult(resultEnvelope(name, p.action, snapshot, item ? [item] : [], item ? [] : ["entry-not-found"]));
        }
        if (p.action === "trace") {
          const anchor = getById(name, snapshot, p.id || "");
          const chain = search(name, snapshot, p.query || anchor?.title || "");
          return textResult(resultEnvelope(name, "trace", snapshot, chain, anchor ? [] : ["anchor-not-found"]));
        }
        return textResult(resultEnvelope(name, "search", snapshot, search(name, snapshot, p.query || "")));
      },
    });
  };

  if (names.includes("history_lookup")) traceTool("history_lookup", "历史查询", TraceParams);
  if (names.includes("memory_lookup")) traceTool("memory_lookup", "记忆事实查询", GetSearchParams);
  if (names.includes("politics_lookup")) traceTool("politics_lookup", "政治关系查询", PoliticsParams);

  // BeatPlan 规划轮（②）：计划先行工具——模型提交节拍计划，镜像 Pinax 契约校验受理；
  // continue 模式不暴露（复用当前计划，镜像上游「extend 复用」语义）。
  if (hooks?.onBeatPlan) {
    tools.push({
      name: NARRATIVE_BEAT_PLAN_TOOL,
      label: "节拍规划",
      description: "本轮写正文前先提交节拍计划：回应义务、因果步骤、角色行动（action+result）、最终新增信息与可观察收束条件。计划受理后再产出正文，不得偏离已提交计划。",
      parameters: narrativeBeatPlanToolSchema(),
      execute: async (_id, p: any) => {
        const r = validateNarrativeBeatPlanInput(p);
        if (!r.valid) return textResult(JSON.stringify({ ok: false, error: r.error }));
        const revision = narrativeBeatPlanRevision(r.plan);
        hooks.onBeatPlan?.(r.plan, revision);
        return textResult(JSON.stringify({ ok: true, revision, note: "计划已受理：按计划产出正文，不得偏离已提交的因果步骤与收束条件。" }));
      },
    });
  }

  return tools;
}

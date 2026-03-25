import { z } from 'zod';

// Lightweight graph-based context memory

export const ContextNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['session', 'content', 'rewrite']),
  text: z.string().default(''),
  timestamp: z.date().default(() => new Date()),
});
export type ContextNode = z.infer<typeof ContextNodeSchema>;

export const ContextEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  type: z.string().default('contains'),
});
export type ContextEdge = z.infer<typeof ContextEdgeSchema>;

export interface MemoryContextGraph {
  nodes: ContextNode[];
  edges: ContextEdge[];
}

export function createDefaultContextGraph(): MemoryContextGraph {
  return { nodes: [], edges: [] };
}

export function addSession(graph: MemoryContextGraph, sessionId: string): void {
  if (graph.nodes.some((n) => n.id === sessionId)) return;
  graph.nodes.push({ id: sessionId, type: 'session', text: '', timestamp: new Date() });
}

export function addContentNode(
  graph: MemoryContextGraph,
  sessionId: string,
  text: string,
  nodeId?: string,
): void {
  const id = nodeId ?? `content_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  graph.nodes.push({ id, type: 'content', text, timestamp: new Date() });
  graph.edges.push({ source: sessionId, target: id, type: 'contains' });
}

export function getSessionContent(graph: MemoryContextGraph, sessionId: string): string[] {
  const childIds = new Set(graph.edges.filter((e) => e.source === sessionId).map((e) => e.target));
  return graph.nodes
    .filter((n) => childIds.has(n.id) && (n.type === 'content' || n.type === 'rewrite'))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
    .map((n) => n.text);
}

export function serialize(graph: MemoryContextGraph): Record<string, unknown> {
  return {
    nodes: graph.nodes.map((n) => ({ ...n, timestamp: n.timestamp.toISOString() })),
    edges: graph.edges,
  };
}

export function deserialize(data: Record<string, unknown>): MemoryContextGraph {
  const nodes = (data['nodes'] as Array<Record<string, unknown>> ?? []).map((n) => ({
    id: n['id'] as string,
    type: n['type'] as ContextNode['type'],
    text: (n['text'] as string) ?? '',
    timestamp: new Date(n['timestamp'] as string),
  }));
  const edges = (data['edges'] as Array<Record<string, unknown>> ?? []).map((e) => ({
    source: e['source'] as string,
    target: e['target'] as string,
    type: (e['type'] as string) ?? 'contains',
  }));
  return { nodes, edges };
}

export function pruneOldSessions(graph: MemoryContextGraph, maxSessions: number): void {
  const sessions = graph.nodes
    .filter((n) => n.type === 'session')
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  if (sessions.length <= maxSessions) return;

  const sessionsToRemove = new Set(sessions.slice(maxSessions).map((s) => s.id));
  const nodesToRemove = new Set<string>();
  for (const sid of sessionsToRemove) {
    nodesToRemove.add(sid);
    for (const edge of graph.edges) {
      if (edge.source === sid) nodesToRemove.add(edge.target);
    }
  }

  graph.nodes = graph.nodes.filter((n) => !nodesToRemove.has(n.id));
  graph.edges = graph.edges.filter((e) => !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target));
}

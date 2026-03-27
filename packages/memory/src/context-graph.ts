import { z } from 'zod';

// Lightweight graph-based context memory

export const ContextNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['session', 'content', 'rewrite', 'user_profile']),
  text: z.string().default(''),
  timestamp: z.date().default(() => new Date()),
  category: z.string().optional(),
  confidence: z.number().optional(),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
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

export function ensureSession(graph: MemoryContextGraph, sessionId: string): void {
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
    nodes: graph.nodes.map((n) => {
      const obj: Record<string, unknown> = { ...n, timestamp: n.timestamp.toISOString() };
      // Strip undefined optional fields
      if (obj['category'] === undefined) delete obj['category'];
      if (obj['confidence'] === undefined) delete obj['confidence'];
      if (obj['source'] === undefined) delete obj['source'];
      if (obj['metadata'] === undefined) delete obj['metadata'];
      return obj;
    }),
    edges: graph.edges,
  };
}

export function deserialize(data: Record<string, unknown>): MemoryContextGraph {
  const nodes = (data['nodes'] as Array<Record<string, unknown>> ?? []).map((n) => {
    const node: ContextNode = {
      id: n['id'] as string,
      type: n['type'] as ContextNode['type'],
      text: (n['text'] as string) ?? '',
      timestamp: new Date(n['timestamp'] as string),
    };
    if (n['category'] !== undefined) node.category = n['category'] as string;
    if (n['confidence'] !== undefined) node.confidence = n['confidence'] as number;
    if (n['source'] !== undefined) node.source = n['source'] as string;
    if (n['metadata'] !== undefined) node.metadata = n['metadata'] as Record<string, unknown>;
    return node;
  });
  const edges = (data['edges'] as Array<Record<string, unknown>> ?? []).map((e) => ({
    source: e['source'] as string,
    target: e['target'] as string,
    type: (e['type'] as string) ?? 'contains',
  }));
  return { nodes, edges };
}

// ─── User Profile Nodes ───

const USER_ROLE_NODE = '__user__';

export function writeProfile(
  graph: MemoryContextGraph,
  text: string,
  opts?: { category?: string; confidence?: number; source?: string; metadata?: Record<string, unknown> },
): string {
  const id = `user_profile_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  const node: ContextNode = {
    id,
    type: 'user_profile',
    text,
    timestamp: now,
    category: opts?.category,
    confidence: opts?.confidence ?? 1.0,
    source: opts?.source ?? 'react_agent',
    metadata: opts?.metadata,
  };
  graph.nodes.push(node);
  graph.edges.push({ source: USER_ROLE_NODE, target: id, type: 'has_profile' });
  return id;
}

export function recallProfile(
  graph: MemoryContextGraph,
  query?: string,
): Array<{ nodeId: string; text: string; category?: string; confidence?: number; metadata?: Record<string, unknown> }> {
  const profileNodes = graph.nodes.filter((n) => n.type === 'user_profile');
  if (profileNodes.length === 0) return [];

  // No query → return all
  if (!query?.trim()) {
    return profileNodes.map((n) => ({
      nodeId: n.id,
      text: n.text,
      category: n.category,
      confidence: n.confidence,
      metadata: n.metadata,
    }));
  }

  // Simple keyword match scoring (lightweight BM25 alternative)
  const queryTokens = query.toLowerCase().split(/\s+/);
  const scored = profileNodes.map((n) => {
    const textTokens = n.text.toLowerCase().split(/\s+/);
    let score = 0;
    for (const qt of queryTokens) {
      if (textTokens.some((tt) => tt.includes(qt))) score++;
    }
    return { node: n, score: score / queryTokens.length };
  });

  return scored
    .filter((s) => s.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((s) => ({
      nodeId: s.node.id,
      text: s.node.text,
      category: s.node.category,
      confidence: s.node.confidence,
      metadata: s.node.metadata,
    }));
}

export interface UserPersona {
  summary: string;
  topics: Array<Record<string, unknown>>;
  tags: string[];
}

export function syncProfile(
  graph: MemoryContextGraph,
  persona: UserPersona,
  source = 'itaware_api',
): { added: number; removed: number; kept: number } {
  // Collect existing profile nodes from this source
  const existing = new Map<string, ContextNode>(); // key → node
  for (const node of graph.nodes) {
    if (node.type === 'user_profile' && node.source === source) {
      const cat = node.category ?? '';
      if (cat === 'summary') {
        existing.set('summary:', node);
      } else if (cat === 'topic') {
        const topicName = (node.metadata as Record<string, unknown> | undefined)?.['topic'] as string ?? '';
        existing.set(`topic:${topicName}`, node);
      } else if (cat === 'tag') {
        existing.set(`tag:${node.text}`, node);
      }
    }
  }

  // Build desired set
  const desired = new Map<string, { text: string; category: string; metadata?: Record<string, unknown> }>();
  if (persona.summary) {
    desired.set('summary:', { text: persona.summary, category: 'summary' });
  }
  for (const t of persona.topics) {
    const topicName = (t['topic'] as string) ?? '';
    if (!topicName) continue;
    const need = (t['need'] as string) ?? '';
    const notes = (t['notes'] as string) ?? '';
    const text = `${topicName}: ${need}. ${notes}`.trim().replace(/\.$/, '');
    desired.set(`topic:${topicName}`, { text, category: 'topic', metadata: { ...t } });
  }
  for (const tag of persona.tags) {
    if (tag) desired.set(`tag:${tag}`, { text: tag, category: 'tag' });
  }

  const existingKeys = new Set(existing.keys());
  const desiredKeys = new Set(desired.keys());

  // Remove stale nodes
  let removed = 0;
  for (const key of existingKeys) {
    if (!desiredKeys.has(key)) {
      const node = existing.get(key)!;
      graph.nodes = graph.nodes.filter((n) => n.id !== node.id);
      graph.edges = graph.edges.filter((e) => e.target !== node.id);
      removed++;
    }
  }

  // Update summary text if changed
  if (existingKeys.has('summary:') && desiredKeys.has('summary:')) {
    const node = existing.get('summary:')!;
    node.text = desired.get('summary:')!.text;
    node.timestamp = new Date();
  }

  // Add new nodes
  let added = 0;
  for (const key of desiredKeys) {
    if (!existingKeys.has(key)) {
      const item = desired.get(key)!;
      writeProfile(graph, item.text, {
        category: item.category,
        source,
        metadata: item.metadata,
      });
      added++;
    }
  }

  const kept = [...existingKeys].filter((k) => desiredKeys.has(k)).length;
  return { added, removed, kept };
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

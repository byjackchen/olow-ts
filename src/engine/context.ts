import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  cycleId: string;
  requesterType: string;
  requesterId: string;
  sessionId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getContext(): RequestContext | undefined {
  return requestContext.getStore();
}

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

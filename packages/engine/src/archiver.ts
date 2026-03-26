// ─── Cycle Archiver (extracted from Dispatcher) ───

import { getLogger } from './logger.js';
import { RequesterType as RT, ChannelType as CT } from './types.js';
import type { Request } from './events.js';
import type { ResponseChain } from './events.js';
import type { FlowStates } from './types.js';
import type { IBroker } from './broker-interfaces.js';

const logger = getLogger();

function stripMediaBase64(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripMediaBase64);
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(obj)) {
      sanitized[key] = key === 'media_base64' ? 'archiving_stripped' : stripMediaBase64(item);
    }
    return sanitized;
  }
  return value;
}

export async function archiveCycle(opts: {
  request: Request;
  cycleId: string | null;
  responses: ResponseChain;
  states: FlowStates;
  broker: IBroker;
  archivableActions: ReadonlySet<string>;
}): Promise<void> {
  const { request, cycleId, responses, states, broker, archivableActions } = opts;
  if (!request || !cycleId) return;

  if (request.requester.type !== RT.USER && !archivableActions.has(request.action)) {
    logger.info('Skipped cycle archive for non-user requester');
    return;
  }

  const archivedResponses = stripMediaBase64(responses.toList()) as unknown[];

  await broker.cyclesCreate({
    cycleId,
    requesterType: request.requester.type,
    requesterId: request.requester.id,
    requestSessionId: request.sessionId,
    requestMsg: request.msg,
    requestAction: request.action,
    requestContent: request.content.mixedText,
    requestTime: request.timestamp,
    requestGroupchatId: request.channelType === CT.GROUP ? request.channelId : null,
    deviceType: request.deviceType,
    responses: archivedResponses,
    shownFaqs: states.shown_faqs,
    flowStates: states as unknown as Record<string, unknown>,
  });
}

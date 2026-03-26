// ─── Message Handler (extracted from Dispatcher) ───

import { getLogger } from './logger.js';
import {
  MessengerType as MT,
  FlowMsgType as FMT,
  SentToType as STT,
  ChannelType as CT,
} from './types.js';
import type { FlowMsgType, SentToType, DecodedMsg } from './types.js';
import type { FlowMsg, ResponseChain, Request } from './events.js';
import type { IMessenger } from './messengers.js';
import type { ITemplate } from './base-template.js';
import type { IDispatcher } from './base-flow.js';

const logger = getLogger();

const THINK_TYPES: FlowMsgType[] = [FMT.THINK_L1, FMT.THINK_L2];

export function prepareMsg(
  request: Request,
  template: ITemplate,
  sentToType?: SentToType,
  sentTo?: string,
): { template: ITemplate; sentToType: SentToType; sentTo: string } {
  if (!sentToType) {
    if (request.channelType === CT.SINGLE) sentToType = STT.USER;
    else if (request.channelType === CT.GROUP) sentToType = STT.GROUPCHAT;
    else throw new Error('sentToType is required');
  }

  if (!sentTo) {
    if (sentToType === STT.USER) sentTo = request.requester.id;
    else if (sentToType === STT.GROUPCHAT) sentTo = request.channelId ?? '';
    else throw new Error('sentTo is required');
  }

  return { template, sentToType, sentTo };
}

export async function decodeMsg(
  flowMsg: FlowMsg,
  request: Request,
  messenger: IMessenger | null,
  responses: ResponseChain,
): Promise<DecodedMsg> {
  const { template, sentToType, sentTo } = prepareMsg(
    request, flowMsg.messageTemplate, flowMsg.sentToType, flowMsg.sentTo,
  );

  const [formatType, message] = template.render(messenger?.type ?? MT.BARE_TEXT);

  responses.push({
    timestamp: new Date(),
    sentToType,
    sentTo,
    templateName: template.constructor.name,
    templateData: template.toData(),
    messageType: flowMsg.messageType ?? FMT.ANSWER,
  });

  return {
    message_type: flowMsg.messageType ?? null,
    message: message as string | Record<string, unknown> | unknown[] | null,
    format_type: formatType,
    sent_to_type: sentToType,
    sent_to: sentTo,
  };
}

export async function postMsg(
  flowMsg: FlowMsg,
  dispatcher: IDispatcher,
  request: Request,
  messenger: IMessenger | null,
  responses: ResponseChain,
  postMsgVerbose: boolean,
): Promise<void> {
  const messageType = flowMsg.messageType ?? FMT.ANSWER;

  if (!postMsgVerbose && messageType !== FMT.ANSWER && messageType !== FMT.THINK_L1) {
    logger.info(`Skipped message of type ${messageType} due to non-verbose mode`);
    return;
  }

  const { template, sentToType, sentTo } = prepareMsg(
    request, flowMsg.messageTemplate, flowMsg.sentToType, flowMsg.sentTo,
  );

  // Determine reuse tracking ID
  let reuseTrackingId = flowMsg.reuseTrackingId;
  if (!reuseTrackingId && THINK_TYPES.includes(messageType)) {
    for (let i = responses.length - 1; i >= 0; i--) {
      const r = responses[i]!;
      if (THINK_TYPES.includes(r.messageType) && r.trackingId) {
        reuseTrackingId = r.trackingId;
        break;
      }
    }
  }

  // Determine revoke tracking IDs
  const revokeTrackingIds = messageType === FMT.ANSWER
    ? [...new Set(responses.filter((r) => THINK_TYPES.includes(r.messageType) && r.trackingId).map((r) => r.trackingId!))]
    : [];

  if (messenger) {
    const { trackingId } = await messenger.say({
      messageType,
      sentToType,
      sentTo,
      dispatcher,
      template,
      reuseTrackingId,
      revokeTrackingIds,
    });

    responses.push({
      timestamp: new Date(),
      sentToType,
      sentTo,
      templateName: template.constructor.name,
      templateData: template.toData(),
      messageType,
      trackingId,
    });
  }
}

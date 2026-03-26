import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { AppEventType } from '../events.js';
import { TextTemplate, AiIdleTemplate, I18n } from '@olow/templates';
import * as hunyuan from '../services/hunyuan.api.js';
import * as wecomApi from '../services/wecom.api.js';
import type { Broker } from '../engine/broker.js';

const logger = getLogger();

@flowRegistry.register()
export class AsrFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === AppEventType.ASR;
  }

  async run(): Promise<EventStatus> {
    await this.event.propagateMsg(
      new AiIdleTemplate([I18n.AI_IDLE_ASR ?? I18n.AI_INTENT]),
      undefined, undefined, FlowMsgType.THINK_L2,
    );

    const mediaId = this.request.content.firstMediaId;
    if (!mediaId) {
      logger.error('ASR flow: no media_id in voice content');
      this.dispatcher.eventchain.push(new Event(CoreEventType.TRIAGE));
      return EventStatus.COMPLETE;
    }

    try {
      // Fetch SILK audio from WeCom
      const broker = this.broker as Broker;
      const token = await broker.wecomBotTokenCache.get();
      const audioBuffer = await wecomApi.getFileInMemory(token, mediaId);

      // ASR via Hunyuan
      const asrText = await hunyuan.recognizeAudio(audioBuffer);

      if (asrText) {
        logger.info(`ASR result for media_id ${mediaId}: ${asrText}`);
        // Update VoiceBlock desc with transcribed text
        this.request.content.setMediaDesc(mediaId, asrText);

        await this.event.propagateMsg(
          new AiIdleTemplate([`🎤 ${asrText}`]),
          undefined, undefined, FlowMsgType.THINK_L2,
        );
      } else {
        logger.warn(`ASR returned empty text for media_id ${mediaId}`);
      }
    } catch (err) {
      logger.error({ msg: 'ASR processing failed', err });
    }

    // Chain to TRIAGE for further routing (with transcribed text now in content)
    this.dispatcher.eventchain.push(new Event(CoreEventType.TRIAGE));
    return EventStatus.COMPLETE;
  }
}

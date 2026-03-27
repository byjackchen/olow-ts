import {
  BaseFlow, Event, flowRegistry, getLogger,
  CoreEventType, EventStatus, FlowMsgType,
} from '@olow/engine';
import type { MessengerType } from '@olow/engine';
import { AgentEventType } from './events.js';
import { AiIdleTemplate, I18n } from '@olow/templates';

const logger = getLogger();

/**
 * OCR Flow — processes image content blocks via broker.llm, then chains to TRIAGE.
 *
 * App layer must provide:
 * - A way to fetch image data (e.g., wecomApi.getFileInMemory via broker)
 * - An OCR/VLM capable LLM provider
 *
 * This base flow handles the orchestration; app can override for custom OCR logic.
 */
@flowRegistry.register()
export class OcrFlow extends BaseFlow {
  static canHandle(event: Event, _messengerType?: MessengerType): boolean {
    return event.type === AgentEventType.OCR;
  }

  async run(): Promise<EventStatus> {
    await this.event.propagateMsg(
      new AiIdleTemplate([I18n.AI_IDLE_OCR]),
      undefined, undefined, FlowMsgType.THINK_L2,
    );

    const imageBlocks = this.request.content.getBlocksByType('image');
    if (imageBlocks.length === 0) {
      logger.warn('OcrFlow: no image blocks found');
      this.dispatcher.eventchain.push(new Event(CoreEventType.TRIAGE));
      return EventStatus.COMPLETE;
    }

    // Process images — use LLM VLM for OCR
    const results = await Promise.allSettled(
      imageBlocks.map(async (block, idx) => {
        const prompt = `Analyze this image and extract all relevant text content. If it's a screenshot of an error, include the error details. Provide a concise description.`;

        // Call LLM with image context (media_id reference in prompt)
        const [success, result] = await this.broker.llm.callLlm(
          `[Image media_id: ${block.media_id}] ${prompt}`,
          { jsonMode: 'string' },
        );

        const ocrText = success && typeof result === 'string' ? result : '';
        if (ocrText) {
          logger.info(`OCR result - idx: ${idx}, media_id: ${block.media_id}`);
          this.request.content.setMediaDesc(block.media_id, ocrText);

          await this.event.propagateMsg(
            new AiIdleTemplate([`🖼️ Image ${idx + 1}: ${ocrText.slice(0, 100)}${ocrText.length > 100 ? '...' : ''}`]),
            undefined, undefined, FlowMsgType.THINK_L2,
          );
        }
        return ocrText;
      }),
    );

    for (const r of results) {
      if (r.status === 'rejected') {
        logger.error({ msg: 'OCR processing failed', err: r.reason });
      }
    }

    this.dispatcher.eventchain.push(new Event(CoreEventType.TRIAGE));
    return EventStatus.COMPLETE;
  }
}

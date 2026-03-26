import { config } from '../config/index.js';
import { getLogger } from '@olow/engine';
const logger = getLogger();

// ─── ASR (Speech-to-Text) ───

export async function recognizeAudio(
  audioBuffer: Buffer,
  opts?: { format?: string },
): Promise<string> {
  // TODO: Implement Hunyuan ASR via WebSocket (SILK → PCM → realtime transcription)
  // For now, log warning and return empty — full implementation requires:
  // 1. SILK decoder (silk-wasm or similar)
  // 2. WebSocket client to Hunyuan realtime transcription endpoint
  // 3. Audio chunking + VAD-based completion detection
  logger.warn('Hunyuan ASR not yet implemented — voice will be processed without transcription');
  return '';
}

// ─── OCR (Image-to-Text via VLM) ───

const OCR_PROMPT = `You are an IT support assistant. Analyze this image and extract all relevant text content.
If it's a screenshot of an error message, include the error details.
If it's a form or dialog, describe the fields and values.
Provide a concise description of what the image shows.`;

export async function recognizeImage(
  imageBuffer: Buffer,
  opts?: { prompt?: string },
): Promise<string> {
  const imageB64 = imageBuffer.toString('base64');
  const imageUrl = `data:image/png;base64,${imageB64}`;

  const resp = await fetch(`http://${config.hunyuan.url_domain}/openapi/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.hunyuan.auth_token}`,
    },
    body: JSON.stringify({
      model: config.hunyuan.models.ocr,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: opts?.prompt ?? OCR_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Hunyuan OCR error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const choices = data['choices'] as Array<{ message: { content: string } }> | undefined;
  const extracted = choices?.[0]?.message.content ?? '';

  logger.info(`OCR response: ${extracted.slice(0, 100)}${extracted.length > 100 ? '...' : ''}`);
  return extracted;
}

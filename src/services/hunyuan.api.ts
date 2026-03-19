import { config } from '../config/index.js';
import logger from '../engine/logger.js';

// Hunyuan Audio ASR / OCR API client (Tencent)

export async function recognizeAudio(
  audioBuffer: Buffer,
  opts?: { format?: string },
): Promise<string> {
  // TODO: Implement Hunyuan ASR via WebSocket
  logger.warn('Hunyuan ASR not yet implemented');
  return '';
}

export async function recognizeImage(
  imageBuffer: Buffer,
  opts?: { format?: string },
): Promise<string> {
  const resp = await fetch(`https://${config.hunyuan.url_domain}/v1/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.hunyuan.auth_token}`,
    },
    body: JSON.stringify({
      model: config.hunyuan.models.ocr,
      image: imageBuffer.toString('base64'),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Hunyuan OCR error ${resp.status}: ${text}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  return (data['text'] as string) ?? '';
}

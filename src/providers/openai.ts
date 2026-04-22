import OpenAI from 'openai';

import { getPrompts } from '../prompts.js';
import type { Confidence, ExtractionResult, ReceiptType } from '../types.js';
import type { ReceiptProvider } from './base.js';
import { parseProviderResponse } from './base.js';

export class OpenAIProvider implements ReceiptProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model ?? 'gpt-4o-mini';
  }

  async extract(
    imageBase64: string,
    mimeType: string,
    receiptType: ReceiptType,
  ): Promise<ExtractionResult> {
    const { system, user } = getPrompts(receiptType);

    const start = performance.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
                detail: 'high',
              },
            },
            { type: 'text', text: `${user}\n\nRespond with ONLY valid JSON.` },
          ],
        },
      ],
    });
    const latencyMs = Math.round(performance.now() - start);

    const text = response.choices[0]?.message?.content ?? '{}';
    const raw = JSON.parse(text) as Record<string, unknown>;
    const { fields, confidences } = parseProviderResponse(raw);

    return {
      provider: this.name,
      receiptType,
      fields,
      confidences: confidences as Record<string, Confidence>,
      latencyMs,
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  }
}

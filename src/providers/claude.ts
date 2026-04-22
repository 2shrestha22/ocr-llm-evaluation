import Anthropic from '@anthropic-ai/sdk';

import { getPrompts } from '../prompts.js';
import type { Confidence, ExtractionResult, ReceiptType } from '../types.js';
import type { ReceiptProvider } from './base.js';
import { parseProviderResponse } from './base.js';

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

export class ClaudeProvider implements ReceiptProvider {
  readonly name = 'claude';
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model ?? 'claude-haiku-4-5-20250514';
  }

  async extract(
    imageBase64: string,
    mimeType: string,
    receiptType: ReceiptType,
  ): Promise<ExtractionResult> {
    const { system, user } = getPrompts(receiptType);

    const start = performance.now();
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType as ImageMediaType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `${user}\n\nRespond with ONLY valid JSON — no markdown fences, no commentary.`,
            },
          ],
        },
      ],
    });
    const latencyMs = Math.round(performance.now() - start);

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';
    const raw = JSON.parse(text) as Record<string, unknown>;
    const { fields, confidences } = parseProviderResponse(raw);

    return {
      provider: this.name,
      receiptType,
      fields,
      confidences: confidences as Record<string, Confidence>,
      latencyMs,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }
}

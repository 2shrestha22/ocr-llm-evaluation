import { GoogleGenerativeAI } from '@google/generative-ai';

import { getPrompts } from '../prompts.js';
import type { Confidence, ExtractionResult, ReceiptType } from '../types.js';
import type { ReceiptProvider } from './base.js';
import { parseProviderResponse } from './base.js';

export class GeminiProvider implements ReceiptProvider {
  readonly name = 'gemini';
  private readonly client: GoogleGenerativeAI;
  private readonly model: string;

  constructor(apiKey: string, model?: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = model ?? 'gemini-2.5-flash';
  }

  async extract(
    imageBase64: string,
    mimeType: string,
    receiptType: ReceiptType,
  ): Promise<ExtractionResult> {
    const { system, user, schema } = getPrompts(receiptType);

    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: system,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema as Parameters<
          typeof this.client.getGenerativeModel
        >[0] extends { generationConfig?: { responseSchema?: infer S } }
          ? S
          : never,
      },
    });

    const start = performance.now();
    const result = await model.generateContent([
      { inlineData: { mimeType, data: imageBase64 } },
      user,
    ]);
    const latencyMs = Math.round(performance.now() - start);

    const raw = JSON.parse(result.response.text()) as Record<string, unknown>;
    const { fields, confidences } = parseProviderResponse(raw);
    const usage = result.response.usageMetadata;

    return {
      provider: this.name,
      receiptType,
      fields,
      confidences: confidences as Record<string, Confidence>,
      latencyMs,
      inputTokens: usage?.promptTokenCount,
      outputTokens: usage?.candidatesTokenCount,
    };
  }
}

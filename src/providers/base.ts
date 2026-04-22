import type { ExtractionResult, ReceiptType } from '../types.js';

export interface ReceiptProvider {
  readonly name: string;

  extract(
    imageBase64: string,
    mimeType: string,
    receiptType: ReceiptType,
  ): Promise<ExtractionResult>;
}

export function parseProviderResponse(
  raw: Record<string, unknown>,
): { fields: Record<string, unknown>; confidences: Record<string, string> } {
  const { confidence, ...fields } = raw;
  const confidences =
    confidence && typeof confidence === 'object'
      ? (confidence as Record<string, string>)
      : {};
  return { fields, confidences };
}

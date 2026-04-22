export type ReceiptType = 'fuel' | 'service';
export type ImageQuality = 'clean' | 'degraded';
export type Confidence = 'high' | 'medium' | 'low' | 'none';

export type FuelType =
  | 'regular'
  | 'midgrade'
  | 'premium'
  | 'diesel'
  | 'e85'
  | 'other';

export interface ServiceLineItem {
  description: string;
  amount: number;
}

export interface FieldConfidences {
  [field: string]: Confidence;
}

export interface ExtractionResult {
  provider: string;
  receiptType: ReceiptType;
  fields: Record<string, unknown>;
  confidences: FieldConfidences;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export interface GroundTruth {
  receiptId: string;
  imageFile: string;
  receiptType: ReceiptType;
  imageQuality: ImageQuality;
  fields: Record<string, unknown>;
  notes?: string;
}

export interface FieldScore {
  field: string;
  expected: unknown;
  actual: unknown;
  confidence: Confidence;
  correct: boolean;
  highConfidenceError: boolean;
  method: 'exact' | 'numeric' | 'date' | 'fuzzy' | 'skipped';
}

export interface ReceiptScore {
  receiptId: string;
  imageQuality: ImageQuality;
  provider: string;
  fieldScores: FieldScore[];
  fieldsCorrect: number;
  fieldsTotal: number;
  accuracy: number;
  hasHallucination: boolean;
  editsRequired: number;
  latencyMs: number;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  checks: ValidationCheck[];
}

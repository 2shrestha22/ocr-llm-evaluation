import { getFieldNames } from './prompts.js';
import type {
  Confidence,
  ExtractionResult,
  FieldScore,
  GroundTruth,
  ReceiptScore,
} from './types.js';

const NUMERIC_TOLERANCE = 0.015;
const FUZZY_MIN_SIMILARITY = 0.6;

export function scoreReceipt(
  extraction: ExtractionResult,
  gt: GroundTruth,
): ReceiptScore {
  const fields = getFieldNames(gt.receiptType);
  const fieldScores = fields.map((field) =>
    scoreField(
      field,
      gt.fields[field],
      extraction.fields[field],
      (extraction.confidences[field] as Confidence) ?? 'none',
      gt.receiptType,
    ),
  );

  const scorable = fieldScores.filter((s) => s.method !== 'skipped');
  const correct = scorable.filter((s) => s.correct).length;
  const total = scorable.length;
  const hallucinations = scorable.filter((s) => s.highConfidenceError);

  return {
    receiptId: gt.receiptId,
    imageQuality: gt.imageQuality,
    provider: extraction.provider,
    fieldScores,
    fieldsCorrect: correct,
    fieldsTotal: total,
    accuracy: total > 0 ? correct / total : 1,
    hasHallucination: hallucinations.length > 0,
    editsRequired: total - correct,
    latencyMs: extraction.latencyMs,
  };
}

function scoreField(
  field: string,
  expected: unknown,
  actual: unknown,
  confidence: Confidence,
  receiptType: string,
): FieldScore {
  if (expected === null || expected === undefined) {
    const correct = actual === null || actual === undefined;
    return {
      field,
      expected,
      actual,
      confidence,
      correct,
      highConfidenceError: !correct && confidence === 'high',
      method: 'skipped',
    };
  }

  const method = getScoringMethod(field, receiptType);
  const correct = compare(expected, actual, method);

  return {
    field,
    expected,
    actual,
    confidence,
    correct,
    highConfidenceError: !correct && confidence === 'high',
    method,
  };
}

type ScoringMethod = FieldScore['method'];

function getScoringMethod(field: string, receiptType: string): ScoringMethod {
  if (receiptType === 'fuel') {
    switch (field) {
      case 'total_cost':
      case 'volume':
      case 'price_per_unit':
      case 'pump_number':
        return 'numeric';
      case 'date':
        return 'date';
      case 'fuel_type':
      case 'octane':
        return 'exact';
      case 'station_name':
      case 'station_address':
      case 'payment_method':
        return 'fuzzy';
      default:
        return 'exact';
    }
  }

  switch (field) {
    case 'total_cost':
    case 'tax':
      return 'numeric';
    case 'date':
      return 'date';
    case 'shop_name':
    case 'payment_method':
      return 'fuzzy';
    default:
      return 'fuzzy';
  }
}

function compare(expected: unknown, actual: unknown, method: ScoringMethod): boolean {
  if (actual === null || actual === undefined) return false;

  switch (method) {
    case 'exact':
      return String(expected).toLowerCase().trim() === String(actual).toLowerCase().trim();

    case 'numeric':
      return numericMatch(expected, actual);

    case 'date':
      return dateMatch(expected, actual);

    case 'fuzzy':
      return fuzzyMatch(expected, actual);

    case 'skipped':
      return true;
  }
}

function numericMatch(expected: unknown, actual: unknown): boolean {
  const a = typeof expected === 'number' ? expected : parseFloat(String(expected));
  const b = typeof actual === 'number' ? actual : parseFloat(String(actual));
  if (isNaN(a) || isNaN(b)) return false;
  return Math.abs(a - b) <= NUMERIC_TOLERANCE;
}

function dateMatch(expected: unknown, actual: unknown): boolean {
  const a = new Date(String(expected));
  const b = new Date(String(actual));
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function fuzzyMatch(expected: unknown, actual: unknown): boolean {
  const a = normalize(String(expected));
  const b = normalize(String(actual));

  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  return similarity(a, b) >= FUZZY_MIN_SIMILARITY;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

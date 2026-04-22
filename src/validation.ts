import type { ReceiptType, ValidationCheck, ValidationResult } from './types.js';

const PRICE_RANGE = { min: 0.5, max: 15.0 };
const VOLUME_RANGE = { min: 0.1, max: 100.0 };
const COST_RANGE = { min: 0.5, max: 500.0 };
const VALID_OCTANES = new Set([85, 87, 88, 89, 91, 93]);
const ARITHMETIC_TOLERANCE = 0.10;

export function validateExtraction(
  fields: Record<string, unknown>,
  receiptType: ReceiptType,
): ValidationResult {
  const checks: ValidationCheck[] =
    receiptType === 'fuel'
      ? validateFuel(fields)
      : validateService(fields);

  return { valid: checks.every((c) => c.passed), checks };
}

function validateFuel(f: Record<string, unknown>): ValidationCheck[] {
  const checks: ValidationCheck[] = [];

  const volume = asNumber(f.volume);
  const ppu = asNumber(f.price_per_unit);
  const total = asNumber(f.total_cost);
  const octane = asNumber(f.octane);

  if (volume !== null && ppu !== null && total !== null) {
    const computed = volume * ppu;
    const diff = Math.abs(computed - total);
    const threshold = Math.max(total * ARITHMETIC_TOLERANCE, 0.50);
    checks.push({
      name: 'arithmetic',
      passed: diff <= threshold,
      message:
        diff <= threshold
          ? `volume × price (${computed.toFixed(2)}) ≈ total (${total.toFixed(2)})`
          : `volume × price (${computed.toFixed(2)}) ≠ total (${total.toFixed(2)}), diff $${diff.toFixed(2)}`,
    });
  }

  if (ppu !== null) {
    checks.push(rangeCheck('price_per_unit', ppu, PRICE_RANGE));
  }
  if (volume !== null) {
    checks.push(rangeCheck('volume', volume, VOLUME_RANGE));
  }
  if (total !== null) {
    checks.push(rangeCheck('total_cost', total, COST_RANGE));
  }
  if (octane !== null) {
    checks.push({
      name: 'octane_valid',
      passed: VALID_OCTANES.has(octane),
      message: VALID_OCTANES.has(octane)
        ? `octane ${octane} is valid`
        : `octane ${octane} not in ${[...VALID_OCTANES].join(',')}`,
    });
  }

  const dateStr = typeof f.date === 'string' ? f.date : null;
  if (dateStr) {
    checks.push(dateCheck(dateStr));
  }

  return checks;
}

function validateService(f: Record<string, unknown>): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const total = asNumber(f.total_cost);

  if (total !== null) {
    checks.push({
      name: 'total_positive',
      passed: total > 0,
      message: total > 0 ? `total $${total} > 0` : `total $${total} is non-positive`,
    });
  }

  const dateStr = typeof f.date === 'string' ? f.date : null;
  if (dateStr) {
    checks.push(dateCheck(dateStr));
  }

  return checks;
}

function rangeCheck(
  name: string,
  value: number,
  range: { min: number; max: number },
): ValidationCheck {
  const passed = value >= range.min && value <= range.max;
  return {
    name: `${name}_range`,
    passed,
    message: passed
      ? `${name} ${value} within [${range.min}, ${range.max}]`
      : `${name} ${value} outside [${range.min}, ${range.max}]`,
  };
}

function dateCheck(dateStr: string): ValidationCheck {
  const parsed = new Date(dateStr);
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(now.getFullYear() - 1);

  const valid = !isNaN(parsed.getTime()) && parsed <= now && parsed >= oneYearAgo;
  return {
    name: 'date_reasonable',
    passed: valid,
    message: valid
      ? `date ${dateStr} is reasonable`
      : `date ${dateStr} is invalid or out of range`,
  };
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && !isNaN(v)) return v;
  return null;
}

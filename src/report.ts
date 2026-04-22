import type { ReceiptScore } from './types.js';

interface ProviderSummary {
  provider: string;
  totalReceipts: number;
  cleanAccuracy: number;
  degradedAccuracy: number;
  overallAccuracy: number;
  hallucinationRate: number;
  medianEdits: number;
  p95LatencyMs: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

interface AcceptanceCriteria {
  name: string;
  target: string;
  actual: string;
  passed: boolean;
}

export interface EvalReport {
  timestamp: string;
  providers: ProviderSummary[];
  acceptance: Record<string, AcceptanceCriteria[]>;
  perReceipt: ReceiptScore[];
}

export function generateReport(scores: ReceiptScore[]): EvalReport {
  const byProvider = groupBy(scores, (s) => s.provider);
  const providers = Object.entries(byProvider).map(([provider, group]) =>
    summarizeProvider(provider, group),
  );
  const acceptance: Record<string, AcceptanceCriteria[]> = {};
  for (const summary of providers) {
    acceptance[summary.provider] = checkAcceptance(summary);
  }

  return {
    timestamp: new Date().toISOString(),
    providers,
    acceptance,
    perReceipt: scores,
  };
}

export function printReport(report: EvalReport): void {
  console.log('\n' + '='.repeat(70));
  console.log('  RECEIPT OCR EVALUATION REPORT');
  console.log('  ' + report.timestamp);
  console.log('='.repeat(70));

  for (const p of report.providers) {
    console.log(`\n── ${p.provider.toUpperCase()} (${'─'.repeat(50 - p.provider.length)})`);
    console.log(`  Receipts tested:      ${p.totalReceipts}`);
    console.log(`  Overall accuracy:     ${pct(p.overallAccuracy)}`);
    console.log(`  Clean accuracy:       ${pct(p.cleanAccuracy)}`);
    console.log(`  Degraded accuracy:    ${pct(p.degradedAccuracy)}`);
    console.log(`  Hallucination rate:   ${pct(p.hallucinationRate)}`);
    console.log(`  Median edits/receipt: ${p.medianEdits}`);
    console.log(`  p95 latency:          ${p.p95LatencyMs} ms`);
    console.log(`  Avg tokens (in/out):  ${p.avgInputTokens} / ${p.avgOutputTokens}`);

    console.log('\n  Acceptance criteria:');
    const criteria = report.acceptance[p.provider];
    for (const c of criteria) {
      const icon = c.passed ? '✓' : '✗';
      console.log(`    ${icon} ${c.name}: ${c.actual} (target: ${c.target})`);
    }
  }

  const fieldErrors = collectFieldErrors(report.perReceipt);
  if (fieldErrors.length > 0) {
    console.log('\n── FIELD-LEVEL ERRORS ──────────────────────────────────');
    for (const e of fieldErrors.slice(0, 20)) {
      console.log(
        `  [${e.provider}] ${e.receiptId}.${e.field}: ` +
          `expected=${JSON.stringify(e.expected)}, got=${JSON.stringify(e.actual)} ` +
          `(${e.confidence} confidence)`,
      );
    }
    if (fieldErrors.length > 20) {
      console.log(`  ... and ${fieldErrors.length - 20} more errors`);
    }
  }

  console.log('\n' + '='.repeat(70) + '\n');
}

function summarizeProvider(provider: string, scores: ReceiptScore[]): ProviderSummary {
  const clean = scores.filter((s) => s.imageQuality === 'clean');
  const degraded = scores.filter((s) => s.imageQuality === 'degraded');

  return {
    provider,
    totalReceipts: scores.length,
    cleanAccuracy: avgAccuracy(clean),
    degradedAccuracy: avgAccuracy(degraded),
    overallAccuracy: avgAccuracy(scores),
    hallucinationRate: scores.filter((s) => s.hasHallucination).length / scores.length,
    medianEdits: median(scores.map((s) => s.editsRequired)),
    p95LatencyMs: percentile(scores.map((s) => s.latencyMs), 95),
    avgInputTokens: 0,
    avgOutputTokens: 0,
  };
}

function checkAcceptance(summary: ProviderSummary): AcceptanceCriteria[] {
  return [
    {
      name: 'Clean receipt accuracy',
      target: '≥ 95%',
      actual: pct(summary.cleanAccuracy),
      passed: summary.cleanAccuracy >= 0.95,
    },
    {
      name: 'Degraded receipt accuracy',
      target: '≥ 75%',
      actual: pct(summary.degradedAccuracy),
      passed: summary.degradedAccuracy >= 0.75,
    },
    {
      name: 'Hallucination rate',
      target: '≤ 1%',
      actual: pct(summary.hallucinationRate),
      passed: summary.hallucinationRate <= 0.01,
    },
    {
      name: 'Median edits per receipt',
      target: '≤ 1',
      actual: String(summary.medianEdits),
      passed: summary.medianEdits <= 1,
    },
    {
      name: 'p95 latency',
      target: '≤ 5000 ms',
      actual: `${summary.p95LatencyMs} ms`,
      passed: summary.p95LatencyMs <= 5000,
    },
  ];
}

function collectFieldErrors(scores: ReceiptScore[]) {
  return scores.flatMap((s) =>
    s.fieldScores
      .filter((f) => !f.correct && f.method !== 'skipped')
      .map((f) => ({
        provider: s.provider,
        receiptId: s.receiptId,
        field: f.field,
        expected: f.expected,
        actual: f.actual,
        confidence: f.confidence,
      })),
  );
}

function avgAccuracy(scores: ReceiptScore[]): number {
  if (scores.length === 0) return NaN;
  return scores.reduce((sum, s) => sum + s.accuracy, 0) / scores.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function pct(n: number): string {
  if (isNaN(n)) return 'N/A';
  return (n * 100).toFixed(1) + '%';
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    (groups[k] ??= []).push(item);
  }
  return groups;
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { program } from 'commander';

import type { ReceiptProvider } from './providers/base.js';
import { ClaudeProvider } from './providers/claude.js';
import { GeminiProvider } from './providers/gemini.js';
import { OpenAIProvider } from './providers/openai.js';
import { generateReport, printReport } from './report.js';
import { scoreReceipt } from './scorer.js';
import type { ExtractionResult, GroundTruth, ReceiptScore, ReceiptType } from './types.js';

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

function buildProviders(filter?: string[]): ReceiptProvider[] {
  const providers: ReceiptProvider[] = [];
  const allowed = filter?.map((p) => p.toLowerCase());

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && (!allowed || allowed.includes('gemini'))) {
    providers.push(new GeminiProvider(geminiKey, process.env.GEMINI_MODEL));
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (claudeKey && (!allowed || allowed.includes('claude'))) {
    providers.push(new ClaudeProvider(claudeKey, process.env.CLAUDE_MODEL));
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && (!allowed || allowed.includes('openai'))) {
    providers.push(new OpenAIProvider(openaiKey, process.env.OPENAI_MODEL));
  }

  return providers;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadImage(imagePath: string): { base64: string; mimeType: string } {
  const data = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  return {
    base64: data.toString('base64'),
    mimeType: mimeMap[ext] ?? 'image/jpeg',
  };
}

function loadGroundTruth(dir: string, receiptType: ReceiptType): GroundTruth[] {
  const subDir = path.join(dir, receiptType);
  if (!fs.existsSync(subDir)) return [];
  return fs
    .readdirSync(subDir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(subDir, f), 'utf-8')) as GroundTruth);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// extract — single receipt, no ground truth
// ---------------------------------------------------------------------------

async function runExtract(opts: {
  image: string;
  type: ReceiptType;
  providers?: string;
}): Promise<void> {
  const providerList = buildProviders(opts.providers?.split(','));
  if (providerList.length === 0) {
    console.error('No providers configured. Set API keys in .env');
    process.exit(1);
  }

  const { base64, mimeType } = loadImage(opts.image);
  console.log(`\nExtracting from: ${opts.image} (${opts.type})`);
  console.log(`Providers: ${providerList.map((p) => p.name).join(', ')}\n`);

  for (const provider of providerList) {
    try {
      console.log(`── ${provider.name} ──`);
      const result = await provider.extract(base64, mimeType, opts.type);

      console.log(`  Latency: ${result.latencyMs} ms`);
      if (result.inputTokens) {
        console.log(`  Tokens:  ${result.inputTokens} in / ${result.outputTokens} out`);
      }
      console.log('  Fields:', JSON.stringify(result.fields, null, 2));
      console.log('  Confidence:', JSON.stringify(result.confidences, null, 2));
      console.log();
    } catch (err) {
      console.error(`  ${provider.name} error:`, (err as Error).message);
    }
  }
}

// ---------------------------------------------------------------------------
// eval — full corpus evaluation
// ---------------------------------------------------------------------------

async function runEval(opts: {
  corpus: string;
  groundTruth: string;
  results: string;
  type: ReceiptType;
  providers?: string;
  concurrency: string;
}): Promise<void> {
  const providerList = buildProviders(opts.providers?.split(','));
  if (providerList.length === 0) {
    console.error('No providers configured. Set API keys in .env');
    process.exit(1);
  }

  const gtItems = loadGroundTruth(opts.groundTruth, opts.type);
  if (gtItems.length === 0) {
    console.error(`No ground truth found in ${opts.groundTruth}/${opts.type}/`);
    process.exit(1);
  }

  console.log(`\nReceipt type: ${opts.type}`);
  console.log(`Corpus:       ${gtItems.length} receipts`);
  console.log(`Providers:    ${providerList.map((p) => p.name).join(', ')}`);

  const concurrency = parseInt(opts.concurrency, 10) || 1;
  const allScores: ReceiptScore[] = [];
  let completed = 0;

  for (const gt of gtItems) {
    const imagePath = path.join(opts.corpus, opts.type, gt.imageFile);
    if (!fs.existsSync(imagePath)) {
      console.warn(`  SKIP ${gt.receiptId}: image not found at ${imagePath}`);
      continue;
    }
    const { base64, mimeType } = loadImage(imagePath);

    const batchResults = await runWithConcurrency(
      providerList.map((provider) => async () => {
        try {
          const extraction = await provider.extract(base64, mimeType, opts.type);
          return scoreReceipt(extraction, gt);
        } catch (err) {
          console.error(`  ERROR ${provider.name}/${gt.receiptId}: ${(err as Error).message}`);
          return errorScore(provider.name, gt);
        }
      }),
      concurrency,
    );

    allScores.push(...batchResults);
    completed++;
    process.stdout.write(`\r  Progress: ${completed}/${gtItems.length}`);
  }

  console.log('\n');

  const report = generateReport(allScores);
  printReport(report);

  ensureDir(opts.results);
  const outPath = path.join(opts.results, `eval-${opts.type}-${dateStamp()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`Full results saved to ${outPath}`);
}

function errorScore(provider: string, gt: GroundTruth): ReceiptScore {
  return {
    receiptId: gt.receiptId,
    imageQuality: gt.imageQuality,
    provider,
    fieldScores: [],
    fieldsCorrect: 0,
    fieldsTotal: Object.keys(gt.fields).length,
    accuracy: 0,
    hasHallucination: false,
    editsRequired: Object.keys(gt.fields).length,
    latencyMs: 0,
  };
}

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let idx = 0;

  async function next(): Promise<void> {
    while (idx < tasks.length) {
      const current = idx++;
      results[current] = await tasks[current]();
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => next()));
  return results;
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnv(): void {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

program
  .name('receipt-eval')
  .description('Receipt OCR evaluation harness');

program
  .command('extract')
  .description('Extract fields from a single receipt image (no ground truth needed)')
  .requiredOption('-i, --image <path>', 'Path to receipt image')
  .option('-t, --type <type>', 'Receipt type: fuel | service', 'fuel')
  .option('-p, --providers <list>', 'Comma-separated provider names (gemini,claude,openai)')
  .action(runExtract);

program
  .command('eval')
  .description('Run full evaluation against a labelled corpus')
  .option('-c, --corpus <dir>', 'Corpus image directory', path.join(ROOT, 'corpus'))
  .option('-g, --ground-truth <dir>', 'Ground truth directory', path.join(ROOT, 'ground-truth'))
  .option('-o, --results <dir>', 'Results output directory', path.join(ROOT, 'results'))
  .option('-t, --type <type>', 'Receipt type: fuel | service', 'fuel')
  .option('-p, --providers <list>', 'Comma-separated provider names')
  .option('-n, --concurrency <n>', 'Max concurrent requests per receipt', '1')
  .action(runEval);

program.parse();

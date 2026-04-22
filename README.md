# Receipt OCR Evaluation Harness

Standalone tool to evaluate multimodal AI vision models against a labelled corpus of fuel and service receipts.

## Setup

```bash
cd tools/receipt-eval
npm install
cp .env.example .env
# Add API keys for the providers you want to test
```

> **Important**: For Gemini, use a *paid* API key (Vertex AI or billed `ai.google.dev`). The free AI Studio tier trains on submitted data.

## Quick test — single receipt

Extract fields from one receipt image without ground truth:

```bash
npx tsx src/run-eval.ts extract -i path/to/receipt.jpg
npx tsx src/run-eval.ts extract -i path/to/receipt.jpg -t service
npx tsx src/run-eval.ts extract -i path/to/receipt.jpg -p gemini,claude
```

## Full evaluation

### 1. Build the corpus

Place receipt images in the corpus directory:

```
corpus/
  fuel/
    fuel-001.jpg
    fuel-002.jpg
    ...
  service/
    service-001.jpg
    ...
```

### 2. Create ground truth

Copy the template and fill in the actual values for each receipt:

```bash
cp ground-truth/_fuel-template.json ground-truth/fuel/fuel-001.json
```

Edit the file to match what's printed on the receipt:

```json
{
  "receiptId": "fuel-001",
  "imageFile": "fuel-001.jpg",
  "receiptType": "fuel",
  "imageQuality": "clean",
  "fields": {
    "date": "2026-04-20",
    "total_cost": 45.23,
    "volume": 12.345,
    "price_per_unit": 3.459,
    "fuel_type": "regular",
    "octane": 87,
    "payment_method": "VISA *1234",
    "station_name": "Shell",
    "station_address": "123 Main St, Anytown, ST 12345",
    "pump_number": 4
  }
}
```

Set any field to `null` if it's not printed on the receipt. Use `"imageQuality": "degraded"` for faded, blurry, or poorly-lit photos.

### 3. Run the evaluation

```bash
# All configured providers, fuel receipts
npx tsx src/run-eval.ts eval

# Specific providers
npx tsx src/run-eval.ts eval -p gemini,claude

# Service receipts
npx tsx src/run-eval.ts eval -t service

# Custom directories
npx tsx src/run-eval.ts eval -c ./my-corpus -g ./my-labels -o ./my-results
```

### 4. Read the report

The CLI prints a summary with acceptance criteria from the spike doc (§9):

| Metric | Target |
|--------|--------|
| Clean receipt accuracy | ≥ 95% |
| Degraded receipt accuracy | ≥ 75% |
| Hallucination rate | ≤ 1% |
| Median edits per receipt | ≤ 1 |
| p95 latency | ≤ 5 s |

Full results are saved as JSON in `results/`.

## Providers

| Provider | Env var | Default model |
|----------|---------|---------------|
| Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` |
| Claude | `ANTHROPIC_API_KEY` | `claude-haiku-4-5-20250514` |
| OpenAI | `OPENAI_API_KEY` | `gpt-4o-mini` |

Override models via `GEMINI_MODEL`, `CLAUDE_MODEL`, `OPENAI_MODEL` in `.env`.

## Scoring

- **Numeric fields** (total_cost, volume, price_per_unit): ±0.015 tolerance
- **Date**: same calendar day regardless of format
- **Enums** (fuel_type, octane): case-insensitive exact match
- **Strings** (station_name, payment_method): fuzzy match (normalized containment + Levenshtein ≥ 60%)
- **Hallucination**: a field scored incorrect with `"high"` confidence

## Validation layer

Before scoring, each extraction runs through the same validation the production backend would use:

- **Arithmetic**: `volume × price_per_unit ≈ total_cost` (within 10% or $0.50)
- **Range checks**: price $0.50–$15/gal, volume 0.1–100 gal, total $0.50–$500
- **Octane**: must be one of 85, 87, 88, 89, 91, 93
- **Date**: not in the future, not older than 1 year

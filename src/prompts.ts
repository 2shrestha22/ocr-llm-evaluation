import type { ReceiptType } from './types.js';

// ---------------------------------------------------------------------------
// Fuel receipt
// ---------------------------------------------------------------------------

export const FUEL_SYSTEM_PROMPT = `You are an expert fuel-receipt data extractor. Given a photograph of a fuel / gas station receipt, extract the requested fields.

EXTRACTION RULES
1. Extract ONLY values literally printed on the receipt. Never infer, calculate, or guess.
2. If a value is unclear, partially obscured, or absent, return null and set confidence to "low" or "none".
3. Prefer returning null over guessing — accuracy matters more than completeness.

FIELD-SPECIFIC RULES
- date: ISO 8601 (YYYY-MM-DD). If only month/day visible, assume the current year.
- total_cost: Final amount charged. If both a pre-pay/authorized and dispensed amount are shown, use the DISPENSED amount. After any loyalty discount, use the post-discount total.
- volume: Fuel dispensed as a number (no unit).
- price_per_unit: Price per gallon or litre. If cash and credit prices are both shown, use the one matching the payment method.
- fuel_type: One of "regular", "midgrade", "premium", "diesel", "e85", "other". Map synonyms (Unleaded → regular, Super/Supreme → premium, Plus → midgrade).
- octane: Numeric rating (87, 89, 91, 93) if printed.
- payment_method: Card type + last 4 digits if visible (e.g. "VISA *1234", "Cash").
- station_name: The gas-station brand or merchant name.
- station_address: Street address if printed.
- pump_number: Pump / dispenser number if printed.

CONFIDENCE SCALE
- "high": Clearly legible and unambiguous.
- "medium": Readable but faded, small, or slightly ambiguous.
- "low": Barely legible or uncertain interpretation.
- "none": Field not present on the receipt (value must be null).`;

export const FUEL_USER_PROMPT =
  'Extract all visible fields from this fuel receipt image. Return a single JSON object.';

export const FUEL_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    date: { type: 'string', nullable: true },
    total_cost: { type: 'number', nullable: true },
    volume: { type: 'number', nullable: true },
    price_per_unit: { type: 'number', nullable: true },
    fuel_type: {
      type: 'string',
      nullable: true,
      enum: ['regular', 'midgrade', 'premium', 'diesel', 'e85', 'other'],
    },
    octane: { type: 'number', nullable: true },
    payment_method: { type: 'string', nullable: true },
    station_name: { type: 'string', nullable: true },
    station_address: { type: 'string', nullable: true },
    pump_number: { type: 'number', nullable: true },
    confidence: {
      type: 'object',
      properties: {
        date: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        total_cost: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        volume: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        price_per_unit: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        fuel_type: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        octane: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        payment_method: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        station_name: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        station_address: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        pump_number: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Service receipt
// ---------------------------------------------------------------------------

export const SERVICE_SYSTEM_PROMPT = `You are a vehicle-service-receipt extraction specialist. Given a photograph of a service receipt (oil change, tire rotation, repair, etc.), extract the requested fields.

EXTRACTION RULES
1. Extract ONLY values literally printed on the receipt. Never infer or guess.
2. If a value is unclear or absent, return null and set confidence to "low" or "none".
3. Prefer returning null over guessing.

FIELD-SPECIFIC RULES
- shop_name: The business name of the service provider.
- date: ISO 8601 (YYYY-MM-DD).
- service_descriptions: Array of service names / descriptions (e.g. ["Oil Change", "Tire Rotation"]).
- total_cost: Final amount charged.
- line_items: Array of { "description": string, "amount": number } for each line on the receipt.
- tax: Tax amount if shown separately.
- payment_method: Card type + last 4 digits if visible.

CONFIDENCE SCALE
- "high": Clearly legible and unambiguous.
- "medium": Readable but faded, small, or slightly ambiguous.
- "low": Barely legible or uncertain.
- "none": Field not present (value must be null).`;

export const SERVICE_USER_PROMPT =
  'Extract all visible fields from this vehicle service receipt image. Return a single JSON object.';

export const SERVICE_RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    shop_name: { type: 'string', nullable: true },
    date: { type: 'string', nullable: true },
    service_descriptions: { type: 'array', items: { type: 'string' }, nullable: true },
    total_cost: { type: 'number', nullable: true },
    line_items: {
      type: 'array',
      nullable: true,
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          amount: { type: 'number' },
        },
      },
    },
    tax: { type: 'number', nullable: true },
    payment_method: { type: 'string', nullable: true },
    confidence: {
      type: 'object',
      properties: {
        shop_name: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        date: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        service_descriptions: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        total_cost: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        line_items: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        tax: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
        payment_method: { type: 'string', enum: ['high', 'medium', 'low', 'none'] },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getPrompts(type: ReceiptType) {
  if (type === 'fuel') {
    return {
      system: FUEL_SYSTEM_PROMPT,
      user: FUEL_USER_PROMPT,
      schema: FUEL_RESPONSE_SCHEMA,
    };
  }
  return {
    system: SERVICE_SYSTEM_PROMPT,
    user: SERVICE_USER_PROMPT,
    schema: SERVICE_RESPONSE_SCHEMA,
  };
}

const FUEL_FIELDS = [
  'date', 'total_cost', 'volume', 'price_per_unit', 'fuel_type',
  'octane', 'payment_method', 'station_name', 'station_address', 'pump_number',
];

const SERVICE_FIELDS = [
  'shop_name', 'date', 'service_descriptions', 'total_cost',
  'line_items', 'tax', 'payment_method',
];

export function getFieldNames(type: ReceiptType): string[] {
  return type === 'fuel' ? FUEL_FIELDS : SERVICE_FIELDS;
}

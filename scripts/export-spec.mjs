// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

// Writes spec/template-v1.json and the Python package's copy from the built
// TypeScript module. Run: npm run build && node scripts/export-spec.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { specJsonText } from '../dist/spec/export.js';
import { inventoryJsonSchema, summaryJsonSchema } from '../dist/spec/json-schema.js';

const text = specJsonText();
mkdirSync(new URL('../spec/', import.meta.url), { recursive: true });
writeFileSync(new URL('../spec/template-v1.json', import.meta.url), text);
writeFileSync(new URL('../python/src/sourcebook/data/template-v1.json', import.meta.url), text);
mkdirSync(new URL('../schema/', import.meta.url), { recursive: true });
writeFileSync(new URL('../schema/summary-v1.schema.json', import.meta.url), `${JSON.stringify(summaryJsonSchema(), null, 2)}\n`);
writeFileSync(new URL('../schema/inventory-v1.schema.json', import.meta.url), `${JSON.stringify(inventoryJsonSchema(), null, 2)}\n`);
console.log('Wrote spec/template-v1.json, its Python copy and the JSON Schemas.');

/**
 * Generates a delivery note with the SAME values as the official sample PDF,
 * so it can be compared pixel-by-pixel with documents/original-template.pdf
 * (see tests/compare_pdf.py).
 *   node tests/generate-sample.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { createGenerator } = require('../js/core/pdf-generator.js');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/generated/embedded-assets.js'), 'utf8'), sandbox);
const assets = sandbox.window.MASDAR_ASSETS;

const sample = {
  number: '1126001',            // same digits as the sample, for comparison only
  documentDate: '2026-11-12',
  createdAt: '2026-11-12T10:00:00.000Z',
  driverName: 'خالد احمد سعد العيسى',
  plateNumber: '6088385',
  trailerNumber: '5512345',
  tareKg: 22780, grossKg: 77000, netKg: 54220,
  carrierName: 'شركة رادك للنقليات',
};

(async () => {
  const gen = createGenerator({ PDFLib, fontkit, assets });
  const outDir = path.join(root, 'tests', 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const bytes = await gen.generate(sample);
  fs.writeFileSync(path.join(outDir, 'sample-generated.pdf'), bytes);
  const noCarrier = await gen.generate(Object.assign({}, sample, { carrierName: '' }));
  fs.writeFileSync(path.join(outDir, 'sample-no-carrier.pdf'), noCarrier);
  console.log('written tests/output/sample-generated.pdf (' + bytes.length + ' bytes)');
})().catch((e) => { console.error(e); process.exit(1); });

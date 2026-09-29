#!/usr/bin/env node
// Pre-deploy guard: refuses to publish a build whose work request form would
// not reach the real worker.
//
// Why: on 21 Sept 2026 a local .env (PUBLIC_FORM_ENDPOINT=http://127.0.0.1:8787)
// was baked into the production build. Every form on the site posted to
// localhost for 8 days and those leads were lost. This check makes that
// class of mistake impossible to deploy.
//
// Usage: node scripts/verify-dist.mjs [distDir]   (exit 1 = do not deploy)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = process.argv[2] || 'dist';
const WORKER = 'gutterbugs-form.ryan-1f9.workers.dev';

// Every page that must carry a working form. Add new form pages here.
const FORM_PAGES = [
  'contact/index.html',
  'commercial/index.html',
  'gutter-clearing/index.html',
  'roof-cleaning/index.html',
  'pressure-washing/index.html',
  'soffit-fascia-washing/index.html',
  'conservatory-cleaning/index.html',
  'solar-panel-cleaning/index.html',
];

// Endpoints that only work on a developer's machine.
const FORBIDDEN = [/127\.0\.0\.1/, /localhost:\d+/, /0\.0\.0\.0:\d+/];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const failures = [];
const files = walk(DIST).filter((f) => /\.(html|js|mjs)$/.test(f));

for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const re of FORBIDDEN) {
    if (re.test(text)) failures.push(`${relative(DIST, f)} contains a local-only endpoint (${re.source})`);
  }
}

for (const page of FORM_PAGES) {
  const f = join(DIST, page);
  let text;
  try {
    text = readFileSync(f, 'utf8');
  } catch {
    failures.push(`${page} is missing from the build`);
    continue;
  }
  if (!text.includes('data-form-instance')) failures.push(`${page} has no work request form`);
  if (!text.includes(WORKER)) failures.push(`${page} does not post to ${WORKER}`);
}

if (failures.length) {
  console.error(`\n✖ Deploy blocked: ${failures.length} problem(s) in ${DIST}/\n`);
  for (const msg of failures) console.error(`  - ${msg}`);
  console.error('\nCheck for a stray .env / .env.production setting PUBLIC_FORM_ENDPOINT.\n');
  process.exit(1);
}
console.log(`✔ Form check passed: ${FORM_PAGES.length} form pages post to ${WORKER}, no local endpoints in ${files.length} files.`);

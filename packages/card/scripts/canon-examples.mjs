// Canonicalizes every open/examples/cards/<id>/card.html in place and validates its contact.json.
// Usage: node open/packages/card/scripts/canon-examples.mjs [--check]
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../../../examples/cards');
const canon = await import(pathToFileURL(join(here, '../../../../supabase/functions/_shared/canon.js')).href);
const check = process.argv.includes('--check');
let bad = 0;
for (const id of readdirSync(root).sort()) {
  const dir = join(root, id);
  const f = join(dir, 'card.html');
  if (!existsSync(f)) continue;
  const raw = readFileSync(f, 'utf8');
  const r = canon.canonHtml(raw);
  const contact = JSON.parse(readFileSync(join(dir, 'contact.json'), 'utf8'));
  const v = canon.validateContact(contact);
  const issues = [...r.report.removed, ...r.report.rewritten].map((i) => `${i.code}×${i.count}`);
  const missing = r.imageRefs.filter((p) => !existsSync(join(dir, p)));
  if (!v.ok) { bad++; console.log(`✗ ${id} contact: ${v.errors.join('; ')}`); }
  if (missing.length) { bad++; console.log(`✗ ${id} missing images: ${missing.join(', ')}`); }
  if (check) {
    if (r.html !== raw) { bad++; console.log(`✗ ${id} is not canonical`); }
  } else writeFileSync(f, r.html);
  const kb = (Buffer.byteLength(r.html) / 1024).toFixed(1);
  console.log(`${r.html === raw || !check ? '✓' : '✗'} ${id.padEnd(16)} ${kb.padStart(5)} KB  finish=${r.meta.finish} fonts=[${r.meta.fonts.join(', ')}]${r.meta.finishMask ? ' mask' : ''}${issues.length ? '  canon: ' + issues.join(' ') : ''}${r.report.warnings.length ? '  warn: ' + r.report.warnings.map((w) => w.code).join(' ') : ''}`);
}
process.exit(bad ? 1 : 0);

import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '..');
const out = resolve(pkg, '../../../supabase/functions/_shared/canon.js');

await build({
  entryPoints: [resolve(pkg, 'src/index.ts')],
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  alias: { 'css-tree': resolve(pkg, 'node_modules/css-tree/dist/csstree.esm.js') },
  legalComments: 'none',
  banner: { js: '// Generated from open/packages/canon by scripts/bundle-deno.mjs. Do not edit.' },
  logLevel: 'warning',
});

const dts = readFileSync(resolve(pkg, 'src/index.ts'), 'utf8')
  .replace(/from '\.\/(\w+)\.js'/g, "from '../../../open/packages/canon/src/$1.ts'");
writeFileSync(out.replace(/\.js$/, '.d.ts'), '// Types re-exported from the canon sources.\n' + dts);
console.log('wrote', out);

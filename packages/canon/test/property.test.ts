import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canonHtml, CanonError } from '../src/index.js';
import { textViolations, treeViolations } from './invariants.js';

const SEED = 20260925;
const RUNS = 2500;

const tags = ['p', 'div', 'span', 'a', 'img', 'svg', 'script', 'style', 'noscript', 'template', 'math', 'textarea', 'title', 'table', 'td', 'iframe', 'form', 'select', 'option', 'mglyph', 'mtext', 'foreignObject', 'desc', 'text', 'path', 'b', 'x-y', 'xmp', 'plaintext'];
const attrs = ['onclick', 'onerror', 'src', 'href', 'style', 'id', 'class', 'title', 'data-x', 'xlink:href', 'srcdoc', 'is', 'data-face', 'fill', 'd'];
const values = ['x', 'javascript:alert(1)', 'https://e.x/p.png', 'images/000000000000.webp', '"><img src=x onerror=alert(1)>', 'color:red;position:fixed', 'background:url(https://e.x)', '</style><script>1</script>', 'url(#a)', '`', '&lt;script&gt;', '\u0000', ' '];
const texts = ['hi', '<', '>', '&', '<!--', '-->', ']]>', '</script>', '</style>', '<img src=x onerror=alert(1)>', ' ', '\n', 'Tip: onclick=x', 'a@b.c', 'https://x.y', ' ', '💳'];

const htmlish = fc.letrec((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    fc.constantFrom(...texts),
    fc
      .tuple(
        fc.constantFrom(...tags),
        fc.array(fc.tuple(fc.constantFrom(...attrs), fc.constantFrom(...values)), { maxLength: 3 }),
        fc.array(tie('node'), { maxLength: 4 }),
        fc.boolean(),
      )
      .map(([t, as, kids, close]) => {
        const a = as.map(([k, v]) => ` ${k}="${v.replace(/"/g, '&quot;')}"`).join('');
        return `<${t}${a}>${(kids as string[]).join('')}${close ? `</${t}>` : ''}`;
      }),
  ),
})).node;

function canonOrNull(x: string): string | null {
  try {
    return canonHtml(x).html;
  } catch (e) {
    if (e instanceof CanonError) return null;
    throw e;
  }
}

describe('property: canon is idempotent and inert', () => {
  it('structured html-ish input', () => {
    fc.assert(
      fc.property(htmlish, (x) => {
        const out = canonOrNull(x);
        if (out === null) return;
        expect(textViolations(out), out).toEqual([]);
        expect(treeViolations(out), out).toEqual([]);
        expect(canonOrNull(out)).toBe(out);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300, unit: 'grapheme-ascii' }), (x) => {
        const out = canonOrNull(x);
        if (out === null) return;
        expect(textViolations(out), out).toEqual([]);
        expect(canonOrNull(out)).toBe(out);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });

  it('css in style blocks', () => {
    const css = fc.array(
      fc.constantFrom(
        'p{color:red}', 'a:hover{x:y}', '@import url(x);', '@media (prefers-color-scheme:dark){p{color:#fff}}',
        '@keyframes k{from{opacity:0}to{opacity:1}}', 'p{background:url(https://e.x)}', 'p{position:fixed}',
        '\\', '}', '{', ';', '"', "'", '/*', '*/', '<', '</style>', 'p{--x:url(x)}', 'p{font-family:"Fraunces",serif}',
        '#a{b:c}', '#1{b:c}', 'p{width:calc(100% - 2px)}', '@font-face{src:url(x)}', 'p{background:image-set("x.png" 1x)}',
      ),
      { maxLength: 8 },
    );
    fc.assert(
      fc.property(css, (parts) => {
        const out = canonOrNull(`<style>${parts.join('')}</style><p>x</p>`);
        if (out === null) return;
        expect(textViolations(out), out).toEqual([]);
        expect(canonOrNull(out)).toBe(out);
      }),
      { seed: SEED, numRuns: RUNS },
    );
  });
});

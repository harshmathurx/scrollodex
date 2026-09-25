import { parse, type DefaultTreeAdapterMap } from 'parse5';

type El = DefaultTreeAdapterMap['element'];
type Parent = DefaultTreeAdapterMap['parentNode'];

const ALLOWED_HTML = new Set([
  'html', 'head', 'body', 'meta', 'title', 'style', 'main', 'section', 'article', 'aside', 'header', 'footer',
  'address', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'br', 'hr', 'blockquote', 'q', 'cite', 'em',
  'strong', 'b', 'i', 'u', 's', 'small', 'mark', 'sub', 'sup', 'abbr', 'time', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'img', 'picture', 'source', 'figure', 'figcaption',
]);
const FORBIDDEN_SVG = new Set(['script', 'foreignObject', 'use', 'image', 'feImage', 'a', 'animate', 'animateTransform', 'animateMotion', 'set', 'discard', 'style', 'handler', 'iframe']);

/** Substring checks from the build contract. Returns a list of violations (empty = inert). */
export function textViolations(html: string): string[] {
  const v: string[] = [];
  // Text nodes are escaped and inert; only markup and <style> contents can act.
  const lower = html
    .toLowerCase()
    .split(/(<style>[\s\S]*?<\/style>)/)
    .map((part) => (part.startsWith('<style>') ? part : part.replace(/>[^<]*</g, '><')))
    .join('');
  const checks: [string, RegExp][] = [
    ['<script', /<script/],
    ['on*= attribute', /\son[a-z]+\s*=/],
    ['javascript:', /javascript:/],
    ['<iframe', /<iframe/],
    ['<object', /<object/],
    ['<embed', /<embed/],
    ['<form', /<form/],
    ['<a ', /<a[\s>]/],
    ['<link', /<link/],
    ['<base', /<base/],
    ['srcdoc', /srcdoc/],
    ['@import', /@import/],
    ['position:fixed', /position\s*:\s*fixed/],
    ['position:sticky', /position\s*:\s*(?:-webkit-)?sticky/],
    ['http url', /https?:/],
    ['protocol-relative url', /url\(\s*['"]?\/\//],
    ['expression(', /expression\s*\(/],
    ['@font-face', /@font-face/],
    ['behavior', /behavior\s*:/],
    ['binding', /-(?:moz|webkit)-binding/],
  ];
  for (const [name, re] of checks) if (re.test(lower)) v.push(name);
  for (const m of lower.matchAll(/<meta\b[^>]*>/g)) {
    const tag = m[0];
    if (tag !== '<meta charset="utf-8">' && !/^<meta name="scrollodex:(?:orientation|finish|finish-mask|background)" content="[^"]*">$/.test(tag)) {
      v.push('meta ' + tag);
    }
  }
  // url() only means anything in CSS: <style> blocks and style="" attributes.
  const css = [...lower.matchAll(/<style>([\s\S]*?)<\/style>|\sstyle="([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? '').join('\n');
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)/g)) {
    const u = m[2]!;
    if (!/^images\/[0-9a-f]{12}\.(?:webp|png)$/.test(u) && !/^#[a-z][a-z0-9-]*$/.test(u)) v.push('url(' + u + ')');
  }
  return v;
}

/** Structural check: re-parse the output as a browser would and walk every node. */
export function treeViolations(html: string): string[] {
  const v: string[] = [];
  const doc = parse(html, { scriptingEnabled: false });
  const walk = (p: Parent) => {
    for (const n of p.childNodes) {
      if (n.nodeName === '#comment') v.push('comment');
      if (!('tagName' in n)) continue;
      const el = n as El;
      if (el.namespaceURI === 'http://www.w3.org/1999/xhtml') {
        if (!ALLOWED_HTML.has(el.tagName)) v.push('element ' + el.tagName);
      } else if (el.namespaceURI === 'http://www.w3.org/2000/svg') {
        if (FORBIDDEN_SVG.has(el.tagName)) v.push('svg ' + el.tagName);
      } else v.push('namespace ' + el.namespaceURI);
      for (const a of el.attrs) {
        const name = a.name.toLowerCase();
        if (name.startsWith('on')) v.push('attr ' + name);
        if (['href', 'xlink:href'].includes(name) && !a.value.startsWith('#')) v.push('href ' + a.value);
        if (name === 'src' || name === 'srcset') {
          for (const part of a.value.split(',')) {
            const u = part.trim().split(/\s+/)[0] ?? '';
            if (!/^images\/[0-9a-f]{12}\.(?:webp|png)$/.test(u)) v.push(name + ' ' + u);
          }
        }
        if (name === 'data-face' || name === 'srcdoc' || name === 'formaction' || name === 'ping') v.push('attr ' + name);
      }
      walk(el);
      if (el.tagName === 'template') walk((el as unknown as { content: Parent }).content);
    }
  };
  walk(doc);
  return v;
}

import { parse, type DefaultTreeAdapterMap } from 'parse5';
import { sanitizeInlineStyle, sanitizeStylesheet, type CssContext } from './css.js';
import { CanonError } from './errors.js';
import { FINISHES, LIMITS, type CardMeta, type Finish } from './limits.js';
import { Reporter, type SanitizeReport } from './report.js';
import { classifyUrl, decodeDataUri, validId } from './url.js';

type PNode = DefaultTreeAdapterMap['node'];
type PElement = DefaultTreeAdapterMap['element'];
type PParent = DefaultTreeAdapterMap['parentNode'];

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

type ONode = OElement | OText;
interface OElement {
  t: 'el';
  name: string;
  ns: 'html' | 'svg';
  attrs: [string, string][];
  children: ONode[];
}
interface OText {
  t: 'text';
  v: string;
}

const HTML_KEEP = new Set([
  'main', 'section', 'article', 'aside', 'header', 'footer', 'address', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'div', 'span', 'br', 'hr', 'blockquote', 'q', 'cite', 'em', 'strong', 'b', 'i', 'u', 's', 'small', 'mark',
  'sub', 'sup', 'abbr', 'time', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'img', 'picture', 'source', 'figure', 'figcaption',
]);
const HTML_VOID = new Set(['br', 'hr', 'img', 'source']);
const HTML_DROP: Record<string, string> = {
  script: 'element.script', noscript: 'element.script', template: 'element.dropped',
  iframe: 'element.iframe', frame: 'element.iframe', frameset: 'element.iframe', object: 'element.iframe',
  embed: 'element.iframe', applet: 'element.iframe', param: 'element.iframe', portal: 'element.iframe',
  form: 'element.form', input: 'element.form', button: 'element.form', select: 'element.form',
  option: 'element.form', optgroup: 'element.form', textarea: 'element.form', output: 'element.form',
  fieldset: 'element.form', legend: 'element.form', datalist: 'element.form', progress: 'element.form',
  meter: 'element.form', canvas: 'element.dropped', audio: 'element.media', video: 'element.media',
  track: 'element.media', map: 'element.dropped', area: 'element.dropped', base: 'element.base',
  link: 'element.link', dialog: 'element.dropped', slot: 'element.dropped', math: 'element.foreign',
  xmp: 'element.dropped', plaintext: 'element.dropped', listing: 'element.dropped', noembed: 'element.dropped',
  noframes: 'element.dropped', 'selectedcontent': 'element.form', search: 'element.dropped',
};

const SVG_KEEP = new Set([
  'svg', 'g', 'defs', 'symbol', 'title', 'desc', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'textPath', 'linearGradient', 'radialGradient', 'stop', 'pattern', 'clipPath', 'mask', 'marker',
  'filter', 'feBlend', 'feColorMatrix', 'feComponentTransfer', 'feComposite', 'feConvolveMatrix',
  'feDiffuseLighting', 'feDisplacementMap', 'feDistantLight', 'feDropShadow', 'feFlood', 'feFuncA', 'feFuncB',
  'feFuncG', 'feFuncR', 'feGaussianBlur', 'feMerge', 'feMergeNode', 'feMorphology', 'feOffset', 'fePointLight',
  'feSpecularLighting', 'feSpotLight', 'feTile', 'feTurbulence',
]);
const SVG_TEXT = new Set(['text', 'tspan', 'textPath']);
const SVG_ATTRS = new Set([
  'd', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'dx', 'dy', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'fx', 'fy', 'fr',
  'points', 'transform', 'viewBox', 'preserveAspectRatio', 'fill', 'fill-rule', 'fill-opacity', 'stroke',
  'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset',
  'stroke-opacity', 'opacity', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform',
  'spreadMethod', 'patternUnits', 'patternContentUnits', 'patternTransform', 'clip-path', 'clipPathUnits',
  'clip-rule', 'mask', 'maskUnits', 'maskContentUnits', 'filter', 'filterUnits', 'primitiveUnits', 'font-family',
  'font-size', 'font-weight', 'font-style', 'text-anchor', 'dominant-baseline', 'letter-spacing', 'word-spacing',
  'textLength', 'lengthAdjust', 'startOffset', 'class', 'role', 'markerWidth', 'markerHeight', 'refX', 'refY',
  'orient', 'markerUnits', 'marker-start', 'marker-mid', 'marker-end', 'paint-order', 'vector-effect', 'visibility',
  'display', 'color', 'stdDeviation', 'in', 'in2', 'result', 'operator', 'k1', 'k2', 'k3', 'k4', 'values', 'type',
  'tableValues', 'slope', 'intercept', 'amplitude', 'exponent', 'baseFrequency', 'numOctaves', 'seed',
  'stitchTiles', 'scale', 'xChannelSelector', 'yChannelSelector', 'radius', 'mode', 'flood-color', 'flood-opacity',
  'lighting-color', 'surfaceScale', 'diffuseConstant', 'specularConstant', 'specularExponent', 'kernelMatrix',
  'order', 'divisor', 'bias', 'targetX', 'targetY', 'edgeMode', 'kernelUnitLength', 'preserveAlpha', 'azimuth',
  'elevation', 'pointsAtX', 'pointsAtY', 'pointsAtZ', 'limitingConeAngle', 'z', 'mix-blend-mode',
]);

const COLOR_RE = /^(?:#[0-9a-f]{3,8}|[a-z]{3,24}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\([0-9a-z.,%\s/+-]{1,64}\))$/i;
const LANG_RE = /^[a-z]{1,8}(?:-[a-z0-9]{1,8})*$/i;
const PHONE_RE = /(?:\+\d[\d ().-]{7,}\d)|(?:\(?\b\d{3}\)?[ .-]\d{3}[ .-]\d{4}\b)/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export interface CanonResult {
  html: string;
  report: SanitizeReport;
  meta: CardMeta;
  externalImages: string[];
  dataImages: { ref: string; mime: string; bytes: Uint8Array }[];
  imageRefs: string[];
}

interface Ctx {
  reporter: Reporter;
  css: CssContext;
  imageMap: Record<string, string>;
  styles: string[];
  meta: { orientation?: 'landscape' | 'portrait'; finish?: Finish; finishMask?: string; background?: string };
  title?: string;
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

function textOf(node: PParent): string {
  let s = '';
  for (const c of node.childNodes) {
    if (c.nodeName === '#text') s += (c as DefaultTreeAdapterMap['textNode']).value;
    else if ('childNodes' in c) s += textOf(c as PParent);
  }
  return s;
}

function mapRef(ctx: Ctx, v: string): string {
  return ctx.imageMap[v] ?? ctx.imageMap[v.trim()] ?? v;
}

/** Classify an image URL from an HTML attribute; returns the canonical ref or null (and records why). */
function imageUrl(ctx: Ctx, raw: string): string | null {
  const cls = classifyUrl(mapRef(ctx, raw), false);
  switch (cls.kind) {
    case 'image':
      ctx.css.imageRefs.add(cls.ref);
      return cls.ref;
    case 'external':
      ctx.css.externalImages.add(cls.url);
      ctx.reporter.removed('image.external', cls.url);
      return null;
    case 'data':
      ctx.css.dataImages.set(cls.uri, cls.mime);
      ctx.reporter.removed('image.data');
      return null;
    case 'missing':
      ctx.reporter.removed('image.missing', cls.ref);
      return null;
    default:
      ctx.reporter.removed('image.bad_url', raw);
      return null;
  }
}

function parseSrcset(value: string): { url: string; desc: string }[] {
  const out: { url: string; desc: string }[] = [];
  let i = 0;
  const n = value.length;
  const ws = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  while (i < n) {
    while (i < n && (ws(value[i]) || value[i] === ',')) i++;
    if (i >= n) break;
    let start = i;
    while (i < n && !ws(value[i])) i++;
    let url = value.slice(start, i);
    let desc = '';
    if (url.endsWith(',')) {
      url = url.replace(/,+$/, '');
    } else {
      while (i < n && ws(value[i])) i++;
      start = i;
      while (i < n && value[i] !== ',') i++;
      desc = value.slice(start, i).trim();
    }
    out.push({ url, desc });
  }
  return out;
}

function sanitizeSrcset(ctx: Ctx, value: string): string | null {
  const parts: string[] = [];
  for (const { url, desc } of parseSrcset(value)) {
    const ref = imageUrl(ctx, url);
    if (!ref) continue;
    if (desc && !/^\d{1,5}(?:\.\d{1,3})?[wx]$/.test(desc)) continue;
    parts.push(desc ? `${ref} ${desc}` : ref);
  }
  return parts.length ? parts.join(', ') : null;
}

function globalAttr(ctx: Ctx, name: string, value: string): string | null | undefined {
  // undefined → not a global attribute; null → drop; string → keep with this value
  if (name === 'class') {
    const v = value.split(/[\t\n\f\r ]+/).filter((c) => /^[A-Za-z0-9_-]{1,64}$/.test(c)).join(' ');
    return v || null;
  }
  if (name === 'style') {
    const v = sanitizeInlineStyle(value, ctx.css);
    return v || null;
  }
  if (name === 'title') return value.length <= 512 ? value : null;
  if (name === 'lang') return LANG_RE.test(value) ? value : null;
  if (name === 'dir') return value === 'ltr' || value === 'rtl' || value === 'auto' ? value : null;
  if (name === 'role') return /^[a-z]{2,24}(?: [a-z]{2,24}){0,3}$/.test(value) ? value : null;
  if (name.startsWith('aria-')) return /^aria-[a-z]{1,40}$/.test(name) && value.length <= 512 ? value : null;
  if (name.startsWith('data-')) {
    if (name === 'data-face') {
      ctx.reporter.removed('attr.data_face');
      return null;
    }
    return /^data-[a-z0-9-]{1,40}$/.test(name) && value.length <= 512 ? value : null;
  }
  if (name === 'id') {
    const id = validId(value);
    if (!id) ctx.reporter.removed('attr.id_invalid', value);
    return id;
  }
  return undefined;
}

function htmlAttrs(ctx: Ctx, el: PElement, outName: string, parentName: string): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const a of el.attrs) {
    if (a.namespace) {
      ctx.reporter.removed('attr.dropped', a.name);
      continue;
    }
    const name = a.name.toLowerCase();
    const value = a.value;
    if (seen.has(name)) continue;
    if (/^on/.test(name)) {
      ctx.reporter.removed('attr.handler', name);
      continue;
    }
    let v: string | null | undefined = globalAttr(ctx, name, value);
    if (v === undefined) {
      v = null;
      if (outName === 'img') {
        if (name === 'src') v = imageUrl(ctx, value);
        else if (name === 'srcset') v = sanitizeSrcset(ctx, value);
        else if (name === 'alt') v = value.length <= 512 ? value : value.slice(0, 512);
        else if (name === 'width' || name === 'height') v = /^\d{1,5}$/.test(value) ? value : null;
        else if (name === 'sizes') v = /^[a-z0-9 ()%,.:-]{1,200}$/i.test(value) ? value : null;
      } else if (outName === 'source' && parentName === 'picture') {
        if (name === 'srcset') v = sanitizeSrcset(ctx, value);
        else if (name === 'sizes') v = /^[a-z0-9 ()%,.:-]{1,200}$/i.test(value) ? value : null;
        else if (name === 'media') v = /^\((?:prefers-color-scheme|orientation):\s*[a-z]+\)$/.test(value) ? value : null;
        else if (name === 'type') v = null;
      } else if (outName === 'ol') {
        if (name === 'start') v = /^-?\d{1,6}$/.test(value) ? value : null;
        else if (name === 'reversed') v = '';
        else if (name === 'type') v = /^[1aAiI]$/.test(value) ? value : null;
      } else if (outName === 'li' && name === 'value') v = /^-?\d{1,6}$/.test(value) ? value : null;
      else if (outName === 'time' && name === 'datetime') v = /^[0-9T:+\-Z. ]{1,64}$/.test(value) ? value : null;
      if (v === null && !['src', 'srcset'].includes(name)) {
        ctx.reporter.removed(name === 'href' ? 'attr.href' : 'attr.dropped', name);
      }
    }
    if (v === null) continue;
    seen.add(name);
    out.push([name, v]);
  }
  return out;
}

function svgUrlRefs(value: string): string | null {
  if (!/url\s*\(/i.test(value)) return value;
  const replaced = value.replace(/url\(\s*(['"]?)#([^'")\s]{1,40})\1\s*\)/g, (_m, _q: string, id: string) => {
    const p = validId(id);
    return p ? `url(#${p})` : '\u0000';
  });
  if (replaced.includes('\u0000') || /url\s*\(/i.test(replaced.replace(/url\(#[a-z][a-z0-9-]{0,31}\)/g, ''))) return null;
  return replaced;
}

function svgAttrs(ctx: Ctx, el: PElement, name: string): [string, string][] {
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const a of el.attrs) {
    const isHref = a.name === 'href' && (!a.namespace || a.namespace === XLINK_NS);
    if (isHref) {
      const v = a.value.trim();
      const id = name === 'textPath' && v.startsWith('#') ? validId(v.slice(1)) : null;
      if (id && !seen.has('href')) {
        seen.add('href');
        out.push(['href', '#' + id]);
      } else ctx.reporter.removed('attr.href', a.value);
      continue;
    }
    if (a.namespace) {
      ctx.reporter.removed('attr.dropped', a.name);
      continue;
    }
    const n = a.name;
    if (seen.has(n)) continue;
    if (/^on/i.test(n)) {
      ctx.reporter.removed('attr.handler', n);
      continue;
    }
    let v: string | null = null;
    if (n === 'id') {
      v = validId(a.value);
      if (!v) ctx.reporter.removed('attr.id_invalid', a.value);
    } else if (n.startsWith('aria-')) {
      v = /^aria-[a-z]{1,40}$/.test(n) && a.value.length <= 512 ? a.value : null;
    } else if (n === 'class') {
      v = a.value.split(/[\t\n\f\r ]+/).filter((c) => /^[A-Za-z0-9_-]{1,64}$/.test(c)).join(' ') || null;
    } else if (SVG_ATTRS.has(n)) {
      const lower = a.value.toLowerCase().replace(/[\s\u0000-\u001f]+/g, '');
      if (lower.includes('javascript:') || lower.includes('expression(') || lower.includes('data:')) v = null;
      else if (n === 'd' && a.value.length > 32768) v = null;
      else v = svgUrlRefs(a.value);
    } else {
      ctx.reporter.removed('attr.dropped', n);
      continue;
    }
    if (v === null) {
      ctx.reporter.removed('attr.dropped', n);
      continue;
    }
    seen.add(n);
    out.push([n, v]);
  }
  return out;
}

function handleMeta(ctx: Ctx, el: PElement): void {
  const get = (k: string) => el.attrs.find((a) => a.name.toLowerCase() === k)?.value;
  const name = (get('name') ?? '').toLowerCase().trim();
  const content = (get('content') ?? '').trim();
  const other = el.attrs.some((a) => !['name', 'content'].includes(a.name.toLowerCase()));
  if (!name.startsWith('scrollodex:') || other) {
    if (el.attrs.some((a) => a.name.toLowerCase() === 'charset') && el.attrs.length === 1) return; // we emit our own
    ctx.reporter.removed('element.meta', name || el.attrs.map((a) => a.name).join(' '));
    return;
  }
  const m = ctx.meta;
  const bad = () => ctx.reporter.removed('meta.invalid', `${name}=${content}`);
  switch (name) {
    case 'scrollodex:orientation':
      if (m.orientation) return;
      if (content === 'landscape' || content === 'portrait') m.orientation = content;
      else bad();
      return;
    case 'scrollodex:finish':
      if (m.finish) return;
      if ((FINISHES as readonly string[]).includes(content)) m.finish = content as Finish;
      else bad();
      return;
    case 'scrollodex:finish-mask': {
      if (m.finishMask) return;
      const ref = imageUrl(ctx, content);
      if (ref) m.finishMask = ref;
      return;
    }
    case 'scrollodex:background':
      if (m.background) return;
      if (COLOR_RE.test(content)) m.background = content.toLowerCase();
      else bad();
      return;
    default:
      bad();
  }
}

type Mode = 'html' | 'svg' | 'svgtext' | 'textonly';

function walk(ctx: Ctx, parent: PParent, out: ONode[], mode: Mode, parentName: string): void {
  for (const node of parent.childNodes as PNode[]) {
    if (node.nodeName === '#text') {
      out.push({ t: 'text', v: (node as DefaultTreeAdapterMap['textNode']).value });
      continue;
    }
    if (node.nodeName === '#comment') {
      ctx.reporter.removed('comment.removed');
      continue;
    }
    if (!('tagName' in node)) continue;
    const el = node as PElement;
    if (mode === 'textonly') {
      ctx.reporter.removed(el.namespaceURI === SVG_NS ? 'svg.dropped' : 'element.dropped', el.tagName);
      continue;
    }
    if (mode === 'svg' || mode === 'svgtext') {
      if (el.namespaceURI !== SVG_NS) {
        ctx.reporter.removed('element.foreign', el.tagName);
        continue;
      }
      const name = el.tagName;
      if (name === 'style') {
        ctx.reporter.removed('element.style_in_svg');
        continue;
      }
      if (!SVG_KEEP.has(name) || (mode === 'svgtext' && name !== 'tspan' && name !== 'textPath')) {
        ctx.reporter.removed('svg.dropped', name);
        continue;
      }
      const o: OElement = { t: 'el', name, ns: 'svg', attrs: svgAttrs(ctx, el, name), children: [] };
      const childMode: Mode = SVG_TEXT.has(name) ? 'svgtext' : name === 'title' || name === 'desc' ? 'textonly' : 'svg';
      walk(ctx, el, o.children, childMode, name);
      out.push(o);
      continue;
    }
    // html mode
    if (el.namespaceURI === SVG_NS) {
      if (el.tagName !== 'svg') {
        ctx.reporter.removed('svg.dropped', el.tagName);
        continue;
      }
      const o: OElement = { t: 'el', name: 'svg', ns: 'svg', attrs: svgAttrs(ctx, el, 'svg'), children: [] };
      walk(ctx, el, o.children, 'svg', 'svg');
      out.push(o);
      continue;
    }
    if (el.namespaceURI !== HTML_NS) {
      ctx.reporter.removed('element.foreign', el.tagName);
      continue;
    }
    const name = el.tagName;
    if (name === 'style') {
      const css = sanitizeStylesheet(textOf(el), ctx.css);
      if (css) ctx.styles.push(css);
      continue;
    }
    if (name === 'meta') {
      handleMeta(ctx, el);
      continue;
    }
    if (name === 'title') {
      if (ctx.title === undefined) ctx.title = textOf(el).replace(/[\t\n\f\r ]+/g, ' ').trim().slice(0, 120);
      continue;
    }
    const drop = HTML_DROP[name];
    if (drop) {
      ctx.reporter.removed(drop, name);
      continue;
    }
    if (name === 'a') {
      ctx.reporter.rewritten('link.to_span');
      const o: OElement = { t: 'el', name: 'span', ns: 'html', attrs: htmlAttrs(ctx, el, 'span', parentName), children: [] };
      walk(ctx, el, o.children, 'html', 'span');
      out.push(o);
      continue;
    }
    if (name === 'source' && parentName !== 'picture') {
      ctx.reporter.removed('element.dropped', 'source');
      continue;
    }
    if (HTML_KEEP.has(name)) {
      const o: OElement = { t: 'el', name, ns: 'html', attrs: htmlAttrs(ctx, el, name, parentName), children: [] };
      if ((name === 'img' || name === 'source') && !o.attrs.some(([k]) => k === 'src' || k === 'srcset')) continue;
      if (!HTML_VOID.has(name)) walk(ctx, el, o.children, 'html', name);
      out.push(o);
      continue;
    }
    // unknown / unwrap-listed: keep children, lose the element
    ctx.reporter.rewritten('element.unwrapped', name);
    walk(ctx, el, out, 'html', parentName);
  }
}

// ---------- minify ----------

function minify(children: ONode[], preserve: boolean): ONode[] {
  // Merge adjacent text, then collapse each whitespace run to one space (except inside svg text).
  // Whitespace-only nodes are never deleted, so inline spacing can't change between passes.
  const merged: ONode[] = [];
  for (const c of children) {
    const last = merged[merged.length - 1];
    if (c.t === 'text' && last && last.t === 'text') last.v += c.v;
    else if (c.t === 'text') merged.push({ t: 'text', v: c.v });
    else merged.push(c);
  }
  const out: ONode[] = [];
  for (const c of merged) {
    if (c.t === 'el') {
      c.children = minify(c.children, preserve || (c.ns === 'svg' && SVG_TEXT.has(c.name)));
      out.push(c);
      continue;
    }
    const v = preserve ? c.v : c.v.replace(/[\t\n\f\r ]+/g, ' ');
    if (v !== '') out.push({ t: 'text', v });
  }
  return out;
}

// ---------- serialize ----------

// '=', ':' and '@' are entity-encoded in text and plain attribute values, so no output ever contains
// handler-, scheme- or at-rule-shaped substrings, even as harmless text.
function escInert(s: string): string {
  return s.replace(/=/g, '&#61;').replace(/:/g, '&#58;').replace(/@/g, '&#64;');
}
function escText(s: string): string {
  return escInert(s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;'));
}
function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
}
function escAttrValue(name: string, v: string): string {
  return name === 'style' ? escAttr(v) : escInert(escAttr(v));
}

function serializeNodes(nodes: ONode[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.t === 'text') {
      s += escText(n.v);
      continue;
    }
    s += '<' + n.name;
    for (const [k, v] of n.attrs) s += ` ${k}="${escAttrValue(k, v)}"`;
    s += '>';
    if (n.ns === 'html' && HTML_VOID.has(n.name)) continue;
    s += serializeNodes(n.children) + `</${n.name}>`;
  }
  return s;
}

function countBudget(nodes: ONode[], depth: number, acc: { elements: number; depth: number }): void {
  for (const n of nodes) {
    if (n.t !== 'el') continue;
    acc.elements++;
    if (depth > acc.depth) acc.depth = depth;
    countBudget(n.children, depth + 1, acc);
  }
}

function textAll(nodes: ONode[]): string {
  return nodes.map((n) => (n.t === 'text' ? n.v : ' ' + textAll(n.children) + ' ')).join('');
}

function findChild(parent: PParent, name: string): PElement | undefined {
  return parent.childNodes.find((c) => (c as PElement).tagName === name) as PElement | undefined;
}

interface CoreResult extends CanonResult {}

function core(input: string, imageMap: Record<string, string>): CoreResult {
  if (typeof input !== 'string') throw new CanonError('html.not_string', 'card.html must be a string');
  const bytesIn = utf8Length(input);
  if (bytesIn > LIMITS.htmlUploadBytes) {
    throw new CanonError('html.too_large', `card.html is ${(bytesIn / 1024).toFixed(1)} KB; the limit is 50 KB.`);
  }
  const src = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const reporter = new Reporter();
  const css: CssContext = {
    reporter,
    imageMap,
    imageRefs: new Set(),
    externalImages: new Set(),
    dataImages: new Map(),
    fonts: new Set(),
    counts: { keyframes: 0, filters: 0 },
  };
  const ctx: Ctx = { reporter, css, imageMap, styles: [], meta: {} };
  const doc = parse(src, { scriptingEnabled: false });
  const htmlEl = findChild(doc, 'html');
  let lang: string | null = null;
  let dir: string | null = null;
  const bodyOut: ONode[] = [];
  let bodyAttrs: [string, string][] = [];
  if (htmlEl) {
    for (const a of htmlEl.attrs) {
      if (a.name === 'lang' && LANG_RE.test(a.value)) lang = a.value;
      else if (a.name === 'dir' && ['ltr', 'rtl', 'auto'].includes(a.value)) dir = a.value;
    }
    const head = findChild(htmlEl, 'head');
    const body = findChild(htmlEl, 'body');
    if (head) {
      const scratch: ONode[] = [];
      walk(ctx, head, scratch, 'html', 'head');
      // anything that survives in head is visible content; move it to body
      bodyOut.push(...scratch);
    }
    if (body) {
      bodyAttrs = htmlAttrs(ctx, body, 'body', 'html');
      walk(ctx, body, bodyOut, 'html', 'body');
    }
  }
  const children = minify(bodyOut, false);

  const acc = { elements: 0, depth: 0 };
  countBudget(children, 1, acc);
  if (acc.elements > LIMITS.elements) throw new CanonError('budget.elements', `The card has ${acc.elements} elements; the limit is ${LIMITS.elements}.`);
  if (acc.depth > LIMITS.depth) throw new CanonError('budget.depth', `The card nests ${acc.depth} levels deep; the limit is ${LIMITS.depth}.`);
  if (css.counts.keyframes > LIMITS.keyframes) throw new CanonError('budget.keyframes', `The card has ${css.counts.keyframes} @keyframes; the limit is ${LIMITS.keyframes}.`);
  if (css.counts.filters > LIMITS.filters) throw new CanonError('budget.filters', `The card uses ${css.counts.filters} filters; the limit is ${LIMITS.filters}.`);
  if (ctx.meta.finishMask) css.imageRefs.add(ctx.meta.finishMask);
  if (css.imageRefs.size > LIMITS.images) throw new CanonError('budget.images', `The card uses ${css.imageRefs.size} images; the limit is ${LIMITS.images}.`);

  const text = textAll(children) + ' ' + (ctx.title ?? '');
  if (PHONE_RE.test(text)) reporter.warn('public.phone');
  if (EMAIL_RE.test(text)) reporter.warn('public.email');

  let head = '<meta charset="utf-8">';
  const m = ctx.meta;
  if (m.orientation) head += `<meta name="scrollodex:orientation" content="${m.orientation}">`;
  if (m.finish) head += `<meta name="scrollodex:finish" content="${m.finish}">`;
  if (m.finishMask) head += `<meta name="scrollodex:finish-mask" content="${escAttr(m.finishMask)}">`;
  if (m.background) head += `<meta name="scrollodex:background" content="${escAttr(m.background)}">`;
  if (ctx.title) head += `<title>${escText(ctx.title)}</title>`;
  const cssText = ctx.styles.join('');
  if (cssText) head += `<style>${cssText}</style>`;

  let open = '<html';
  if (lang) open += ` lang="${escAttr(lang)}"`;
  if (dir) open += ` dir="${dir}"`;
  open += '>';
  let bodyOpen = '<body';
  for (const [k, v] of bodyAttrs) bodyOpen += ` ${k}="${escAttrValue(k, v)}"`;
  bodyOpen += '>';

  const html = `<!doctype html>${open}<head>${head}</head>${bodyOpen}${serializeNodes(children)}</body></html>`;

  const dataImages: CanonResult['dataImages'] = [];
  for (const [uri, mime] of css.dataImages) {
    const bytes = decodeDataUri(uri);
    if (bytes) dataImages.push({ ref: uri, mime, bytes });
  }
  const meta: CardMeta = {
    orientation: m.orientation ?? 'landscape',
    finish: m.finish ?? 'matte',
    fonts: [...css.fonts].sort(),
  };
  if (m.finishMask) meta.finishMask = m.finishMask;
  if (m.background) meta.background = m.background;

  return {
    html,
    report: reporter.build(bytesIn, utf8Length(html)),
    meta,
    externalImages: [...css.externalImages].sort(),
    dataImages,
    imageRefs: [...css.imageRefs].sort(),
  };
}

/**
 * Canonicalize card.html: allowlist sanitize, minify, serialize in the fixed shape,
 * then prove idempotence by running the pipeline again on the output.
 */
export function canonHtml(html: string, opts?: { imageMap?: Record<string, string> }): CanonResult {
  const first = core(html, opts?.imageMap ?? {});
  const second = core(first.html, {});
  if (second.html !== first.html) {
    throw new CanonError('canon.unstable', 'This HTML changes shape when read twice, so it was rejected.', {
      first: first.html.length,
      second: second.html.length,
    });
  }
  return first;
}

export function isCanonical(html: string): boolean {
  try {
    return canonHtml(html).html === html;
  } catch {
    return false;
  }
}

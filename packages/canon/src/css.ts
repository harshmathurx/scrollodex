import * as csstree from 'css-tree';
import { FONT_LIBRARY } from './limits.js';
import type { Reporter } from './report.js';
import { classifyUrl, validId } from './url.js';

// css-tree's published types lag its runtime; the walk below is typed loosely on purpose.
type N = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CssContext {
  reporter: Reporter;
  imageMap: Record<string, string>;
  imageRefs: Set<string>;
  externalImages: Set<string>;
  dataImages: Map<string, string>; // uri -> mime
  fonts: Set<string>;
  counts: { keyframes: number; filters: number };
}

const DEAD_PSEUDO = new Set([
  'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'checked', 'target', 'target-within', 'visited',
  'link', 'any-link', 'local-link', 'user-invalid', 'user-valid', 'autofill', '-webkit-autofill', 'indeterminate',
  'placeholder-shown', 'popover-open', 'modal', 'open', 'closed', 'default', 'enabled', 'disabled', 'read-write',
  'read-only', 'required', 'optional', 'valid', 'invalid', 'in-range', 'out-of-range', 'playing', 'paused',
  'current', 'past', 'future', 'fullscreen', 'picture-in-picture', 'drop', 'state',
]);
const DENIED_PROPS = new Set(['behavior', '-moz-binding', '-webkit-binding', '-ms-behavior', 'src', 'unicode-range']);
const DANGEROUS_TOKENS = ['expression(', 'javascript:', 'vbscript:', 'livescript:', 'mocha:', 'attr(', 'binding', 'behavior', '@import'];
const BANNED_FUNCTIONS = new Set(['element', '-moz-element', 'paint', 'image', 'src', 'url-prefix', 'expression', 'attr']);
/** Functions whose string arguments are image URLs; allowed only when every one is a card image. */
const IMAGE_FUNCTIONS = new Set(['image-set', '-webkit-image-set', 'cross-fade', '-webkit-cross-fade']);
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
  'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong', 'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);
const MEDIA_FEATURES = new Set(['prefers-color-scheme', 'prefers-reduced-motion', 'orientation']);
const MEDIA_VALUES = new Set(['dark', 'light', 'reduce', 'no-preference', 'portrait', 'landscape']);
const FILTER_PROPS = new Set(['filter', 'backdrop-filter', '-webkit-backdrop-filter', '-webkit-filter']);
const LIBRARY_LOWER = new Map(FONT_LIBRARY.map((f) => [f.toLowerCase(), f] as const));

/** CSS Syntax escape decoding, used only for checks (never for output). */
export function cssUnescape(s: string): string {
  return s.replace(/\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|(\r\n|[\n\r\f])|([\s\S]))/g, (_m, hex: string, nl: string, ch: string) => {
    if (hex) {
      const cp = parseInt(hex, 16);
      if (cp === 0 || (cp >= 0xd800 && cp <= 0xdfff) || cp > 0x10ffff) return '�';
      return String.fromCodePoint(cp);
    }
    if (nl) return '';
    return ch ?? '';
  });
}

function squash(s: string): string {
  return cssUnescape(s).toLowerCase().replace(/\/\*[\s\S]*?\*\//g, '').replace(/[\s\u0000-\u001f]+/g, '');
}

const hasEscape = (v: unknown): boolean => typeof v === 'string' && v.includes('\\');

function parse(css: string, context: 'stylesheet' | 'declarationList', ctx: CssContext): N | null {
  let errors = 0;
  let ast: N;
  try {
    ast = csstree.parse(css, {
      context,
      parseValue: true,
      parseCustomProperty: true,
      parseAtrulePrelude: true,
      parseRulePrelude: true,
      onParseError: () => {
        errors++;
      },
    } as N);
  } catch {
    ctx.reporter.removed('css.parse_error');
    return null;
  }
  if (errors) ctx.reporter.removed('css.parse_error');
  return ast;
}

function listFilter(list: N, keep: (node: N) => boolean): void {
  if (!list) return;
  const drop: N[] = [];
  list.forEach((node: N, item: N) => {
    if (!keep(node)) drop.push(item);
  });
  for (const item of drop) list.remove(item);
}

function mediaAllowed(prelude: N): boolean {
  const raw = csstree.generate(prelude);
  if (raw.includes('\\')) return false;
  const t = raw.toLowerCase().trim();
  if (!t) return false;
  for (const q of t.split(',')) {
    const rest = q.replace(/\(\s*([a-z-]+)\s*:\s*([a-z-]+)\s*\)/g, (_m, f: string, v: string) =>
      MEDIA_FEATURES.has(f) && MEDIA_VALUES.has(v) ? ' ' : ' \u0000 ',
    );
    if (rest.includes('\u0000')) return false;
    const words = rest.split(/\s+/).filter(Boolean);
    if (!words.every((w) => w === 'and' || w === 'only' || w === 'not' || w === 'all' || w === 'screen')) return false;
  }
  return true;
}

/** Selectors may not use backslash escapes anywhere, and id selectors must use the plain id form. */
function selectorClean(prelude: N): boolean {
  let ok = true;
  csstree.walk(prelude, (node: N) => {
    if (hasEscape(node.name) || hasEscape(node.value)) ok = false;
    if (node.name && typeof node.name === 'object' && (hasEscape(node.name.name) || hasEscape(node.name.value))) ok = false;
    if (node.value && typeof node.value === 'object' && (hasEscape(node.value.name) || hasEscape(node.value.value))) ok = false;
    if (node.type === 'IdSelector' && !validId(String(node.name))) ok = false;
    if (node.type === 'Raw') ok = false;
  });
  return ok;
}

function selectorDead(prelude: N): boolean {
  let dead = false;
  csstree.walk(prelude, (node: N) => {
    if (node.type === 'PseudoClassSelector' && DEAD_PSEUDO.has(String(node.name).toLowerCase())) dead = true;
  });
  return dead;
}

function collectFonts(prop: string, value: N, ctx: CssContext): void {
  if (prop !== 'font-family' && prop !== 'font') return;
  const text = csstree.generate(value);
  let families: string[];
  if (prop === 'font-family') families = text.split(',');
  else {
    const lower = text.toLowerCase();
    families = [];
    for (const [l, f] of LIBRARY_LOWER) if (lower.includes(l)) families.push(f);
  }
  for (const raw of families) {
    const name = raw.trim().replace(/^["']|["']$/g, '').trim();
    if (!name) continue;
    const lib = LIBRARY_LOWER.get(name.toLowerCase());
    if (lib) ctx.fonts.add(lib);
    else if (prop === 'font-family' && !GENERIC_FAMILIES.has(name.toLowerCase())) ctx.reporter.warn('font.not_in_library', name);
  }
}

type UrlVerdict = { ok: true; ref: string } | { ok: false; code: string };

function checkImageUrl(original: string, ctx: CssContext, allowFragment: boolean): UrlVerdict {
  const mapped = ctx.imageMap[original] ?? ctx.imageMap[original.trim()];
  const cls = classifyUrl(mapped ?? original, allowFragment);
  switch (cls.kind) {
    case 'image':
      ctx.imageRefs.add(cls.ref);
      return { ok: true, ref: cls.ref };
    case 'fragment':
      return { ok: true, ref: '#' + cls.id };
    case 'external':
      ctx.externalImages.add(cls.url);
      return { ok: false, code: 'image.external' };
    case 'data':
      ctx.dataImages.set(cls.uri, cls.mime);
      return { ok: false, code: 'image.data' };
    case 'missing':
      return { ok: false, code: 'image.missing' };
    default:
      return { ok: false, code: 'css.url' };
  }
}

/** Returns false when the declaration must be dropped. Mutates it in place when rewriting. */
function sanitizeDeclaration(decl: N, ctx: CssContext): boolean {
  const rawProp = String(decl.property);
  if (hasEscape(rawProp)) {
    ctx.reporter.removed('css.dangerous', rawProp);
    return false;
  }
  const prop = rawProp.toLowerCase();
  if (!/^(?:--[a-z0-9_-]{1,64}|-?[a-z][a-z0-9-]{0,63})$/.test(prop) || DENIED_PROPS.has(prop)) {
    ctx.reporter.removed('css.dangerous', prop);
    return false;
  }
  if (!prop.startsWith('--') && !(csstree.lexer as unknown as { getProperty(n: string): unknown }).getProperty(prop)) {
    ctx.reporter.removed('css.unknown_property', prop);
    return false;
  }
  decl.property = prop;
  const value = decl.value;
  if (!value) return false;
  if (value.type === 'Raw') {
    const raw = String(value.value ?? '');
    const sq = squash(raw);
    // Unparsed values survive only when plainly inert: no escapes, quotes, urls or banned functions.
    const inert = /^[a-z0-9#.,%()+*/_-]*$/.test(sq) && !raw.includes('\\');
    const fnNames = [...sq.matchAll(/([a-z-]+)\(/g)].map((m) => m[1]!);
    if (
      !sq ||
      !inert ||
      sq.includes('url(') ||
      DANGEROUS_TOKENS.some((t) => sq.includes(t)) ||
      fnNames.some((f) => BANNED_FUNCTIONS.has(f) || IMAGE_FUNCTIONS.has(f))
    ) {
      ctx.reporter.removed('css.parse_error', raw);
      return false;
    }
    return true;
  }
  const sq = squash(csstree.generate(value));
  if (DANGEROUS_TOKENS.some((t) => sq.includes(t))) {
    ctx.reporter.removed('css.dangerous', prop);
    return false;
  }
  let drop: string | null = null;
  csstree.walk(value, (node: N) => {
    if (drop) return;
    if ((node.type === 'Identifier' || node.type === 'Function') && hasEscape(node.name)) drop = 'css.dangerous';
    else if (node.type === 'Dimension' && hasEscape(node.unit)) drop = 'css.dangerous';
    else if (node.type === 'Hash' && hasEscape(node.value)) drop = 'css.dangerous';
    else if (node.type === 'Raw') {
      const r = squash(String(node.value ?? ''));
      if (r.includes('url(') || String(node.value).includes('\\') || DANGEROUS_TOKENS.some((t) => r.includes(t))) drop = 'css.dangerous';
    } else if (node.type === 'Function') {
      const fn = String(node.name).toLowerCase();
      if (BANNED_FUNCTIONS.has(fn)) drop = 'css.function';
      else if (IMAGE_FUNCTIONS.has(fn)) {
        node.children?.forEach((arg: N) => {
          if (drop || arg.type !== 'String') return;
          const v = checkImageUrl(String(arg.value), ctx, false);
          if (v.ok) arg.value = v.ref;
          else drop = v.code;
        });
      }
    } else if (node.type === 'Url') {
      const v = checkImageUrl(String(node.value), ctx, true);
      if (v.ok) node.value = v.ref;
      else drop = v.code;
    }
  });
  if (drop) {
    ctx.reporter.removed(drop, prop);
    return false;
  }
  if (prop === 'position') {
    const v = squash(csstree.generate(value));
    if (v === 'fixed' || v === 'sticky' || v === '-webkit-sticky') {
      decl.value = csstree.parse('absolute', { context: 'value' } as N);
      ctx.reporter.rewritten('css.position');
    }
  }
  if (prop === 'animation-play-state' && decl.important) {
    decl.important = false;
    ctx.reporter.rewritten('css.important');
  }
  if (FILTER_PROPS.has(prop)) ctx.counts.filters++;
  collectFonts(prop, value, ctx);
  return true;
}

function sanitizeBlock(block: N, ctx: CssContext, inKeyframes: boolean): void {
  if (!block || !block.children) return;
  listFilter(block.children, (node: N) => {
    switch (node.type) {
      case 'Declaration':
        return sanitizeDeclaration(node, ctx);
      case 'Rule':
        return sanitizeRule(node, ctx, inKeyframes);
      case 'Atrule':
        return inKeyframes ? false : sanitizeAtrule(node, ctx);
      default:
        return false;
    }
  });
}

function sanitizeRule(rule: N, ctx: CssContext, inKeyframes: boolean): boolean {
  const prelude = rule.prelude;
  if (!prelude || prelude.type !== 'SelectorList') {
    ctx.reporter.removed('css.parse_error');
    return false;
  }
  if (inKeyframes) {
    const text = csstree.generate(prelude).toLowerCase();
    if (!/^(?:(?:from|to|\d{1,3}(?:\.\d+)?%),?)+$/.test(text)) {
      ctx.reporter.removed('css.parse_error', text);
      return false;
    }
  } else {
    if (!selectorClean(prelude)) {
      ctx.reporter.removed('css.parse_error', csstree.generate(prelude));
      return false;
    }
    if (selectorDead(prelude)) {
      ctx.reporter.removed('css.dead_selector', csstree.generate(prelude));
      return false;
    }
  }
  sanitizeBlock(rule.block, ctx, false);
  return !!rule.block && !rule.block.children.isEmpty;
}

function sanitizeAtrule(at: N, ctx: CssContext): boolean {
  if (hasEscape(at.name)) {
    ctx.reporter.removed('css.at_rule', '@' + String(at.name));
    return false;
  }
  const name = String(at.name).toLowerCase();
  const preludeText = at.prelude ? csstree.generate(at.prelude) : '';
  switch (name) {
    case 'keyframes':
    case '-webkit-keyframes': {
      if (!/^-?[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(preludeText) || !at.block) {
        ctx.reporter.removed('css.at_rule', '@' + name);
        return false;
      }
      at.name = 'keyframes';
      ctx.counts.keyframes++;
      sanitizeBlock(at.block, ctx, true);
      return true;
    }
    case 'media':
      if (!at.prelude || !mediaAllowed(at.prelude) || !at.block) {
        ctx.reporter.removed('css.media');
        return false;
      }
      sanitizeBlock(at.block, ctx, false);
      return !at.block.children.isEmpty;
    case 'supports':
    case 'container': {
      const pre = squash(preludeText);
      if (!at.block || preludeText.includes('\\') || /url\(|@|expression|javascript|image-set|attr\(|selector\(|src\(/.test(pre)) {
        ctx.reporter.removed('css.at_rule', '@' + name);
        return false;
      }
      sanitizeBlock(at.block, ctx, false);
      return !at.block.children.isEmpty;
    }
    case 'property': {
      if (!/^--[a-zA-Z0-9_-]{1,64}$/.test(preludeText) || !at.block) {
        ctx.reporter.removed('css.at_rule', '@' + name);
        return false;
      }
      listFilter(at.block.children, (node: N) => {
        if (node.type !== 'Declaration') return false;
        const p = String(node.property).toLowerCase();
        if (p !== 'syntax' && p !== 'inherits' && p !== 'initial-value') return false;
        return sanitizeDeclaration(node, ctx);
      });
      return true;
    }
    case 'import':
      ctx.reporter.removed('css.import');
      return false;
    case 'font-face':
      ctx.reporter.removed('css.font_face');
      return false;
    default:
      ctx.reporter.removed('css.at_rule', '@' + name);
      return false;
  }
}

/** Keep `<` out of <style> contents entirely so the text can never close the element. */
function guard(css: string): string {
  return css.includes('<') ? css.replace(/</g, '\\3c ') : css;
}

export function sanitizeStylesheet(css: string, ctx: CssContext): string {
  const ast = parse(css, 'stylesheet', ctx);
  if (!ast) return '';
  listFilter(ast.children, (node: N) => {
    if (node.type === 'Rule') return sanitizeRule(node, ctx, false);
    if (node.type === 'Atrule') return sanitizeAtrule(node, ctx);
    return false;
  });
  return guard(csstree.generate(ast));
}

export function sanitizeInlineStyle(css: string, ctx: CssContext): string {
  const ast = parse(css, 'declarationList', ctx);
  if (!ast) return '';
  listFilter(ast.children, (node: N) => node.type === 'Declaration' && sanitizeDeclaration(node, ctx));
  return csstree.generate(ast);
}

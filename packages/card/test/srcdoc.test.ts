import { describe, expect, it } from 'vitest';
import { CARD_CSP, canonHtml } from '@scrollodex/canon';
import { buildSrcdoc, SrcdocError } from '../src/srcdoc';
import type { VerifiedBundle } from '../src/types';

const bundle = (html: string, extra: Partial<VerifiedBundle> = {}): VerifiedBundle => ({
  digest: 'd'.repeat(64), handle: 'mika', displayName: 'Mika', html, images: {},
  meta: { orientation: 'landscape', finish: 'gloss', fonts: [] }, ...extra,
});

const NASTY = [
  '<script>alert(1)</script><p>hi</p>',
  '<img src=x onerror=alert(1)>',
  '<a href="javascript:alert(1)">x</a>',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
  '<svg><script>alert(1)</script><foreignObject><div onclick=1></div></foreignObject></svg>',
  '<style>@import url(https://evil.example/x.css);body{background:url(https://evil.example/p.png)}</style>',
  '<form action="https://evil.example"><input name=q></form>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<base href="https://evil.example/"><link rel=stylesheet href=//evil.example>',
];

describe('buildSrcdoc', () => {
  it('puts the CSP meta first in <head>', () => {
    const doc = buildSrcdoc(bundle(canonHtml('<p>hi</p>').html), 'front');
    const d = new DOMParser().parseFromString(doc, 'text/html');
    const first = d.head.firstElementChild!;
    expect(first.tagName).toBe('META');
    expect(first.getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(first.getAttribute('content')).toBe(CARD_CSP);
  });

  it('never emits script for canonical output of hostile input', () => {
    for (const n of NASTY) {
      const doc = buildSrcdoc(bundle(canonHtml(n).html), 'front');
      expect(doc).not.toMatch(/<script/i);
      const d = new DOMParser().parseFromString(doc, 'text/html');
      expect(d.querySelectorAll('script,iframe,object,embed,form,base,link,noscript').length).toBe(0);
      for (const node of d.querySelectorAll('*')) {
        for (const a of node.attributes) {
          expect(a.name).not.toMatch(/^on/i);
          if (/^(?:href|src|srcset|xlink:href|action)$/i.test(a.name)) expect(a.value).not.toMatch(/^\s*(?:javascript|vbscript):/i);
        }
      }
    }
  });

  it('does not mistake inert attribute text for a handler', () => {
    const doc = buildSrcdoc(bundle('<p title="&lt;img src=x onerror=alert(1)&gt; javascript:">x</p>'), 'front');
    expect(doc).toContain('<p title=');
  });

  it('refuses to build a frame from active content that skipped canon', () => {
    expect(() => buildSrcdoc(bundle('<p>x</p><script>alert(1)</script>'), 'front')).toThrow(SrcdocError);
    expect(() => buildSrcdoc(bundle('<img src=x onerror=alert(1)>'), 'front')).toThrow(SrcdocError);
    expect(() => buildSrcdoc(bundle('<img src="x" onerror="alert(1)">'), 'front')).toThrow(SrcdocError);
    expect(() => buildSrcdoc(bundle('<span style="background:url(javascript:alert(1))">x</span>'), 'front')).toThrow(SrcdocError);
  });

  it('marks only the back face, and drops an author data-face', () => {
    const html = '<!doctype html><html data-face="back" lang="en"><head></head><body><p>x</p></body></html>';
    expect(buildSrcdoc(bundle(html), 'front')).toMatch(/^<!doctype html><html lang="en"><head>/);
    expect(buildSrcdoc(bundle(html), 'back')).toMatch(/^<!doctype html><html lang="en" data-face="back"><head>/);
  });

  it('inlines verified images and library fonts after the CSP, before author styles', () => {
    const img = 'images/0123456789ab.webp';
    const uri = 'data:image/webp;base64,UklGRg==';
    const font = 'data:font/woff2;base64,d09GMg==';
    const html = `<!doctype html><html><head><style>p{font-family:"Caveat"}</style></head><body><img src="${img}" alt=""></body></html>`;
    const doc = buildSrcdoc(bundle(html, { images: { [img]: uri }, meta: { orientation: 'landscape', finish: 'gloss', fonts: ['Caveat'] } }), 'front', { Caveat: font });
    expect(doc).toContain(`src="${uri}"`);
    const ff = doc.indexOf('@font-face');
    expect(ff).toBeGreaterThan(doc.indexOf('Content-Security-Policy'));
    expect(ff).toBeLessThan(doc.indexOf('p{font-family'));
  });

  it('ignores image and font values that are not data: URIs', () => {
    const img = 'images/0123456789ab.webp';
    const doc = buildSrcdoc(bundle(`<img src="${img}">`, { images: { [img]: 'https://evil.example/x.webp' }, meta: { orientation: 'landscape', finish: 'gloss', fonts: ['Caveat'] } }), 'front', { Caveat: 'https://evil.example/f.woff2' });
    expect(doc).not.toContain('evil.example');
  });

  it('turns animation off in still mode', () => {
    expect(buildSrcdoc(bundle('<p>x</p>'), 'front', {}, { still: true })).toContain('animation:none!important');
  });

  it('sizes portrait cards 400×700', () => {
    const doc = buildSrcdoc(bundle('<p>x</p>', { meta: { orientation: 'portrait', finish: 'matte', fonts: [] } }), 'front');
    expect(doc).toContain('width:400px;height:700px');
  });
});

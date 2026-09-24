export type Lock = 1 | 2 | 3 | 4 | 5;

export interface ReportItem {
  code: string;
  message: string;
  count: number;
  lock: Lock;
  sample?: string;
}

export interface SanitizeReport {
  removed: ReportItem[];
  rewritten: ReportItem[];
  warnings: ReportItem[];
  bytesIn: number;
  bytesOut: number;
}

type Bucket = 'removed' | 'rewritten' | 'warnings';

const MESSAGES: Record<string, (n: number) => string> = {
  'element.script': (n) => `Removed ${plural(n, 'script')}. Cards don't run code; your animations still work.`,
  'element.style_in_svg': (n) => `Removed ${plural(n, 'style block')} inside SVG. Style SVG from the card's main CSS.`,
  'element.iframe': (n) => `Removed ${plural(n, 'embedded frame')}. A card can't contain other pages.`,
  'element.form': (n) => `Removed ${plural(n, 'form control')}. Cards can't take input.`,
  'element.media': (n) => `Removed ${plural(n, 'audio or video element')}. Cards are silent pictures.`,
  'element.link': (n) => `Removed ${plural(n, '<link> tag')}. Paste styles into the card directly.`,
  'element.meta': (n) => `Removed ${plural(n, '<meta> tag')}. Only scrollodex:* meta tags are kept.`,
  'element.base': (n) => `Removed ${plural(n, '<base> tag')}.`,
  'element.dropped': (n) => `Removed ${plural(n, 'element')} that cards can't use.`,
  'element.unwrapped': (n) => `Simplified ${plural(n, 'element')} to plain containers (the text is kept).`,
  'element.foreign': (n) => `Removed ${plural(n, 'MathML or unknown-namespace element')}.`,
  'svg.dropped': (n) => `Removed ${plural(n, 'SVG element')} that can reference or run things (use, image, animate, foreignObject).`,
  'attr.handler': (n) => `Removed ${plural(n, 'event handler')} (like onclick or onerror).`,
  'attr.dropped': (n) => `Removed ${plural(n, 'attribute')} cards don't support.`,
  'attr.data_face': (n) => `Removed ${plural(n, 'data-face attribute')}; the app sets that one.`,
  'attr.id_invalid': (n) => `Removed ${plural(n, 'id')} that didn't match the allowed pattern.`,
  'attr.href': (n) => `Removed ${plural(n, 'link target')}.`,
  'link.to_span': (n) => `Turned ${plural(n, 'link')} into plain text. Your links live in your contact and show up under the card.`,
  'image.external': (n) => `Removed ${plural(n, 'external image')}. Import it to keep a copy inside your card.`,
  'image.data': (n) => `Pulled ${plural(n, 'embedded image')} out to be re-encoded.`,
  'image.missing': (n) => `Removed ${plural(n, 'image reference')} to files that aren't in the card.`,
  'image.bad_url': (n) => `Removed ${plural(n, 'image URL')} that wasn't allowed.`,
  'css.at_rule': (n) => `Removed ${plural(n, 'CSS at-rule')} (like @import) that cards can't use.`,
  'css.import': (n) => `Removed ${plural(n, '@import')}. Paste the CSS in directly.`,
  'css.font_face': (n) => `Removed ${plural(n, '@font-face rule')}. Pick a family from the Scrollodex font library instead.`,
  'css.media': (n) => `Removed ${plural(n, '@media block')} with conditions cards don't support.`,
  'css.dangerous': (n) => `Removed ${plural(n, 'CSS declaration')} that could run or load something.`,
  'css.url': (n) => `Removed ${plural(n, 'CSS url()')} pointing outside the card.`,
  'css.function': (n) => `Removed ${plural(n, 'CSS declaration')} using image functions cards don't support (image-set, cross-fade, element).`,
  'css.dead_selector': (n) => `Removed ${plural(n, 'CSS rule')} for hover, focus or clicks. Cards don't receive touches; the app handles those.`,
  'css.parse_error': (n) => `Removed ${plural(n, 'piece')} of CSS that couldn't be read.`,
  'css.position': (n) => `Changed position: fixed/sticky to absolute in ${plural(n, 'place')}.`,
  'css.important': (n) => `Removed !important from ${plural(n, 'animation-play-state declaration')}; the app pauses animations off-screen.`,
  'meta.invalid': (n) => `Removed ${plural(n, 'scrollodex meta tag')} with an unsupported value.`,
  'font.not_in_library': (n) => `${plural(n, 'font family', 'font families')} aren't in the Scrollodex font library and will fall back.`,
  'public.phone': () => `Heads up: a phone number appears in the card art, where anyone can see it. Put it in your contact instead.`,
  'public.email': () => `Heads up: an email address appears in the card art, where anyone can see it. Put it in your contact instead.`,
  'comment.removed': (n) => `Removed ${plural(n, 'comment')}.`,
};

function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many ?? one + 's'}`;
}

export class Reporter {
  private items = new Map<string, { bucket: Bucket; code: string; count: number; lock: Lock; sample?: string }>();

  add(bucket: Bucket, code: string, sample?: string, lock: Lock = 1): void {
    const key = bucket + '|' + code;
    const cur = this.items.get(key);
    if (cur) {
      cur.count++;
      return;
    }
    const entry: { bucket: Bucket; code: string; count: number; lock: Lock; sample?: string } = { bucket, code, count: 1, lock };
    if (sample !== undefined) entry.sample = clip(sample);
    this.items.set(key, entry);
  }

  removed(code: string, sample?: string): void {
    this.add('removed', code, sample);
  }
  rewritten(code: string, sample?: string): void {
    this.add('rewritten', code, sample);
  }
  warn(code: string, sample?: string): void {
    this.add('warnings', code, sample);
  }

  build(bytesIn: number, bytesOut: number): SanitizeReport {
    const out: SanitizeReport = { removed: [], rewritten: [], warnings: [], bytesIn, bytesOut };
    for (const it of this.items.values()) {
      const msg = MESSAGES[it.code] ?? MESSAGES[it.code.split(':')[0] ?? ''];
      const item: ReportItem = {
        code: it.code,
        message: msg ? msg(it.count) : `${it.code} (${it.count})`,
        count: it.count,
        lock: it.lock,
      };
      if (it.sample !== undefined) item.sample = it.sample;
      out[it.bucket].push(item);
    }
    return out;
  }
}

function clip(s: string): string {
  const t = s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return t.length > 80 ? t.slice(0, 77) + '...' : t;
}

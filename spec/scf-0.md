# Scrollodex Card Format, version 0 (SCF-0)

> Licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). You may implement, copy and adapt this spec with attribution. "Scrollodex" is a trademark. Implementations may say "compatible with the Scrollodex Card Format" but may not call themselves Scrollodex.

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

A **card** is a small signed bundle with two parts: a static piece of art (`card.html` plus optional `images/`) and a private contact record (`contact.json`). The art is public. The contact is never published: the bundle carries only a salted commitment to it (§7). A **host** is any program that renders cards: the Scrollodex apps, the web viewer, or `scrollodex dev`. **`canon()`** is the canonicalization pipeline (sanitize, minify, serialize) in §6, implemented by `canonHtml` in `@scrollodex/canon`. Everything a host renders has passed through it.

A card does nothing. It is a picture made of HTML and CSS. No script runs in a card document, not even the host's. A card has no links, no forms, no input and no network. Everything that moves in response to the viewer (tilt, flip, glare, foil) is drawn by the host outside the card (§4).

The reference implementation is `@scrollodex/canon` (canonicalization, contact validation, digest, signatures, pointers) and `@scrollodex/card` (verification and rendering), with canon version `CANON_VERSION = 1`. Where a rule below is stated as a constant or pattern, it is the value in that code.

## 1. Bundle

### 1.1 Layout

Authoring form (what a creator hands to the publisher):

```
card.html      REQUIRED. HTML and CSS; inline <style> and style="" are allowed. ≤ 51,200 bytes.
contact.json   REQUIRED. The contact record (§3). Stays private.
images/        OPTIONAL. PNG, JPEG or WebP files the card references by any name.
```

Published form (what the registry stores and hosts fetch):

```
card.html                 canonical bytes: canon(uploaded card.html)
images/<sha256-12>.webp   re-encoded images (§6.6); author file names are discarded
```

- A published path matches `^(?:card\.html|images\/[0-9a-f]{12}\.(?:webp|png))$` (`FILE_PATH_RE`). `<sha256-12>` is the first 12 lowercase hex characters of the SHA-256 of the image's bytes (`imageName`). The grammar also admits `.png`, which is the name `imageName` gives to PNG bytes; the registry publishes only `.webp`, because it re-encodes every image to WebP.
- `canon()` rewrites every image reference in the HTML to its published name.
- The contact is not a file of the published bundle. The registry keeps the validated contact and its salt privately and releases them only in a full-scope redeem (§9.3).
- Published files are immutable and content-addressed: the registry stores them at `cards/<digest>/<path>` and never overwrites them.

### 1.2 Limits

| Limit | Value |
|---|---|
| `card.html` as uploaded | ≤ 51,200 bytes of UTF-8 (50 KB, `LIMITS.htmlUploadBytes`). Larger uploads are rejected (`html.too_large`), never truncated. |
| Images referenced by the card | ≤ 6, counting the finish mask (`LIMITS.images`) |
| Each image as uploaded | ≤ 5 MB; PNG, JPEG or WebP by magic bytes; decoded size ≤ 2400 px on each side and ≤ 4,000,000 pixels |
| Each image as published | WebP, longest side ≤ 1600 px (`LIMITS.imageMaxPx`) |
| All images as published | ≤ 307,200 bytes in total (300 KB, `LIMITS.imagesTotalBytes`) |
| Elements (HTML and inline SVG) | ≤ 3,000 (`LIMITS.elements`) |
| Nesting depth | ≤ 48 (`LIMITS.depth`) |
| `@keyframes` rules | ≤ 100 (`LIMITS.keyframes`) |
| `filter`, `backdrop-filter`, `-webkit-filter`, `-webkit-backdrop-filter` declarations | ≤ 20 (`LIMITS.filters`) |

Element, depth, keyframe, filter and image budgets are measured on the canonical output; exceeding one rejects the card. A host MUST refuse a bundle whose `card.html` is over 51,200 bytes, that lists more than 6 images, or whose images total more than 307,200 bytes.

### 1.3 File types

| Path | Content-Type served | Content check |
|---|---|---|
| `card.html` | `text/html` | valid UTF-8; `canon(x) === x` under the canon version it was published with |
| `images/*.webp` | `image/webp` | produced by the re-encoder (§6.6); magic bytes `RIFF….WEBP` |
| `contact.json` | never served as a file | valid per `validateContact` (§3) |

A card loads nothing from the internet. The host inlines verified images and library fonts into the frame document as `data:` URIs (§5); the card's CSP permits nothing else.

## 2. `card.html`

`card.html` is an HTML document. It is laid out in a fixed viewport and shown exactly as its canonical bytes say.

### 2.1 Geometry

The card's viewport is a fixed box in CSS pixels: **700×400 for landscape** (1.75:1, 3.5×2 in) and **400×700 for portrait** (`CARD_SIZE`). The host scales the box to the screen with a CSS transform. Cards MUST lay out for the fixed box.

### 2.2 `scrollodex:*` meta tags

`<meta name="scrollodex:…" content="…">` is the only `<meta>` that survives `canon()`, and only with exactly those two attributes. A `<meta charset>` with no other attribute is dropped silently (the output always carries its own). Every other `<meta>` is removed and reported. For each name the first valid occurrence wins; unknown `scrollodex:` names and invalid values are removed and reported (`meta.invalid`).

| Name | Values | If absent | Meaning |
|---|---|---|---|
| `scrollodex:orientation` | `landscape` \| `portrait` | `landscape` | Viewport box (§2.1) |
| `scrollodex:finish` | `matte` \| `gloss` \| `foil` \| `holo` \| `emboss` | `matte` | The host-drawn surface finish (§4.2) |
| `scrollodex:finish-mask` | `images/<name>` | none: the finish covers the whole card | Limits the finish to the mask's opaque areas (§4.2). Counts toward the 6-image budget. |
| `scrollodex:background` | a CSS colour matching `COLOR_RE` (below) | the host's default | Painted by the host behind the frames and on the fallback face |

`COLOR_RE` is `^(?:#[0-9a-f]{3,8}|[a-z]{3,24}|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\([0-9a-z.,%\s/+-]{1,64}\))$`, case-insensitive: a hex colour of 3 to 8 digits, a bare colour word, or one of those functions. `canon()` stores the value lowercased. `var()`, `url()` and every other function are rejected. The reference host's default is `#f3efe6`.

`canon()` reports the effective values in `meta` (`CardMeta`): `orientation`, `finish` (defaulting to `matte`), `finishMask` and `background` when set, and `fonts` (§2.5). The canonical HTML carries a `scrollodex:*` meta only when the author wrote a valid one.

### 2.3 Faces

- The host renders the same `card.html` twice: once as the front, and once with `data-face="back"` on the root `<html>` element as the back. The two frames sit back-to-back in 3D. The front rendering has no `data-face` attribute.
- Authors put content on the back with `[data-face="back"]` selectors, for example `html[data-face="back"] .front { display: none }`.
- `data-face` is reserved for the host: `canon()` removes it from every element (`attr.data_face`).
- A card whose canonical HTML contains no `[data-face="back"]`-style attribute selector (the pattern `\[\s*data-face\s*[~|^$*]?=\s*["']?back\b`, case-insensitive) flips to the host's own back, drawn by the host.

### 2.4 What a card can use

- **Layout and type:** CSS layout, including grid, flex, container queries (`@container`) and `@supports`.
- **Colour and surface:** gradients, `color-mix()`, `mix-blend-mode`, `filter` and `backdrop-filter` within the budget in §1.2, `clip-path`, and `mask-image` with gradients or card images.
- **Motion:** `@keyframes` animations and transitions that run on their own. Hosts turn them off in still renderings (§4.3).
- **Media:** `<img>`, `<picture>`/`<source>` and CSS `url()`, `image-set()` and `cross-fade()` pointing at card images, plus inline `<svg>` within the SVG subset (§6.2).
- **Scheme:** `@media (prefers-color-scheme: dark|light)`, `(prefers-reduced-motion: reduce|no-preference)` and `(orientation: portrait|landscape)`.
- **Fonts:** Scrollodex font library families (§2.5).

A card cannot use script, links, forms, inputs, interaction pseudo-classes such as `:hover`, `:focus` or `:checked` (the host captures all input), sensors, storage, `@font-face`, `@import`, or anything that loads from outside its bundle.

### 2.5 Font library

Cards set type with the Scrollodex font library: a fixed set of open-licensed families that every host ships. Authors write `font-family: "Bodoni Moda", serif` (or name the family in the `font` shorthand). `canon()` never emits `@font-face`. It records the library families a card names, matched case-insensitively and spelled as below, in `meta.fonts` (sorted), and the host injects those faces as `data:` fonts in its own `<style>` right after the CSP meta (§5.2), so no font request ever leaves the device.

v0 families (normative; `FONT_LIBRARY` in `@scrollodex/canon`): Instrument Serif, Fraunces, Playfair Display, Bodoni Moda, Cormorant, EB Garamond, Libre Caslon Text, Space Grotesk, Syne, Inter, DM Sans, Archivo Black, IBM Plex Mono, JetBrains Mono, VT323, Press Start 2P, Caveat, Pinyon Script.

Every author `@font-face` rule is removed and reported (`css.font_face`). A `font-family` naming any other family is kept, reported as a warning (`font.not_in_library`), and does not render. Generic families (`serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `system-ui`, `ui-serif`, `ui-sans-serif`, `ui-monospace`, `ui-rounded`, `emoji`, `math`, `fangsong`) and CSS-wide keywords are fine.

### 2.6 Authoring guidance (non-normative)

- Put phone numbers and emails in `contact.json`, which stays private. Text in `card.html` is public to anyone with the link. `canon()` warns (`public.phone`, `public.email`) when the card's text or title contains something shaped like either; it does not remove them.
- Links belong in `contact.json`. The host draws them as buttons under the card. An `<a>` in the HTML survives as a plain `<span>`.
- Spot foil is a finish plus a mask: `scrollodex:finish = foil` and a black-and-transparent PNG of the lettering as `scrollodex:finish-mask`.
- A crisp logo or monogram is inline `<svg>`. Photos and textures are images.

## 3. `contact.json`

`contact.json` is the only source for the contact that gets saved, for collection search, for the links under the card, and for the host's contact chrome. Hosts MUST NOT pull identity, contact or link data out of `card.html`. The normative rules are `validateContact` in `@scrollodex/canon`, restated here. [`contact.schema.json`](./contact.schema.json) (JSON Schema 2020-12) describes the same shape for tooling; it cannot express trimming or phone normalization, so where they differ `validateContact` wins.

```json
{
  "name": { "display": "Harsh Mathur", "sort": "Mathur, Harsh", "given": "Harsh", "family": "Mathur" },
  "pronouns": "he/him",
  "title": "Frontend engineer",
  "org": "Independent",
  "phones": [{ "label": "mobile", "value": "+91 98000 00000" }],
  "emails": [{ "label": "personal", "value": "harsh@example.com" }],
  "links": [
    { "label": "Website", "url": "https://harsh.dev" },
    { "label": "Call me", "url": "tel:+919800000000" }
  ],
  "location": "Bengaluru",
  "bio": "I make interfaces that feel like objects.",
  "tags": ["design", "frontend", "cards"],
  "a11y": { "summary": "Bone-white card, raised black serif lettering, a thin rail line under the name." }
}
```

| Field | Req | Rules |
|---|---|---|
| `name.display` | ✓ | 1–80 characters |
| `name.sort` | | ≤ 80. The collection sorts A–Z by this, ignoring case and accents. |
| `name.given`, `name.family` | | ≤ 40 each; used for the platform contact card |
| `pronouns` | | ≤ 30 |
| `title`, `org`, `location` | | ≤ 80 each. `location` is free text; hosts never geocode it. |
| `bio` | | ≤ 280; the only field that may contain a line feed (`\n`) |
| `phones[]` | | ≤ 5 items of `{ "label"?, "value" }`. `label` ≤ 20. `value` ≤ 32 as written; spaces, `(`, `)`, `.` and `-` are stripped, and the result MUST match E.164 `^\+[1-9]\d{6,14}$`. |
| `emails[]` | | ≤ 5 items of `{ "label"?, "value" }`. `label` ≤ 20. `value` ≤ 254: a local part of 1–64 characters from ``A-Z a-z 0-9 . ! # $ % & ' * + / = ? ^ _ ` { \| } ~ -``, then `@`, then two or more dot-separated DNS labels of 1–63 letters, digits or inner hyphens. |
| `links[]` | | ≤ 10 items of `{ "label", "url" }`, both required. `label` ≤ 40. `url` ≤ 2048 and one of: `https:` with a host and no username or password (stored as the URL parser's `href`); `mailto:<address>` with an address as for `emails` and no query; `tel:` whose number, after the same stripping as `phones`, is E.164. |
| `tags[]` | | ≤ 12 items, each ≤ 24 characters, matching `^[\p{L}\p{N}][\p{L}\p{N} _-]{0,23}$` (a letter or digit, then letters, digits, spaces, `_` or `-`). Exact duplicates are dropped. |
| `a11y.summary` | ✓ | 1–300 characters describing the card art, for screen readers and search |
| `remixed_from` | | the 64-hex digest of the card this one remixes. `null` is rejected; omit the key instead. |

Rules that apply to every string:
- It MUST be a JSON string, well-formed UTF-16 (no lone surrogates).
- It MUST NOT contain C0 or C1 control characters, DEL, or the bidi embedding, override and isolate characters U+202A–U+202E and U+2066–U+2069. `bio` alone may contain U+000A.
- It is trimmed of surrounding whitespace. Lengths count code points after trimming. A string that is empty after trimming counts as absent.
- Unknown keys MUST be rejected at every level, including `handle` and `scrollodex`: the handle is bound by the signature (§8), not by the contact.
- An array over its item limit rejects the contact. Arrays that end up empty, and absent optional fields, are omitted from the validated contact.

The **canonical contact** is `jcs(validated contact)` (`canonContact`, §8.2). That is the form committed to (§7) and the form a full-scope redeem returns.

## 4. What the host does

### 4.1 Physics

The host applies motion to the whole card, outside the frames:
- **Tilt:** a 3D rotation of up to 12° per axis, reached at ±25° of device rotation (spring stiffness 170, damping 20, mass 1). Source: the gyroscope where available, otherwise the pointer over the host's input layer.
- **Flip:** spring 200/22/1. The face swap and a light haptic happen at 90°.
- **Input:** a transparent host layer above both frames captures every touch and cursor event, for tilt, swipe-to-flip and tap-to-open. Card frames receive no input.
- Where the platform needs motion permission (iOS Safari), the host page asks.

### 4.2 Finishes

The finish is the card's interactivity. The host draws it in its own layer above the card, driven by the tilt, and clipped by `scrollodex:finish-mask` when one is set (CSS `mask-image` with the mask's verified `data:` URI, or a platform equivalent, using the mask's alpha).

| Finish | What the host draws |
|---|---|
| `matte` | Nothing; soft shadow only |
| `gloss` | A broad specular highlight that slides opposite the tilt |
| `foil` | A metallic sheen: narrow, bright highlight with a warm-to-cool shift |
| `holo` | A rainbow diffraction band whose hue and position follow the tilt |
| `emboss` | A directional light-and-shadow pass on the mask's edges, as if the masked areas were raised |

Finishes MUST respect `prefers-reduced-motion`: the effect follows the tilt at reduced amplitude and never animates on its own.

### 4.3 Lifecycle

1. **loading.** The host paints `scrollodex:background` and loads both frames.
2. **shown.** After the front frame's first `load` event. If it doesn't fire within **1500 ms of the frame first becoming visible**, the host shows the fallback face and keeps loading behind it; a late `load` still brings the card to life. Hosts MUST NOT start that clock at load, because off-screen frames are throttled.
3. **still.** Only one card is live at a time. Every other card in a deck is a still rendering of its front: the same frame document with animations and transitions turned off (§5.2).
4. **killed.** The frames are destroyed and the fallback face is shown. Tilt and flip keep working on the fallback.

The **fallback face** is the host's `bone` face: the display name and `@handle` on the card's `scrollodex:background`.

A frame that fires a second `load` event has navigated, which cannot happen to a canonical card in an empty sandbox. The host MUST destroy it and treat the card as killed.

### 4.4 Watchdog

Where the platform lets it measure these, a host SHOULD kill a card whose render:
- takes more than 5 s of CPU in its first 10 s,
- makes its render process unresponsive, or terminates it, or
- exceeds the host's memory ceiling (SHOULD be ≥ 64 MiB).

A host MUST also kill a card whose digest or handle appears on the signed blocklist (§8.7).

## 5. Rendering

### 5.1 Verify, then build

A host MUST verify a card (§8.7) before building anything from it, and MUST NOT render bytes that failed. Only after verification are the images turned into `data:` URIs of the verified bytes: `data:image/webp;base64,…` (or `image/png` for a `.png` path).

### 5.2 The frame document

The host builds one document per face (`buildSrcdoc`) from the verified canonical HTML:

```
<!doctype html><html{root attrs}[ data-face="back"]><head>
<meta http-equiv="Content-Security-Policy" content="{CARD_CSP}">
[<style>{library @font-face rules}</style>]
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<style>html,body{margin:0;padding:0;width:{W}px;height:{H}px;overflow:hidden}body{position:relative}*,*::before,*::after{cursor:default!important}</style>
{canonical head contents}
[<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>]
</head><body{body attrs}>{canonical body contents}</body></html>
```

(Shown on several lines for reading; the document has no line breaks between these parts.)

- The CSP meta is the first child of `<head>`.
- Library fonts: for each family in `meta.fonts` that the host has as a WOFF2 `data:` URI, the host emits `@font-face{font-family:"<family>";src:url(<data URI>) format("woff2");font-display:block}` in a `<style>` right after the CSP meta, before the author's styles.
- `W×H` is 700×400 or 400×700 by `meta.orientation`.
- Root and body attributes keep only `lang`, `dir`, `class`, `style` and `data-*`, never `data-face` or `on*`. The back face adds `data-face="back"` to `<html>`; that is the only difference between the two faces.
- Every `images/<hash12>.webp` (or `.png`) reference in the head and body is replaced with the verified image's `data:` URI.
- The trailing animation-off `<style>` is added only for still renderings.
- As defence in depth, the builder refuses any document that contains a `script`, `iframe`, `object`, `embed`, `frame`, `frameset`, `base`, `form`, `link` or `portal` tag, an `on*`, `srcdoc` or `formaction` attribute, or a `javascript:` or `vbscript:` URL.

### 5.3 CSP and sandbox

`CARD_CSP` is exported verbatim from `@scrollodex/canon`; no other copy exists:

```
default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; manifest-src 'none'; form-action 'none'; base-uri 'none'
```

The document is rendered in `<iframe sandbox="" allow="" referrerpolicy="no-referrer" csp="{CARD_CSP}" srcdoc="…">`: no sandbox tokens, an opaque origin, no permissions, and the CSP set on the frame as well as in the document where the platform supports the `csp` attribute. The frame is `aria-hidden` and out of the tab order; the host provides the accessible label from `a11y.summary`.

A host MUST render with JavaScript disabled for card content wherever the platform allows it, with no native bridge reachable, no network, and no persistent storage.

## 6. Canonicalization

A registry or host MUST canonicalize with the reference implementation, or with one that produces byte-identical output on the conformance corpus. The reference is `canonHtml` in `@scrollodex/canon`; [architecture doc 10](../architecture/10-sanitizer.md) explains the design.

### 6.1 Pipeline

```
canon(html, imageMap) =
  size check (≤ 51,200 UTF-8 bytes; a leading BOM is dropped)
  → parse (parse5, HTML5 tree construction, scriptingEnabled: false)
  → allowlist walk (elements, attributes, URLs, scrollodex:* meta, title)
  → CSS parse (css-tree) and filter
  → reference rewrite (author image names → images/<sha256-12>.webp, via imageMap)
  → minify (whitespace, comments, CSS)
  → budgets (§1.2)
  → serialize in the fixed shape (§6.5)
  → run the whole pipeline again on the output; reject (canon.unstable) unless identical
```

- The **output** is what gets hashed, signed and served. The input is discarded.
- `canon(canon(x))` equals `canon(x)` byte for byte.
- Every removal and rewrite is recorded in the **sanitize report** (`removed`, `rewritten`, `warnings`, each with a code, a plain-words message and a count, plus `bytesIn` and `bytesOut`), shown to the author.
- `canon()` also returns `meta` (§2.2), `imageRefs` (the published image names the card uses), `externalImages` (removed `https:` image URLs) and `dataImages` (removed `data:` images, for the publisher to extract, §6.6).

### 6.2 Allowlist summary

- **Elements kept:** `main section article aside header footer address h1–h6 p div span br hr blockquote q cite em strong b i u s small mark sub sup abbr time ul ol li dl dt dd img picture source figure figcaption`, with `source` only inside `picture`, and an `img` or `source` with no usable `src`/`srcset` removed entirely. The shell elements `html`, `head`, `body`, `title` (the first one, whitespace-collapsed, trimmed, cut to 120 characters) and `style` are consumed and re-emitted in the fixed shape.
- **Inline SVG:** `svg g defs symbol title desc path rect circle ellipse line polyline polygon text tspan textPath linearGradient radialGradient stop pattern clipPath mask marker filter`, and the `fe*` filter primitives except `feImage`. Inside `text`, only `tspan` and `textPath`; `title` and `desc` keep text only. `<style>` inside SVG is removed.
- **Rewritten:** `<a>` becomes `<span>`, with its text and global attributes kept and `href` removed.
- **Removed with their contents:** `script noscript template iframe frame frameset object embed applet param portal form input button select option optgroup textarea output fieldset legend datalist progress meter canvas audio video track map area base link dialog slot math xmp plaintext listing noembed noframes selectedcontent search`, every other `<meta>`, HTML comments, and every SVG element not listed above (including `use`, `image`, `feImage`, `foreignObject`, `a`, `script`, `animate`, `animateTransform`, `animateMotion`, `set`).
- **Unwrapped** (the tag goes, the children stay): every other HTML element, for example `pre`, `code`, `table`, `nav`, `label`, `details`, `font`, custom elements.
- **Global attributes:** `class` (tokens matching `[A-Za-z0-9_-]{1,64}`; others dropped), `style` (sanitized as CSS), `id`, `title` (≤ 512), `lang`, `dir` (`ltr`/`rtl`/`auto`), `role` (1–4 lowercase words), `aria-[a-z]{1,40}` and `data-[a-z0-9-]{1,40}` (values ≤ 512; `data-face` removed). Per element: `img` `src srcset alt width height sizes`; `source` `srcset sizes media` (media only `(prefers-color-scheme|orientation: …)`); `ol` `start reversed type`; `li` `value`; `time` `datetime`; `<html>` keeps only `lang` and `dir`. `src`/`srcset` may only reference card images. Every `on*` attribute, `href` and every other attribute is removed.
- **`id`** is kept exactly as written when it matches `^[a-z][a-z0-9-]{0,31}$`, and removed otherwise (`attr.id_invalid`). Ids are never prefixed or rewritten. `#id` selectors and `url(#id)` references MUST use a valid id.
- **SVG attributes:** the presentation and geometry attributes of the subset (listed in `SVG_ATTRS`), `class`, `role`, `id` and `aria-*`. No `style=""` on SVG elements. A value containing a backslash, `javascript:`, `expression(` or `data:` is removed; `d` is capped at 32,768 characters; `url()` may only be `url(#id)`; `href`/`xlink:href` survives only on `textPath`, as `#id`.

### 6.3 CSS

- **At-rules kept:** `@keyframes` (and `@-webkit-keyframes`, renamed to `@keyframes`; name `-?[a-zA-Z_][a-zA-Z0-9_-]{0,63}`; steps only `from`, `to` and `N%`; no nested at-rules); `@media` only when every query is built from `(prefers-color-scheme: dark|light)`, `(prefers-reduced-motion: reduce|no-preference)` and `(orientation: portrait|landscape)` joined by `and`, `only`, `not`, `all` or `screen`; `@supports` and `@container` unless the condition mentions `url(`, `@`, `expression`, `javascript`, `image-set`, `attr(`, `selector(` or `src(`; `@property` with a `--name` prelude, keeping only its `syntax`, `inherits` and `initial-value` descriptors that pass the declaration rules below.
- **At-rules removed:** `@font-face`, `@import`, and every other at-rule (`@layer`, `@scope`, `@starting-style`, `@page`, `@namespace`, `@charset`, `@counter-style`, …).
- **Selectors:** a rule whose selector uses an interaction or state pseudo-class (`:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`, `:checked`, `:target`, `:visited`, `:link`, `:any-link`, `:enabled`, `:disabled`, `:valid`, `:invalid`, `:playing`, `:paused`, `:fullscreen`, `:state` and the rest of `DEAD_PSEUDO`) is removed (`css.dead_selector`). A selector with any backslash escape or an invalid `#id` is removed.
- **Properties:** a property must be one css-tree knows, or a custom property `--[a-z0-9_-]{1,64}`; others are removed (`css.unknown_property`). `behavior`, `-moz-binding`, `-webkit-binding`, `-ms-behavior`, `src` and `unicode-range` are always removed. A backslash escape in a property name, identifier, function name, unit or hash removes the declaration.
- **Values:** a declaration is removed if its value (escapes decoded, comments and whitespace removed, lowercased) contains `expression(`, `javascript:`, `vbscript:`, `livescript:`, `mocha:`, `attr(`, `binding`, `behavior` or `@import`; if it calls `element()`, `-moz-element()`, `paint()`, `image()`, `src()`, `url-prefix()`, `expression()` or `attr()`; if a `url()` is anything but a card image or `#id`; or if `image-set()`, `-webkit-image-set()`, `cross-fade()` or `-webkit-cross-fade()` holds anything but card-image strings and resolutions. A custom property whose value holds a scheme-like `word:` or `//`, even inside quotes, is removed.
- **Rewritten:** `position: fixed`, `sticky` and `-webkit-sticky` become `position: absolute`. `!important` on `animation-play-state` is dropped.
- CSS is minified by css-tree's generator. All `<style>` blocks are concatenated in document order into one. Any `<` in the stylesheet is written as `\3c ` so it can never close the element.

### 6.4 Whitespace

- In text, every run of the ASCII whitespace characters tab, line feed, form feed, carriage return and space collapses to one space. Other characters, including U+00A0, are kept.
- The only exception is text inside SVG `text`, `tspan` and `textPath`, which is kept exactly as written.
- Adjacent text is merged first. Whitespace-only text is never deleted: it collapses to a single space and stays, so inline spacing can't change between passes. There is no computed-style reasoning: `pre` is unwrapped and its text collapses like any other, and `white-space: pre` does not bring collapsed spaces back.
- `<title>` text is collapsed the same way, then trimmed.

### 6.5 Serialization

The canonical document has exactly this shape, with no line breaks or indentation of its own:

```
<!doctype html><html[ lang="…"][ dir="…"]><head><meta charset="utf-8">
[<meta name="scrollodex:orientation" content="…">][<meta name="scrollodex:finish" content="…">]
[<meta name="scrollodex:finish-mask" content="…">][<meta name="scrollodex:background" content="…">]
[<title>…</title>][<style>…</style>]</head><body[ attrs]>…</body></html>
```

- Anything else that survives inside the author's `<head>` is visible content and moves to the start of `<body>`.
- Attributes are written in source order, each as `name="value"`, the first occurrence of a name winning.
- Text escapes `&`, `<`, `>` and U+00A0 as `&amp;`, `&lt;`, `&gt;` and `&nbsp;`, and also `=`, `:` and `@` as `&#61;`, `&#58;` and `&#64;`, so no output contains a handler-, scheme- or at-rule-shaped substring. Attribute values escape `&`, `"`, `<`, `>` and U+00A0, and every attribute except `style` also escapes `=`, `:` and `@`.
- Void elements (`br`, `hr`, `img`, `source`) have no end tag. Every other element has one.

### 6.6 Images

Images are re-encoded on the server, one invocation per image (`publish-image`), or inline during `publish-prepare`:
- The input is identified by magic bytes; only PNG, JPEG and WebP are accepted (no GIF, no SVG files). It MUST be 1 byte to 5 MB.
- Dimensions are read from the header before decoding. Over 2400 px on either side or over 4,000,000 pixels is refused (`image.too_large`).
- The image is decoded to pixels, resized so its longest side is at most 1600 px, and encoded as WebP (quality 82). Metadata never survives.
- The name is `images/<first 12 hex of sha256(webp bytes)>.webp`.

In the HTML, the author writes `images/<any name>`, and the publisher maps each name to its published name (`imageMap`) before canonicalizing. A reference to a file that isn't in the bundle is removed (`image.missing`). External `https:` image URLs are removed and listed in `externalImages`; the publisher tells the author to download the image and add it. `data:` image URIs in the HTML are removed from it and returned in `dataImages`; the publisher re-encodes each (while fewer than 6 images are in use), maps it to its published name and canonicalizes again. The total of the published images MUST NOT exceed 307,200 bytes (`images.too_large`).

### 6.7 Host re-check

A host MUST run `canon()` on the verified `card.html` before rendering. If the card was published under the host's own canon version, the output MUST be byte-identical to the bytes received, or the host MUST refuse the card (`verify.canon`). If it was published under an older canon version, the host renders its own fresh canonical output.

## 7. Contact commitment

The contact is private. The published bundle and its digest commit to it without revealing it:

```
salt           = b64u(32 random bytes)                 43 characters, generated by the publishing client
contact_commit = sha256hex(utf8("scrollodex-contact-v0\n" + salt + "\n" + jcs(validated contact)))
```

- `sha256hex` is lowercase hex of SHA-256. `b64u` is base64url without padding. The salt MUST match `^[A-Za-z0-9_-]{43}$`.
- The client generates the salt (`randomSalt`) and sends it with the contact to `publish-prepare` over TLS. The registry stores the validated contact and the salt privately, readable only by the service role.
- `contact_commit` is the `contact` entry of the digest's `files` (§8.3). Without the salt, the commitment reveals nothing, and a raw contact hash is never public.
- The registry returns the contact and salt only in a **full-scope** redeem (§9.3), as `contact_json` (the canonical contact) and `salt`. Public lookups and art-scope redeems never include them.
- A host that receives a contact MUST check that `contact_json` is canonical (`canonContact(JSON.parse(contact_json)) === contact_json`) and that `contact_commit` recomputed from it and the salt equals `files.contact`, or reject it (`verify.contact`). It then validates the contact with `validateContact` before using it.

## 8. Keys, publishing, digest and signature

### 8.1 Device keys

- Each device holds an Ed25519 key pair. The reference app generates a non-extractable WebCrypto Ed25519 key where the platform supports it, and otherwise a `@noble/ed25519` key kept in IndexedDB.
- A signed-in account with a claimed handle registers the key with `account` `{ "action": "register_key", "public_key", "proof", "label"? }`:
  - `public_key` is the raw 32-byte key, base64url (43 characters). It MUST be a valid curve point and not of small order (`isValidPublicKey`).
  - `proof` is the 64-byte Ed25519 signature, base64url, over `utf8("scrollodex-key-v0\n" + user_id + "\n" + public_key)` (`keyProofMessage`), where `user_id` is the account's UUID. The registry verifies it before storing the key.
  - Public keys are unique across the registry. An account has at most 10 unrevoked keys. The registry names each key with a UUID, the `key_id`.
- `{ "action": "revoke_key", "key_id" }` revokes a key. A revoked key can't commit, and versions it signed can't be made current again.

Every signature check uses `verifyEd25519`: strict RFC 8032 verification (`@noble/ed25519` with `zip215: false`), identical in every runtime, rejecting invalid or small-order keys and signatures that aren't 64 bytes.

### 8.2 JCS

`jcs` is RFC 8785 (JSON Canonicalization Scheme) restricted to the values Scrollodex signs: strings (well-formed, no lone surrogates), safe integers, booleans, `null`, arrays and plain objects. Keys sort by UTF-16 code units and there is no whitespace. Anything else throws. Files are hashed as raw bytes, never as decoded text.

### 8.3 Digest

```
files  = { "card.html": sha256hex(card.html bytes),
           "images/<hash12>.webp": sha256hex(image bytes), …,
           "contact": contact_commit }
digest = sha256hex(utf8(jcs({ scf: 0, canon: CANON_VERSION, handle, files })))
```

`scf` is the format major version (`SCF_VERSION = 0`), `canon` the canon version the card was canonicalized with, and `handle` the publishing account's handle. The digest covers the canonical bytes, the canon version, the handle and the contact commitment, so anyone can verify the art without being able to read the contact. The digest names the version everywhere: storage paths, pointers, the blocklist.

### 8.4 Signature

```
message   = utf8("scrollodex-card-v0\n" + digest + "\n" + handle)      signingMessage(digest, handle)
signature = Ed25519.sign(device_private_key, message)                  64 bytes, base64url, 86 characters
```

### 8.5 Two-step publish

1. **`publish-image`** (optional, one call per image): `{ "b64" }` → `{ "name", "b64", "bytes", "width", "height" }`. The registry re-encodes the image (§6.6) and stages it under the caller.
2. **`publish-prepare`**: `{ "html", "contact", "salt", "images": [{ "ref", "name" } | { "ref", "b64" }] }`, at most 6 images. `ref` is the author's image name in the HTML; `name` is a staged `publish-image` result; `b64` is an image to re-encode inline. The registry validates the contact, checks the salt, canonicalizes the HTML (§6), checks every referenced image exists and the 300 KB total, computes `files` and the digest under the caller's handle, and stages the canonical bytes for 30 minutes. It returns `prepare_id`, `handle`, `digest`, `canon_version`, `files`, the canonical `html`, every canonical image as base64url in `images`, `meta`, the sanitize `report`, `contact_json`, `external_images`, `size_bytes`, `html_sha` and `expires_at`.
3. **The client checks, then signs.** It MUST check that `isCanonical(html)`, that every returned file hashes to its entry in `files` and the file lists match, that `files.contact` equals the `contact_commit` it computes from its own contact and salt, and that `bundleDigest` recomputed from those bytes equals `digest`. It signs only on a match, and shows the author a preview rendered from exactly those bytes.
4. **`publish-commit`**: `{ "prepare_id", "key_id", "digest", "signature", "expected_current"? }`. The registry requires an unrevoked key of the caller, verifies the signature over `signingMessage(digest, handle)`, re-reads the staged bytes and re-checks every hash, `isCanonical`, the contact commitment and the digest, uploads the files immutably to `cards/<digest>/`, and then, in one transaction, consumes the prepare, stores the version and the private contact, and moves the account's current card to the digest. With `expected_current`, the move happens only if the current digest still equals it (`current.moved`). It returns `{ "digest", "handle", "url" }`, where `url` is the public card page (§9.2).

Committing a digest the caller already published, with no live prepare, only moves the current card back to that version, and only if the key that signed it is still unrevoked. The author signs what they saw, and what they saw is what everyone else sees.

### 8.6 Worked example

Computed with the reference bundle (`supabase/functions/_shared/canon.js`, canon version 1). The image is the 34-byte 1×1 WebP `UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==` (base64), uploaded as `images/photo.webp`. The key is the RFC 8032 test 1 secret key `9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60`. The salt is 32 bytes of `0x07`.

`card.html` as written (473 bytes):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta name="scrollodex:finish" content="foil">
  <meta name="scrollodex:background" content="#F2EEE3">
  <title>Harsh</title>
  <style>
    .card { font-family: "Bodoni Moda", serif; position: fixed; }
    .card:hover { color: red; }
  </style>
</head>
<body>
  <div class="card" id="front">
    <h1>Harsh   Mathur</h1>
    <a href="https://harsh.dev">harsh.dev</a>
    <img src="images/photo.webp" alt="">
  </div>
</body>
</html>
```

Canonical `card.html` (403 bytes, one line):

```html
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="scrollodex:finish" content="foil"><meta name="scrollodex:background" content="#f2eee3"><title>Harsh</title><style>.card{font-family:"Bodoni Moda",serif;position:absolute}</style></head><body> <div class="card" id="front"> <h1>Harsh Mathur</h1> <span>harsh.dev</span> <img src="images/86be52bdb754.webp" alt=""> </div> </body></html>
```

The report lists the removed `:hover` rule (`css.dead_selector`) and `href` (`attr.href`), and the rewritten `position` (`css.position`) and link (`link.to_span`). `meta` is `{"orientation":"landscape","finish":"foil","fonts":["Bodoni Moda"],"background":"#f2eee3"}`.

The contact as sent, `{"name":{"display":"Harsh Mathur","sort":"Mathur, Harsh"},"title":"Frontend engineer","phones":[{"label":"mobile","value":"+91 98000 00000"}],"emails":[{"value":"harsh@example.com"}],"links":[{"label":"Website","url":"https://harsh.dev"}],"tags":["design","frontend"],"a11y":{"summary":"Bone-white card, black serif lettering, foil name."}}`, gives:

```
jcs(contact)    = {"a11y":{"summary":"Bone-white card, black serif lettering, foil name."},"emails":[{"value":"harsh@example.com"}],"links":[{"label":"Website","url":"https://harsh.dev/"}],"name":{"display":"Harsh Mathur","sort":"Mathur, Harsh"},"phones":[{"label":"mobile","value":"+919800000000"}],"tags":["design","frontend"],"title":"Frontend engineer"}
salt            = BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc
contact_commit  = 5501872dbd48b1f15a5a986d99c5ffb76d6ff4b15778c5a021cd05d103107aa9

card.html       sha256 = 7ff0f087ceec1075a58d02691cf03ac576f6f4cda2a79187ddfcd4f8e2184e5c
image           sha256 = 86be52bdb7547413cafb3ed175a806a798c65de98b40849e0b974c47d187de65
                name   = images/86be52bdb754.webp

jcs(digest input) = {"canon":1,"files":{"card.html":"7ff0f087ceec1075a58d02691cf03ac576f6f4cda2a79187ddfcd4f8e2184e5c","contact":"5501872dbd48b1f15a5a986d99c5ffb76d6ff4b15778c5a021cd05d103107aa9","images/86be52bdb754.webp":"86be52bdb7547413cafb3ed175a806a798c65de98b40849e0b974c47d187de65"},"handle":"harsh","scf":0}
digest          = aff37d6ee0205d6f6aa7b113d090489324657329d7a3c863b1eb6b518bc21375

public_key      = 11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo
message         = "scrollodex-card-v0\naff37d6ee0205d6f6aa7b113d090489324657329d7a3c863b1eb6b518bc21375\nharsh"
signature       = MTQ6MQUTZb19DZ6E2lPIDQ_GD-FZTyn4SY9n_q4mmMX-aWTaFwE7nUIHTCAypVshI0ZX4FHMos6heKLlt_Z3Ag

key proof, for user_id 00000000-0000-4000-8000-000000000001:
message         = "scrollodex-key-v0\n00000000-0000-4000-8000-000000000001\n11qYAYKxCrfVS_7TyWQHOg7hcvPapiMlrwIaaPcHURo"
proof           = iVZ-Vv3HK_0sa5WkAfmArM2Pvi5Y5jeroSPnoz1Qryi5YuhVEifhGIdAox-ewE1wJZ3shciniolgSVTQMxRkAw
```

### 8.7 Verification (hosts)

Given a card record (`handle`, `display_name`, `digest`, `files`, `meta`, `signature`, `public_key`, `canon_version`, and for a full-scope redeem `contact_json` and `salt`), a host MUST, in this order (`verifyAndInline`):
1. Check the record's shape: `digest` is 64 hex; `files` has `card.html`; every other entry is `contact` or a `FILE_PATH_RE` path; every value is 64 hex; at most 6 images (`verify.files`, `verify.size`).
2. Recompute `sha256hex(jcs({ scf: 0, canon: canon_version, handle, files }))` and require it to equal `digest` (`verify.digest`).
3. Verify `signature` over `signingMessage(digest, handle)` with `public_key` using `verifyEd25519` (`verify.signature`). `public_key` is the registered key that signed the version.
4. With a contact, check it as in §7 (`verify.contact`).
5. Fetch every file from `cards/<digest>/<path>` and require its SHA-256 to equal its entry in `files` (`verify.fetch`, `verify.hash`), then check the size limits of §1.2 (`verify.size`).
6. Decode `card.html` as strict UTF-8 and re-canonicalize it (§6.7) (`verify.canon`).
7. Only then inline the images and build the frame documents (§5).

If any step fails, the host renders nothing from the bundle and shows only its own chrome.

The registry never serves a version whose digest or handle is blocklisted, or that isn't live. It also publishes a signed blocklist at `blocklist`: `{ "issued_at", "entries": [{ "digest"?, "handle"? }], "signature" }`, where `signature` is the platform's Ed25519 signature, base64url, over `utf8(jcs({ issued_at, entries }))`. A host SHOULD sync it, verify it with the platform public key, and kill any card it lists (§4.4).

## 9. Handles, public cards and exchange

### 9.1 Handles

- A handle matches `^[a-z0-9_]{2,24}$` (`HANDLE_RE`). An account claims one with `account` `{ "action": "claim_handle", "handle", "display_name" }`; `display_name` is 1–80 characters with no control or bidi-override characters.
- Reserved handles (platform words, roles and common brand names, `RESERVED_HANDLES`) and retired handles can't be claimed.
- **Rename (D32).** A handle can be renamed at most once every 30 days. Renaming re-signs the current card under the new handle. The old handle is retired for good (`retired_handles`) and can never be claimed again, by anyone. `/@old` redirects to `/@new` for 90 days, then reports that the person moved on. Collected copies keep working, because a collection keys by account, not by handle, and show the new handle on their next refresh.
- The signature binds the handle per version (§8.4), so every past version stays verifiable under the handle it was signed with.

### 9.2 Public card

The public card page is `{APP_ORIGIN}/@<handle>`, where `APP_ORIGIN` is the registry's configured app origin (default `https://scrollodex.app`). Its data comes from `public-card`: `GET ?handle=<handle>`, rate-limited to 60 requests a minute per IP and cacheable for 60 seconds. It returns one card record, never a list: `{ "handle", "display_name", "digest", "files", "meta", "signature", "public_key", "canon_version" }`. It never includes the contact.

### 9.3 Exchange

A card changes hands through a single-use **pointer**:

```
token   = b64u(16 random bytes)          22 characters, [A-Za-z0-9_-]{22}
pointer = {APP_ORIGIN}/x/<token>
```

- **Issue** (`exchange-issue`, `POST`, 300 per hour per user). With `{ "handle" }`, any signed-in user, including an anonymous one, gets an **art-scope** token for that handle's public card. With no handle, a non-anonymous owner gets a **full-scope** token for their own current card. The response is `{ "token", "pointer", "expires_at", "scope" }`. A token lives 90 seconds; the registry stores only `sha256hex(token)`.
- **Redeem** (`exchange-redeem`, `POST { "token" }`, 120 per hour per user). A token is single-use across people and idempotent for the same redeemer within its lifetime. The response is the card record of §9.2 plus `"scope"`, and for a full-scope token also `"contact_json"` (the canonical contact) and `"salt"` (§7). An expired token answers `token.expired`, a token someone else redeemed `token.used`, an unknown one `token.unknown`, and a blocked or non-live card `card.blocked`. Token rows are deleted shortly after expiry.
- **Parsing.** A tap, QR code or link carries only a pointer. `parsePointer` accepts a string of at most 96 characters that matches `POINTER_RE`, `^https:\/\/scrollodex\.app\/x\/[A-Za-z0-9_-]{22}$`, and returns the token. A development origin (`http` or `https` on `localhost` or `127.0.0.1`, with an optional port) is accepted only when the caller passes it explicitly as `{ devOrigin }`. Anything else is dropped without further parsing.
- The reference app shows a received card face-down and redeems only when the recipient taps it, so link unfurlers and in-app browsers can't burn the token. It verifies (§8.7) before rendering.

## 10. Versioning

- `scf` in the digest is the format **major** version. Hosts MUST refuse majors they don't know and show chrome only.
- `CANON_VERSION` is the canonicalizer's version. Any change to canonical output bytes bumps it. Each version records the canon version it was published with, the digest binds it, and hosts re-check under it (§6.7).
- Additive changes ship as minor revisions of this document within SCF-0. That covers new optional contact fields, new `scrollodex:*` meta names, new finishes and new font library families. Hosts MUST treat an unknown finish as `gloss` and an unknown meta name as absent.
- A change that loosens `canon()`, the CSP or the sandbox, changes the digest, the contact commitment or the signature, or makes an optional field required is a new major.
- A card published under SCF-0 renders the same in every SCF-0 host that shares its canon version. Allowlists only grow within a major if the conformance corpus proves the addition is safe.

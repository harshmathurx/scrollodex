# Scrollodex card rules (from the code)

Everything here is read from `@scrollodex/canon` (`open/packages/canon/src/`: `limits.ts`, `html.ts`, `css.ts`, `url.ts`, `contact.ts`), canon version 1, format SCF-0. Where the prose spec or the architecture doc disagrees, this file follows the code.

"Removed" means the thing is gone and the author sees it in the cleaner's report. "Rejected" means the whole card is refused until it's fixed.

## Limits (`LIMITS` in `limits.ts`)

| Limit | Value | Over it |
|---|---|---|
| `card.html` as uploaded | 51,200 bytes (50 KB) | rejected, never truncated |
| Images referenced (including the finish mask) | 6 | rejected |
| Images total after re-encode | 307,200 bytes (300 KB) | rejected by the publisher |
| Image longest side | 1600 px (larger images are resized) | resized |
| Elements (HTML + inline SVG) | 3,000 | rejected |
| Nesting depth | 48 | rejected |
| `@keyframes` rules | 100 | rejected |
| `filter` / `backdrop-filter` / `-webkit-filter` / `-webkit-backdrop-filter` declarations | 20 | rejected |

Canvas: 700×400 CSS px (landscape) or 400×700 (portrait). The host scales that box with a transform.

## Meta tags

Only `<meta name="scrollodex:…" content="…">` survives, with exactly those two attributes. A lone `<meta charset="utf-8">` is fine (the output always has one). Every other `<meta>` is removed. If a name appears twice, the first one wins.

| Name | Allowed values | If absent |
|---|---|---|
| `scrollodex:orientation` | `landscape`, `portrait` | `landscape` |
| `scrollodex:finish` | `matte`, `gloss`, `foil`, `holo`, `emboss` | `matte` |
| `scrollodex:finish-mask` | an image in `images/` | no mask: the finish covers the whole card |
| `scrollodex:background` | a CSS colour: `#rgb`…`#rrggbbaa`, a colour name, or `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()`. Use `#rrggbb` to be safe. | host default |

Unknown `scrollodex:` names and invalid values are removed.

## HTML elements (`html.ts`)

**Kept:** `main`, `section`, `article`, `aside`, `header`, `footer`, `address`, `h1`–`h6`, `p`, `div`, `span`, `br`, `hr`, `blockquote`, `q`, `cite`, `em`, `strong`, `b`, `i`, `u`, `s`, `small`, `mark`, `sub`, `sup`, `abbr`, `time`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `img`, `picture`, `source` (inside `picture` only), `figure`, `figcaption`, and inline `svg` (SVG rules below). Plus the document shell: `html`, `head`, `body`, `title` (first one, trimmed to 120 characters), `style`.

**Rewritten:** `a` becomes `span`. Its text stays and `href` is removed. Links belong in `contact.json`.

**Removed with everything inside:** `script`, `noscript`, `template`, `iframe`, `frame`, `frameset`, `object`, `embed`, `applet`, `param`, `portal`, `form`, `input`, `button`, `select`, `option`, `optgroup`, `textarea`, `output`, `fieldset`, `legend`, `datalist`, `progress`, `meter`, `canvas`, `audio`, `video`, `track`, `map`, `area`, `base`, `link`, `dialog`, `slot`, `math`, `xmp`, `plaintext`, `listing`, `noembed`, `noframes`, `selectedcontent`, `search`. HTML comments are removed.

**Unwrapped** (the tag goes, its children stay): every other element, for example `pre`, `code`, `table` and its parts, `nav`, `label`, `details`, `summary`, `font`, `center`, custom elements.

**Whitespace:** every run of whitespace in text collapses to one space, except inside SVG `text`/`tspan`/`textPath`. `white-space: pre` won't bring back collapsed spaces, so lay out with CSS or `<br>`.

**`<img>` without a usable `src`/`srcset`** is removed entirely.

## HTML attributes

**Global** (any kept element, and `body`):

| Attribute | Rule |
|---|---|
| `class` | each token must match `[A-Za-z0-9_-]{1,64}`; other tokens are dropped |
| `style` | parsed as CSS, same rules as `<style>` |
| `id` | must match `^[a-z][a-z0-9-]{0,31}$`, otherwise removed. Kept as written. |
| `title` | ≤ 512 characters |
| `lang` | a language tag like `en` or `hi-IN` |
| `dir` | `ltr`, `rtl`, `auto` |
| `role` | 1–4 lowercase words |
| `aria-*` | name `aria-[a-z]{1,40}`, value ≤ 512 |
| `data-*` | name `data-[a-z0-9-]{1,40}`, value ≤ 512. **`data-face` is reserved for the host and removed.** |

**Per element:**

| Element | Extra attributes |
|---|---|
| `img` | `src`, `srcset` (images only), `alt` (cut to 512), `width`/`height` (digits), `sizes` |
| `source` in `picture` | `srcset`, `sizes`, `media` only as `(prefers-color-scheme: dark\|light)` or `(orientation: …)`; `type` is removed |
| `ol` | `start`, `reversed`, `type` (`1 a A i I`) |
| `li` | `value` |
| `time` | `datetime` |
| `html` | `lang`, `dir` only |

**Always removed:** every `on*` handler, `href` (outside SVG `textPath`), and any attribute not listed.

## Inline SVG

**Kept:** `svg`, `g`, `defs`, `symbol`, `title`, `desc`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `text`, `tspan`, `textPath`, `linearGradient`, `radialGradient`, `stop`, `pattern`, `clipPath`, `mask`, `marker`, `filter`, `feBlend`, `feColorMatrix`, `feComponentTransfer`, `feComposite`, `feConvolveMatrix`, `feDiffuseLighting`, `feDisplacementMap`, `feDistantLight`, `feDropShadow`, `feFlood`, `feFuncA`, `feFuncB`, `feFuncG`, `feFuncR`, `feGaussianBlur`, `feMerge`, `feMergeNode`, `feMorphology`, `feOffset`, `fePointLight`, `feSpecularLighting`, `feSpotLight`, `feTile`, `feTurbulence`.

**Removed:** everything else, including `use`, `image`, `feImage`, `foreignObject`, `a`, `script`, `animate`, `animateTransform`, `animateMotion`, `set`, and `<style>` inside SVG. Inside `text`, only `tspan` and `textPath` survive. `title` and `desc` keep text only.

**Attributes kept:** `d`, `x`, `y`, `x1`, `y1`, `x2`, `y2`, `dx`, `dy`, `width`, `height`, `cx`, `cy`, `r`, `rx`, `ry`, `fx`, `fy`, `fr`, `points`, `transform`, `viewBox`, `preserveAspectRatio`, `fill`, `fill-rule`, `fill-opacity`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stroke-miterlimit`, `stroke-dasharray`, `stroke-dashoffset`, `stroke-opacity`, `opacity`, `offset`, `stop-color`, `stop-opacity`, `gradientUnits`, `gradientTransform`, `spreadMethod`, `patternUnits`, `patternContentUnits`, `patternTransform`, `clip-path`, `clipPathUnits`, `clip-rule`, `mask`, `maskUnits`, `maskContentUnits`, `filter`, `filterUnits`, `primitiveUnits`, `font-family`, `font-size`, `font-weight`, `font-style`, `text-anchor`, `dominant-baseline`, `letter-spacing`, `word-spacing`, `textLength`, `lengthAdjust`, `startOffset`, `class`, `role`, `markerWidth`, `markerHeight`, `refX`, `refY`, `orient`, `markerUnits`, `marker-start`, `marker-mid`, `marker-end`, `paint-order`, `vector-effect`, `visibility`, `display`, `color`, `stdDeviation`, `in`, `in2`, `result`, `operator`, `k1`, `k2`, `k3`, `k4`, `values`, `type`, `tableValues`, `slope`, `intercept`, `amplitude`, `exponent`, `baseFrequency`, `numOctaves`, `seed`, `stitchTiles`, `scale`, `xChannelSelector`, `yChannelSelector`, `radius`, `mode`, `flood-color`, `flood-opacity`, `lighting-color`, `surfaceScale`, `diffuseConstant`, `specularConstant`, `specularExponent`, `kernelMatrix`, `order`, `divisor`, `bias`, `targetX`, `targetY`, `edgeMode`, `kernelUnitLength`, `preserveAlpha`, `azimuth`, `elevation`, `pointsAtX`, `pointsAtY`, `pointsAtZ`, `limitingConeAngle`, `z`, `mix-blend-mode`, plus `id` and `aria-*`.

- **No `style=""` on SVG elements.** Give them a `class` and style it from `<style>`.
- A value is removed if it contains a backslash, `javascript:`, `expression(` or `data:`. `d` is capped at 32,768 characters.
- `url(#id)` may only point at a valid id. `href`/`xlink:href` survives only on `textPath`, as `#id`.

## URLs and images (`url.ts`)

- The only URL a card can hold is one of its own images. In the published card that's `images/<12 hex>.webp` (or `.png`). While authoring, write `images/<your file name>`; the app re-encodes each file and rewrites the reference.
- A reference to a file that isn't in the bundle is removed (`image.missing`).
- External `https:` images are removed from the HTML and listed for the author to download and add themselves.
- `data:` URIs are removed from the HTML (and they eat the 50 KB budget). Put the file in `images/`.
- Accepted files: PNG, JPEG, WebP. Everything is resized to 1600 px on the long side and re-encoded to WebP. Up to 6, 300 KB total after re-encoding.
- In CSS, `url()`, `image-set()` and `cross-fade()` may only name card images. `url(#id)` works for SVG fragments. Anything else drops the declaration.

## CSS at-rules (`css.ts`)

| At-rule | Rule |
|---|---|
| `@keyframes` (and `-webkit-keyframes`, renamed) | kept. Name `-?[a-zA-Z_][a-zA-Z0-9_-]{0,63}`. Steps only `from`, `to`, `N%`. Counts toward the 100 budget. |
| `@media` | kept only when every condition is `(prefers-color-scheme: dark\|light)`, `(prefers-reduced-motion: reduce\|no-preference)` or `(orientation: portrait\|landscape)`, joined by `and`, `only`, `not`, `all`, `screen`. Anything else (`min-width`, `print`, `hover`) drops the whole block. |
| `@supports`, `@container` | kept unless the condition mentions `url(`, `@`, `expression`, `javascript`, `image-set`, `attr(`, `selector(` or `src(` |
| `@property` | the rule survives, but in canon v1 its `syntax`, `inherits` and `initial-value` descriptors are dropped, so it does nothing. Don't rely on it. |
| `@import` | removed |
| `@font-face` | removed. Use the font library. |
| everything else (`@layer`, `@scope`, `@starting-style`, `@page`, `@namespace`, `@charset`, `@counter-style`, …) | removed |

Nested at-rules inside `@keyframes` are removed.

## CSS selectors

- **Dead selectors** (the rule is removed): any selector using `:hover`, `:focus`, `:focus-visible`, `:focus-within`, `:active`, `:checked`, `:target`, `:target-within`, `:visited`, `:link`, `:any-link`, `:local-link`, `:user-invalid`, `:user-valid`, `:autofill`, `:-webkit-autofill`, `:indeterminate`, `:placeholder-shown`, `:popover-open`, `:modal`, `:open`, `:closed`, `:default`, `:enabled`, `:disabled`, `:read-write`, `:read-only`, `:required`, `:optional`, `:valid`, `:invalid`, `:in-range`, `:out-of-range`, `:playing`, `:paused`, `:current`, `:past`, `:future`, `:fullscreen`, `:picture-in-picture`, `:drop`, `:state`. Cards get no input.
- **Fine:** `::before`, `::after`, `:nth-child()`, `:not()`, `:is()`, `:where()`, `:has()`, `:root`, attribute selectors, and `html[data-face="back"]`.
- No backslash escapes anywhere in a selector. `#id` selectors must use a valid id.

## CSS declarations

- **Unknown properties are removed** (`css.unknown_property`). A property must be one css-tree knows, or a custom property `--name` (`--[a-z0-9_-]{1,64}`).
- **Always removed:** `behavior`, `-moz-binding`, `-webkit-binding`, `-ms-behavior`, `src`, `unicode-range`.
- **Banned functions** (the declaration is removed): `element()`, `-moz-element()`, `paint()`, `image()`, `src()`, `url-prefix()`, `expression()`, `attr()`.
- **Banned tokens anywhere in a value:** `expression(`, `javascript:`, `vbscript:`, `livescript:`, `mocha:`, `attr(`, `binding`, `behavior`, `@import`. Also no backslash escapes in property names, identifiers, units or hashes.
- **Custom properties** can't hold anything URL-shaped: a value with a letter-led `word:` or with `//` in it is removed, even inside quotes. `--note: "at 10:30"` and `--x: "a//b"` are removed; `--time: "10:30"` and `--gap: 12px` are fine.
- **Rewritten:** `position: fixed` and `position: sticky` become `position: absolute`. `!important` on `animation-play-state` is dropped.
- Everything else CSS can draw is allowed: grid, flex, container queries, gradients (`linear`, `radial`, `conic`, `repeating-*`), `clip-path`, `mask-image` with gradients or card images, `mix-blend-mode`, `filter`, `backdrop-filter`, transforms, 3D, `animation`, `transition`, `text-wrap`, `color-mix()`, `oklch()`, custom properties.

## Fonts (`FONT_LIBRARY` in `limits.ts`)

Exactly these 18 families, spelled like this:

`Instrument Serif`, `Fraunces`, `Playfair Display`, `Bodoni Moda`, `Cormorant`, `EB Garamond`, `Libre Caslon Text`, `Space Grotesk`, `Syne`, `Inter`, `DM Sans`, `Archivo Black`, `IBM Plex Mono`, `JetBrains Mono`, `VT323`, `Press Start 2P`, `Caveat`, `Pinyon Script`.

- Name them in `font-family` (or the `font` shorthand). Matching ignores case.
- Generic fallbacks are fine: `serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `system-ui`, `ui-serif`, `ui-sans-serif`, `ui-monospace`, `ui-rounded`, `emoji`, `math`, `fangsong`, and the CSS-wide keywords.
- Any other family name (Georgia, Helvetica, Arial…) is kept but warned about, and won't render.

## Faces

- The host renders the same file twice. The back rendering gets `<html data-face="back">`; the front has no `data-face`.
- Style the back with `html[data-face="back"] …` selectors. With no such selector in the CSS, the host shows its own contact back instead.
- You can't set `data-face` yourself: it's removed from every element.

## Public-text warnings

Text in `card.html` is public to anyone with the link. The cleaner warns (`public.phone`, `public.email`) when the card's text or title contains something shaped like a phone number or an email address. It doesn't remove them. Keep them in `contact.json`, which stays private: only someone you hand your card to in person receives it.

## `contact.json` (`contact.ts`)

Unknown keys are rejected at every level. Strings are trimmed; control and bidi-override characters are rejected.

| Field | Required | Rule |
|---|---|---|
| `name.display` | yes | 1–80 characters |
| `name.sort`, `name.given`, `name.family` | | ≤ 80, ≤ 40, ≤ 40 |
| `pronouns` | | ≤ 30 |
| `title`, `org`, `location` | | ≤ 80 each |
| `bio` | | ≤ 280; may contain newlines |
| `phones[]` | | ≤ 5 of `{ "label"?: ≤ 20, "value": E.164 }`. Spaces, dots, dashes and brackets are stripped, then it must match `^\+[1-9]\d{6,14}$`. |
| `emails[]` | | ≤ 5 of `{ "label"?: ≤ 20, "value": an email ≤ 254 }` |
| `links[]` | | ≤ 10 of `{ "label": ≤ 40 (required), "url": ≤ 2048 }`. `https:` without user or password, `mailto:<address>` with no query, or `tel:+<E.164>`. |
| `tags[]` | | ≤ 12, each ≤ 24, starting with a letter or digit and using only letters, digits, spaces, `-` and `_`. Duplicates are dropped. |
| `a11y.summary` | yes | 1–300 characters describing what the card looks like |
| `remixed_from` | | a 64-hex card digest. Leave it out; `null` is rejected. |

The app adds your handle and seals the contact at publish, so don't include `handle` or `scrollodex` keys: they're rejected as unknown.

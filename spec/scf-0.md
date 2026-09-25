> **Build note:** where this document disagrees with `docs/architecture/11-build-contract.md` (sealed contacts, per-digest origins, CDN worker, XChaCha, importer), the build contract is authoritative for v0.

# Scrollodex Card Format, version 0 (SCF-0)

> Licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). You may implement, copy and adapt this spec with attribution. "Scrollodex" is a trademark. Implementations may say "compatible with the Scrollodex Card Format" but may not call themselves Scrollodex.

The key words MUST, MUST NOT, REQUIRED, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

A **card** is a small signed bundle with two parts: a static piece of art (`card.html` plus optional `images/`) and a sealed contact record (`contact.json`). A **host** is any program that renders cards: the Scrollodex apps, the web viewer, or `scrollodex dev`. **`canon()`** is the canonicalization pipeline (sanitize, minify, serialize) described in §6 and in [architecture doc 10](../architecture/10-sanitizer.md). Everything a host renders has passed through it.

A card does nothing. It is a picture made of HTML and CSS. No script runs in a card document, not even the host's. A card has no links, no forms, no input and no network. Everything that moves (tilt, flip, glare, foil) is drawn by the host outside the card (§4).

## 1. Bundle

### 1.1 Layout

Authoring form (what a creator uploads):

```
card.html      REQUIRED. HTML and CSS; inline <style> and style="" are allowed. ≤ 50 KB.
contact.json   REQUIRED. The contact record (§3).
images/        OPTIONAL. Raster images or SVG files the card references.
```

Published form (what the registry stores and hosts fetch):

```
card.html                 canonical bytes: canon(uploaded card.html)
images/<sha256-12>.webp   re-encoded images (§6.4); author file names are discarded
contact.sealed            contact.json encrypted per §7
```

- Paths are relative, `/`-separated, and UTF-8. Uploaded image names are free-form; published names are always `images/[0-9a-f]{12}.webp`, generated from the re-encoded bytes. `canon()` rewrites every reference to match.
- Symlinks, hard links, device files, nested directories and any file outside the layout MUST be rejected.
- For transport, an upload is a ZIP archive (store or deflate only) with the files at the root. Archive metadata is ignored.

### 1.2 Limits

| Limit | Value |
|---|---|
| `card.html` as uploaded | ≤ 51,200 bytes (50 KB). Larger uploads are rejected, never truncated. |
| `contact.json` | ≤ 16,384 bytes |
| Images | ≤ 6 files; each ≤ 5 MB as uploaded; ≤ 300 KB total after re-encoding |
| Upload ZIP | ≤ 32 MB; any entry's compression ratio ≤ 20:1 |

Typical cards shrink 40–60% through `canon()`.

### 1.3 File types

| Path | Content-Type served | Content check |
|---|---|---|
| `card.html` | `text/html; charset=utf-8` | valid UTF-8; `canon(x) === x` |
| `images/*.webp` | `image/webp` | produced by the re-encoder (§6.4); magic bytes `RIFF….WEBP` |
| `contact.sealed` | `application/octet-stream` | §7 envelope |
| `contact.json` | never served | valid UTF-8 JSON; matches [`contact.schema.json`](./contact.schema.json) |

A card loads nothing from the internet. Images come only from the card's own origin. Fonts come only from the Scrollodex font library (§2.5).

## 2. `card.html`

`card.html` is an HTML document. It is laid out in a fixed viewport and shown exactly as its canonical bytes say.

### 2.1 Geometry

The card's viewport is a fixed box in CSS pixels: **700×400 for landscape** (1.75:1, 3.5×2 in) and **400×700 for portrait** (0.5714:1). The host scales the box to the screen with a CSS transform. Cards MUST lay out for the fixed box.

### 2.2 `scrollodex:*` meta tags

`<meta name="scrollodex:…">` is the only `<meta>` that survives `canon()`. Unknown `scrollodex:` names are removed and listed in the sanitize report.

| Name | Values | Default | Meaning |
|---|---|---|---|
| `scrollodex:orientation` | `landscape` \| `portrait` | `landscape` | Viewport box (§2.1) |
| `scrollodex:finish` | `matte` \| `gloss` \| `foil` \| `holo` \| `emboss` | `gloss` | The host-drawn surface finish (§4.2) |
| `scrollodex:finish-mask` | `images/<name>` | none | Limits the finish to the mask's opaque areas (§4.2) |
| `scrollodex:background` | `#rrggbb` | `#f2eee3` | Painted by the host before the frame loads, and around the fallback |

### 2.3 Faces

- The host renders the same `card.html` twice: once as the front, and once served with `<html data-face="back">` as the back. The two frames sit back-to-back in 3D.
- Authors put content on the back with `[data-face="back"]` selectors, for example `html[data-face="back"] .front { display: none }`. The front rendering has no `data-face` attribute.
- A card whose back rendering is visually identical to its front (no back-face rules) flips to the host's own back: the contact chrome drawn from `contact.json`. The editor and `scrollodex dev` state which case applies.

### 2.4 What a card can use

- **Layout and type:** everything in CSS layout, including grid, flex, container queries and `@supports`.
- **Colour and surface:** gradients, `mix-blend-mode`, `filter` and `backdrop-filter` within the budgets in §6.3, `clip-path`, `mask-image` with `images/…` sources.
- **Motion:** `@keyframes` animations and transitions that run on their own. Hosts pause them while the card is off-screen by snapshotting it.
- **Media:** `<img>`, `<picture>`/`<source>` and CSS `url()` pointing at `images/…`, plus inline `<svg>` within the SVG subset (§6.2).
- **Scheme:** `@media (prefers-color-scheme: dark)` follows the host's scheme. `prefers-reduced-motion` follows the device.
- **Fonts:** Scrollodex font library families (§2.5).

A card cannot use script, links, forms, inputs, `:hover` or `:checked` interaction (the host captures all input), sensors, storage, or anything that loads from outside its bundle.

### 2.5 Font library

Cards set type with the Scrollodex font library: a curated set of open-licensed families that every host ships. Authors write `font-family: "Bodoni Moda", serif`. `canon()` never emits `@font-face`; it records the library families a card uses in its metadata, and the host injects those faces as `data:` fonts in its own `<style>` right after the CSP meta, so no font request ever leaves the device.

v0 families (normative; mirrors `FONT_LIBRARY` in `@scrollodex/canon`): Instrument Serif, Fraunces, Playfair Display, Bodoni Moda, Cormorant, EB Garamond, Libre Caslon Text, Space Grotesk, Syne, Inter, DM Sans, Archivo Black, IBM Plex Mono, JetBrains Mono, VT323, Press Start 2P, Caveat, Pinyon Script.

Author font files and `@font-face` rules naming anything else are removed and reported.

### 2.6 Authoring guidance (non-normative)

- Put phone numbers and emails in `contact.json`, which is sealed. Text in `card.html` is public. The editor warns when either appears in the HTML.
- Links belong in `contact.json`. The host draws them as buttons under the card. An `<a>` in the HTML survives as plain text.
- Spot foil is a finish plus a mask: `scrollodex:finish = foil` and a black-and-transparent PNG of the lettering as `scrollodex:finish-mask`.
- A crisp logo or monogram is inline `<svg>`. Photos and textures are images.

## 3. `contact.json`

The normative schema is [`contact.schema.json`](./contact.schema.json) (JSON Schema 2020-12). `contact.json` is the only source for the contact that gets saved, for collection search, for the links under the card, and for the host chrome. Hosts MUST NOT pull identity, contact or link data out of `card.html`.

```json
{
  "scrollodex": "0",
  "handle": "harsh",
  "name": { "display": "Harsh Mathur", "sort": "Mathur, Harsh", "given": "Harsh", "family": "Mathur" },
  "pronouns": "he/him",
  "title": "Frontend engineer",
  "org": "Independent",
  "phones": [{ "label": "mobile", "value": "+919800000000" }],
  "emails": [{ "label": "personal", "value": "harsh@example.com" }],
  "links": [
    { "label": "Website", "url": "https://harsh.dev" },
    { "label": "Call me", "url": "tel:+919800000000" }
  ],
  "location": "Bengaluru",
  "bio": "I make interfaces that feel like objects.",
  "tags": ["design", "frontend", "cards"],
  "a11y": { "summary": "Bone-white card, raised black serif lettering, a thin rail line under the name." },
  "remixed_from": null
}
```

| Field | Req | Rules |
|---|---|---|
| `scrollodex` | ✓ | Format major version. MUST be `"0"`. |
| `handle` | ✓ | `^[a-z0-9_]{2,24}$`. MUST equal the publishing account's handle; bound by the signature (§8). |
| `name.display` | ✓ | 1–80 chars, no control characters |
| `name.sort` | ✓ | 1–80 chars. The collection sorts A–Z by this, ignoring case and accents. |
| `name.given`, `name.family` | | ≤ 60 each; used for the platform contact card |
| `pronouns` | | ≤ 24 |
| `title`, `org` | | ≤ 80 each |
| `phones[]` | | ≤ 4. `value` is E.164 (`^\+[1-9][0-9]{6,14}$`); `label` ≤ 24 |
| `emails[]` | | ≤ 4. `value` ≤ 254, RFC 5322 addr-spec; `label` ≤ 24 |
| `links[]` | | ≤ 12. `label` ≤ 40. `url` is `https:` (no userinfo, no IP-literal host, port 443 only), `mailto:` or `tel:`; ≤ 2048 chars |
| `location` | | ≤ 80, free text. Hosts never geocode it. |
| `bio` | | ≤ 280 |
| `tags[]` | | ≤ 12, each `^[a-z0-9-]{1,24}$` |
| `a11y.summary` | ✓ | 1–280 chars describing the card art, for screen readers and search |
| `remixed_from` | | 64-hex digest of the card this one remixes, or `null` |

Unknown keys MUST be rejected.

## 4. What the host does

### 4.1 Physics

The host applies motion to the whole card, outside the frames:
- **Tilt:** a 3D rotation of up to 12° per axis, reached at ±25° of device rotation (spring stiffness 170, damping 20, mass 1). Source: the gyroscope where available, otherwise the pointer over the host's input layer.
- **Flip:** spring 200/22/1. The face swap and a light haptic happen at 90°.
- **Input:** a transparent host layer above both frames captures every touch and cursor event, for tilt, swipe-to-flip and tap-to-open. Card frames receive no input.
- Where the platform needs motion permission (iOS Safari), the host page asks.

### 4.2 Finishes

The finish is the card's interactivity. The host draws it in its own layer above the card, driven by the tilt, and clipped by `scrollodex:finish-mask` when one is set (CSS `mask-image` or a platform equivalent, using the mask's alpha).

| Finish | What the host draws |
|---|---|
| `matte` | Nothing; soft shadow only |
| `gloss` | A broad specular highlight that slides opposite the tilt |
| `foil` | A metallic sheen: narrow, bright highlight with a warm-to-cool shift |
| `holo` | A rainbow diffraction band whose hue and position follow the tilt |
| `emboss` | A directional light-and-shadow pass on the mask's edges, as if the masked areas were raised |

Finishes MUST respect `prefers-reduced-motion`: the effect follows the tilt at reduced amplitude and never animates on its own.

### 4.3 Lifecycle

```
loading ──load event──▶ shown ◀──visible──▶ snapshot
   │                      │
   └─ 1500 ms after ──────┴─▶ fallback     watchdog ─▶ killed (fallback)
      first visible
```

1. **loading.** The host paints `scrollodex:background` and loads both frames.
2. **shown.** After the front frame's `load` event. If it doesn't fire within **1500 ms of the card first becoming visible**, the host shows the fallback face. Hosts MUST NOT start that clock at load, because off-screen frames are throttled.
3. **snapshot.** Only one card is live at a time. Every other card is a static image of its front, captured after load and refreshed when a new version arrives.
4. **killed.** The watchdog fires (§4.4). The frames are destroyed and the fallback face is shown with a "paused" label. After three kills in a row, the host shows that version only as a snapshot until a new version arrives.

The **fallback face** is the `bone` template, rendered by the host from `contact.json` (name, title, org). Without the contact key (a public web page), it shows the handle and display name from the registry.

A frame that fires a second `load` event has navigated, which cannot happen to a canonical card. The host MUST destroy it, treat the card as killed, and report the digest as a sanitizer bug.

### 4.4 Watchdog

A host MUST kill a card whose render:
- takes more than 5 s of CPU in its first 10 s,
- makes its render process unresponsive, or terminates it, or
- exceeds the host's memory ceiling (SHOULD be ≥ 64 MiB).

## 5. Card document requirements for hosts

A host MUST render `card.html` like this:
1. **Verify first.** Fetch `card.html` and every image, check every hash and the digest, and verify the author's seal (§7) before building anything. Never render bytes that failed.
2. **Inline.** Replace each `images/<hash12>.webp` reference with a `data:` URI of the verified bytes, and inject the library fonts the card uses as `data:` `@font-face` rules in a host `<style>` placed right after the CSP meta.
3. **CSP.** Place this CSP as the first child of `<head>` via `<meta http-equiv="Content-Security-Policy">` (and set the iframe `csp` attribute where supported). It is exported verbatim as `CARD_CSP` from `@scrollodex/canon`:
   ```
   default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:;
   script-src 'none'; connect-src 'none'; frame-src 'none'; child-src 'none';
   worker-src 'none'; object-src 'none'; media-src 'none'; manifest-src 'none';
   form-action 'none'; base-uri 'none'
   ```
4. **Empty sandbox.** Render it in `<iframe sandbox="" srcdoc="…" allow="" referrerpolicy="no-referrer">`: no sandbox tokens, an opaque origin, and no permissions.
5. With JavaScript disabled for card content wherever the platform allows it, no native bridge reachable, no network at all, and no persistent storage.
5. Serving the canonical bytes untouched. The only change a host makes is adding `data-face="back"` to the root element of the back rendering.

## 6. Canonicalization

A registry or host MUST canonicalize with the reference implementation, or with one that produces byte-identical output on the conformance corpus. The normative rules are in [architecture doc 10](../architecture/10-sanitizer.md).

### 6.1 Pipeline

```
canon(html, images) =
  parse (parse5, HTML5 tree construction)
  → allowlist walk (elements, attributes, URLs)
  → CSS parse (css-tree) and filter
  → reference rewrite (images/… → images/<sha256-12>.webp; library @font-face)
  → minify (collapse whitespace, drop comments, minify CSS)
  → serialize
```

- The **output** is what gets hashed, signed and served. The input is discarded.
- `canon(canon(x))` MUST equal `canon(x)` byte for byte.
- Every removal and rewrite is recorded in the **sanitize report**, shown to the author in plain words.

### 6.2 Allowlist summary

- **Elements kept:** `div span p h1–h6 ul ol li dl dt dd br hr strong em b i u s small sub sup mark blockquote q cite abbr time address figure figcaption section header footer main article aside img picture source`, plus inline `svg` limited to shape, text, gradient, filter, pattern, clipPath and mask elements.
- **Rewritten:** `<a>` becomes `<span>`, with its text kept.
- **Everything else is removed**, including `<script>`, every `on*` attribute, `<iframe>`, `<object>`, `<embed>`, `<form>` and every input, `<link>`, `<meta>` other than `scrollodex:*`, `<base>`, `<template>`, `<noscript>`, `<audio>`, `<video>`, and SVG `<script>`, `<foreignObject>`, `<use>`, `<animate>` and `<set>`.
- **Attributes kept:** `class`, `style`, `data-*`, `aria-*`, `role`, `lang`, `dir`, `title`, `alt`, `width`, `height`, and the presentation attributes of the SVG subset. `src`/`srcset` may only reference `images/…`. `id` must match `[a-z][a-z0-9-]{0,31}` and is namespaced on output.

### 6.3 CSS and budgets

- **At-rules kept:** `@keyframes`, `@media` (`prefers-color-scheme`, `prefers-reduced-motion`, `orientation`), `@supports`, `@container`, `@property`, and `@font-face` for library families. Every other at-rule is dropped.
- **Dropped:** `url()` other than `images/…`, `expression()`, `behavior`, `-moz-binding`, `image-set()` with non-local URLs, and anything containing `javascript:`.
- **Rewritten:** `position: fixed` and `sticky` become `absolute`.
- **Budgets:** ≤ 3,000 elements, DOM depth ≤ 48, ≤ 100 `@keyframes`, ≤ 20 `filter`/`backdrop-filter` declarations, ≤ 6 images.

### 6.4 Images

Every image is decoded and re-encoded in an isolated worker: metadata stripped, longest side at most 1600 px, WebP output. SVG files are rasterized at 2× their displayed size, and `data:` URIs in the HTML are extracted into `images/` the same way. External image URLs are either imported by the registry at prepare time (fetched once, server-side, then re-encoded) or removed. A published card never references anything outside its bundle.

### 6.5 Host re-check

A host MUST run `canon()` on `card.html` before rendering. If the output is not byte-identical to the bytes it received, the host MUST refuse the card.

## 7. Sealed contact

`contact.json` is public to nobody by default. It travels as `contact.sealed`:

```
contact.sealed = magic "SLC0"          4 bytes
               ‖ key_id                16 bytes  (random, names the key at the registry)
               ‖ nonce                 24 bytes  (random)
               ‖ ciphertext‖tag        XChaCha20-Poly1305(key, nonce, plaintext, aad)

key         = 32 random bytes, one per card version, generated by the publishing client
plaintext   = utf8(JCS(contact.json))
art_digest  = lowercase_hex(sha256(utf8(JCS({ path: sha256hex(bytes) } for card.html and images/*))))
aad         = utf8("scrollodex-contact-v0\n" + art_digest + "\n" + handle)
```

- The AAD binds the contact to the exact canonical art and handle it was published with. A sealed contact moved onto another card fails to decrypt.
- The client seals only after `publish/prepare` returns the canonical art, because `art_digest` covers canonical bytes.
- The client sends `key` to the registry in `publish/commit`, over TLS. The registry stores it where only the service role can read it, and releases it only in an authenticated token redeem (architecture docs 04 and 05).
- After decrypting, hosts MUST validate the plaintext against `contact.schema.json` and check that `handle` matches the signed handle.

## 8. Publishing, digest and signature

### 8.1 Two-step publish

1. **`publish/prepare`**: the client uploads the authoring bundle. The registry imports external images the author approved, re-encodes every image, runs `canon()`, and returns the canonical `card.html`, the generated `images/*` and the sanitize report.
2. The client shows the author a preview rendered from exactly those bytes, seals `contact.json` against them (§7), computes the digest and signs it.
3. **`publish/commit`**: the client sends the digest, signature, `contact.sealed` and the contact key. The registry checks that the digest covers bytes byte-identical to what `prepare` produced, verifies the signature and the seal, then stores the version.

The author signs what they saw, and what they saw is what everyone else sees.

### 8.2 Digest

```
files    = the published bundle (§1.1): card.html, images/*, contact.sealed
manifest = { path: lowercase_hex(sha256(bytes)) for path in files }
digest   = lowercase_hex(sha256(utf8(JCS(manifest))))
```

JCS is RFC 8785 (JSON Canonicalization Scheme): keys are sorted by UTF-16 code units, with no whitespace. The digest covers **canonical** bytes and the **ciphertext** of the contact, so anyone can verify a bundle without being able to read the contact. The **short digest**, `digest[0:32]` (128 bits), names the card's origin: `https://<short>.cards.scrollodex.app/`.

### 8.3 Signature

```
message   = utf8("scrollodex-card-v0\n" + digest + "\n" + handle)
signature = Ed25519.sign(private_key, message)          // 64 bytes, base64url without padding
key_id    = lowercase_hex(sha256(public_key_raw_32_bytes))[0:16]
```

### 8.4 Worked example

```
card.html                canonical bytes → sha256 = 41ab…07
images/9f2ce1a04b7d.webp re-encoded      → sha256 = 9f2c…e1
contact.sealed           bytes           → sha256 = c0de…5a

JCS(manifest) = {"card.html":"41ab…07","contact.sealed":"c0de…5a","images/9f2ce1a04b7d.webp":"9f2c…e1"}
digest        = 7b1d4a90c3e2f1a8b6d5c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3
short         = 7b1d4a90c3e2f1a8b6d5c4e3f2a1b0c9
origin        = https://7b1d4a90c3e2f1a8b6d5c4e3f2a1b0c9.cards.scrollodex.app/
message       = "scrollodex-card-v0\n7b1d4a90…f4a3\nharsh"
signature     = "q8Zr…" (86 base64url characters)
```

### 8.5 Verification (hosts)

Before rendering, a host MUST:
1. Recompute the digest from the bytes it holds and compare it with the expected digest (from the registry or the exchange response).
2. Verify the signature against a key the registry lists as active for that handle at publish time.
3. Check the signed blocklist. Blocked digests and handles render as tombstones.
4. Re-run `canon()` and require byte-identical output (§6.5).
5. If the host holds the contact key, decrypt and validate `contact.sealed` (§7).

If step 1, 2 or 4 fails, the host renders nothing from the bundle and shows only its chrome, marked "couldn't verify".

## 9. Versioning

- `scrollodex` is the format **major** version. Hosts MUST refuse majors they don't know and show chrome only.
- Additive changes ship as minor revisions of this document and keep `scrollodex: "0"`. That covers new optional contact fields, new `scrollodex:*` meta names, new finishes and new font library families. Hosts MUST treat an unknown finish as `gloss` and an unknown meta name as absent.
- A change that loosens `canon()`, the CSP or the sandbox, changes the digest, signature or sealing, or makes an optional field required is a new major.
- A card published under SCF-0 renders the same in every SCF-0 host, forever. Allowlists only grow within a major if the conformance corpus proves the addition is safe.

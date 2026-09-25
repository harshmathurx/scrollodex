---
name: scrollodex-card
description: Design a one-of-a-kind Scrollodex card (a static HTML/CSS business card that tilts, flips and shines in the Scrollodex app) for the user, and hand them a folder that passes the Scrollodex cleaner untouched. Use when the user says "make my Scrollodex card", "design my card", "design a business card", "redo my scrollodex", "scrollodex card", "card.html", or mentions Scrollodex at all.
---

# Scrollodex card

A Scrollodex card is a 700×400 (or 400×700) piece of static HTML and CSS. The person hands it over with a tap, and it lands in someone else's deck, where it tilts, flips and catches the light. The app draws all of that motion. The card only has to be a picture of who they are.

Your job: design a card that only this person could have, then hand them a folder that the cleaner accepts without removing anything.

**Nobody should end up with a template card.** There is no house style and no upper bound on creativity. Receipts, star charts, pressed flowers, a vinyl record, a boarding pass, a lab notebook, a tarot card, a circuit board, a seed packet: if HTML and CSS can draw it, it can be a card. Go wild inside the guardrails below. The guardrails are about safety, not taste.

Files in this skill:
- `reference/rules.md`: everything the cleaner keeps, rewrites and removes, read from the code.
- `reference/checklist.md`: the pre-flight list.
- `reference/starter/`: a small, canonical card (`card.html`, its readable source `card.source.html`, and `contact.json`). Use it to learn the shape, not as a look to copy.
- The real gallery lives in `examples/cards/` of the `scrollodex` repo: twelve cards from `bone` to `arcade`.

## 1. The mindset: interview, then design

Before you write a line, ask briefly (one message, five or six questions, and accept short answers):
1. **Who are you?** Name as it should appear, and what you do, in their words.
2. **Your work.** What do you make, fix, run or care about? One thing you're proud of.
3. **Your taste.** Three adjectives for how the card should feel. Things you love (a magazine, a label, a place, an era) and things you can't stand.
4. **Colour.** Colours you love, colours you hate, and any brand colours.
5. **Assets.** A logo, a signature, a photo or a texture, if they want one. Vector logos become inline SVG.
6. **Contact.** Which phone, email and links should people save? (These go in `contact.json`, never in the art.)

Then design something that could not belong to anyone else:
- Find the one idea. A florist's card might be a seed packet; a backend engineer's might be a man page; a chef's might be a receipt from their own kitchen. Pick the object, the material or the joke that is theirs.
- Commit hard. One strong idea, executed with care, beats five decorations.
- If they ask for options, offer **2–3 directions that really differ** (for example "letterpress calm", "neon arcade", "field-notebook sketch"), each in one sentence plus its type and palette. Build the one they pick.
- Use their words. A line they said in the interview beats any tagline you could invent.

## 2. The hard rules

The cleaner (`canon()`) enforces these at publish. Break one and that part is removed, or the card is refused. Full detail in `reference/rules.md`.

| Rule | Detail |
|---|---|
| One file of art | A single `card.html` with inline `<style>` and `style=""`. Plus `contact.json`, plus optional `images/`. |
| Zero script | `<script>`, `on*=` handlers, `javascript:` and anything scripted are stripped. Nothing runs in a card, ever. |
| No links | `<a>` becomes a plain `<span>`. Links live in `contact.json`; the app draws them as buttons under the card. |
| No outside anything | No external URLs, no web fonts, no `@import`, no `@font-face`, no `<link>`. External images are removed. |
| Library fonts only | `Instrument Serif`, `Fraunces`, `Playfair Display`, `Bodoni Moda`, `Cormorant`, `EB Garamond`, `Libre Caslon Text`, `Space Grotesk`, `Syne`, `Inter`, `DM Sans`, `Archivo Black`, `IBM Plex Mono`, `JetBrains Mono`, `VT323`, `Press Start 2P`, `Caveat`, `Pinyon Script`. Fall back only to generics (`serif`, `sans-serif`, `monospace`, `cursive`, `system-ui`). |
| Images | Bundled in `images/`, at most 6 (the finish mask counts), PNG, JPEG or WebP, 1600 px max on the long side, about 300 KB total after the app re-encodes them to WebP. Reference them as `images/<file>`. **Prefer inline `<svg>`** for marks, logos and illustration. No `data:` URIs. |
| Size | `card.html` at most 51,200 bytes (50 KB). |
| Canvas | 700×400 CSS px (`landscape`) or 400×700 (`portrait`). Lay out in px for that exact box. |
| Back face | The host renders the file twice and adds `data-face="back"` to `<html>` on the back. Style it with `html[data-face="back"] …`. Never set `data-face` yourself; it's removed. |
| Meta tags | `scrollodex:orientation` = `landscape` \| `portrait` (default `landscape`). `scrollodex:finish` = `matte` \| `gloss` \| `foil` \| `holo` \| `emboss` (default `matte`). `scrollodex:finish-mask` = `images/<file>`. `scrollodex:background` = a colour, ideally `#rrggbb`. Every other `<meta>` is removed. |
| No interaction | `:hover`, `:focus`, `:active`, `:checked`, `:target` and friends are dropped. Cards receive no input: the host owns every touch. |
| Motion | `@keyframes` and transitions that run by themselves are fine, within budgets: 3,000 elements, depth 48, 100 `@keyframes`, 20 `filter`/`backdrop-filter` declarations. |
| No fixed positioning | `position: fixed` and `sticky` are rewritten to `absolute`. |
| ids | Must match `^[a-z][a-z0-9-]{0,31}$` or they're removed. |
| Unknown CSS | Unknown properties are dropped. `@media` only for `prefers-color-scheme`, `prefers-reduced-motion`, `orientation`. |
| SVG | No `<use>`, `<image>`, `<foreignObject>`, SMIL, or `style=""` on SVG elements (use classes). Animate SVG with CSS. |

## 3. What's ideal

Allowed is not the same as good. Aim for all of these:
- **The name in the top 26%.** In the deck, cards stack as strips showing only their top edge. Keep the name inside the top 104 px (landscape) or 182 px (portrait).
- **Legible at 358 px wide.** Phones show the card at about half size. Nothing meant to be read under 20 px on the 700 px canvas; the name 44 px or more.
- **A back that adds something.** Not the front again: what they're working on now, a quote they live by, a map of their city, the recipe, the manifesto. No back rules at all means the host draws a plain contact back; choose that on purpose, not by accident.
- **One finish, used with intent.** `emboss` for letterpress and raised type, `foil` for a metallic accent, `holo` for iridescence, `gloss` for lacquer or glass, `matte` for paper. The host draws it over the card as it tilts; don't paint your own glare.
- **A mask for spot foil.** `scrollodex:finish-mask` points at a PNG: opaque where the finish shows, transparent elsewhere. Foil on just the monogram beats foil on everything.
- **Designed at rest.** Decks show a still snapshot with animation turned off. The un-animated state must be the finished design.
- **Slow, subtle motion.** Loops of 6 s or more, small travel, `steps()` for mechanical things (cursors, flip-dots). Always add `@media (prefers-reduced-motion: reduce)` to stop it.
- **Both system themes.** Plan light and dark with `@media (prefers-color-scheme: dark)` and CSS custom properties, or make the card look deliberately the same in both.
- **Accessible contrast.** 4.5:1 for small text and 3:1 for large display type, in both themes. Give SVG `role="img"` and an `aria-label`, and images an `alt`.
- **Real type.** Pair at most two or three library families. Set letter-spacing and line-height on purpose.

## 4. contact.json

The details people save. It stays private: nobody sees it until the person hands their card over in person. Unknown keys are rejected. `name.display` and `a11y.summary` are required.

```json
{
  "name": { "display": "Asha Verma", "given": "Asha", "family": "Verma", "sort": "Verma, Asha" },
  "pronouns": "she/her",
  "title": "Type designer",
  "org": "Studio Verma",
  "phones": [{ "label": "mobile", "value": "+919800000000" }],
  "emails": [{ "label": "studio", "value": "asha@studioverma.example" }],
  "links": [{ "label": "Specimens", "url": "https://studioverma.example" }],
  "location": "Bengaluru",
  "bio": "Draws Devanagari and Latin display faces, mostly from shop signs.",
  "tags": ["type design", "devanagari", "lettering"],
  "a11y": { "summary": "A warm paper card with the name in a heavy serif at the top left and a small orange sun on a thin orbit at the bottom right. The back says what she is drawing now." }
}
```

- Limits: `name.display` ≤ 80, `title`/`org`/`location` ≤ 80, `pronouns` ≤ 30, `bio` ≤ 280, `a11y.summary` ≤ 300. Up to 5 phones, 5 emails, 10 links, 12 tags.
- Phones are E.164 (`+` country code, then digits). Links are `https:`, `mailto:` or `tel:+…`, each with a `label`.
- `a11y.summary` describes what the card **looks like**, front and back, for screen readers and search.
- Don't add `handle`, `scrollodex` or `remixed_from: null`; they're rejected. The app adds the handle.
- Use only details the person gave you. Never invent a phone number or email.

## 5. Workflow

1. **Write the files.** A folder named for the person, containing `card.html`, `contact.json` and, if needed, `images/`. Write readable HTML; the app minifies it. Start from `reference/starter/card.source.html` if it helps with structure.
2. **Self-check against the rules.** Walk `reference/checklist.md`. Grep your own output for `<script`, ` on`, `<a `, `http`, `@import`, `@font-face`, `:hover`, `position: fixed`, `data:` and any font name not in the library.
3. **Run the canonical check, if you can.** In a checkout of the `scrollodex` repo (paths below are from its root):
   ```sh
   cd packages/canon && npm install
   npx esbuild src/index.ts --bundle --format=esm --platform=neutral --main-fields=module,main \
     --alias:css-tree=./node_modules/css-tree/dist/csstree.esm.js --outfile=/tmp/canon.mjs
   CARD=/path/to/card-folder node --input-type=module -e '
     import { readFileSync } from "node:fs";
     const c = await import("/tmp/canon.mjs"), d = process.env.CARD;
     const r = c.canonHtml(readFileSync(d + "/card.html", "utf8"));
     console.log({ removed: r.report.removed, rewritten: r.report.rewritten, warnings: r.report.warnings, meta: r.meta });
     console.log(c.validateContact(JSON.parse(readFileSync(d + "/contact.json", "utf8"))));'
   ```
   Aim for empty `removed` and `rewritten` (except `image.missing` for `images/<file>` refs, which the app maps when you drop the whole folder), no warnings, and `ok: true`. Without the repo, check by hand against `reference/rules.md`.
4. **Look at it.** Open `card.html` in a browser at 700×400. For the back, copy it and add `data-face="back"` to `<html>`. Check it in dark mode too.
5. **Hand the folder over** (`card.html`, `contact.json`, `images/`), with a line on the idea behind it and the finish you chose.
6. **They bring it in.** In Scrollodex: **Make → Bring it from your agent**, then paste the HTML or drop the folder.
7. **They publish.** The app shows what it cleaned, if anything. They preview, then **hold to seal**. Later edits publish with a tap.

When you talk to the person, say "seal" and "sealed", never "sign", "verify", "digest" or "canonical".

## 6. Anti-patterns

- **The Canva-template look:** name centered, title below, logo top-left, thin border. If it could be anyone's card, start over.
- **Generic gradients:** purple-to-blue meshes, glassmorphism blobs, "aurora" backgrounds with no reason to be there.
- **Stock phrases:** "Passionate about innovation", "Crafting digital experiences", "Let's connect". Use their words.
- **Walls of text:** a card isn't a CV. A name, a line, one idea. The rest goes in `contact.json` or on the back.
- **A tiny name,** or a name below the fold where the deck strip can't show it.
- **Relying on hover or tap:** there is no input. Anything that only happens on hover never happens.
- **Phone numbers or emails in the art.** Card text is public to anyone with the link, while `contact.json` stays private. Putting a number in the HTML publishes it.
- **Fake finishes:** painting your own glare or rainbow sheen, which fights the host's finish as the card tilts.
- **Frantic motion:** fast loops, big bounces, many things moving at once.
- **Web-font habits:** Georgia or Helvetica fallbacks, `@import` from Google Fonts. They're removed or won't render.

## 7. Prompt bank

Seeds to start from. Twist each one until it's theirs.
1. A seed packet: botanical illustration on the front, "sowing instructions" for working with them on the back.
2. A man page for a person: `NAME`, `SYNOPSIS`, `BUGS`, in IBM Plex Mono.
3. A boarding pass from their hometown to where they live now.
4. A receipt from their own shop, itemizing what they're good at.
5. A tarot card that names their craft: "The Cartographer", "The Debugger".
6. A letterpress wedding-invite calm, set in Bodoni Moda, with a foil monogram mask.
7. A flip-dot departure board spelling their name, clicking into place with `steps()`.
8. A lab notebook page: graph-paper grid, a hand-drawn diagram in SVG, a Caveat margin note.
9. A pressed specimen label from a natural-history museum, with a Latin binomial for their job.
10. A cassette J-card with their "tracklist" of projects.
11. A topographic map of their favourite place, with contour lines drifting slowly.
12. A matchbook from a bar that only exists in their head.
13. A pixel-art character select screen, with their stats in Press Start 2P.
14. A postage stamp with perforated edges and a cancellation mark dated the day you met them.
15. A blueprint of something they built, with white linework on cyanotype blue and dimension callouts.

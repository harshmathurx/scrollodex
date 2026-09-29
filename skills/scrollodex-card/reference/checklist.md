# Pre-flight checklist

Run through this before you hand the folder over. Every "must" is enforced by the cleaner; every "should" is taste, and the person's card is worse without it.

## The folder

- [ ] One folder named for the person (`asha-verma-card/`), holding exactly `card.html`, `contact.json` and, if needed, `images/`. No subfolders inside `images/`, nothing else at the top.
- [ ] `contact.json` is there, even if it only has a name, one way to reach them and `a11y.summary`.
- [ ] `card.html` is under 51,200 bytes (`wc -c card.html`).
- [ ] At most 6 images, each PNG, JPEG or WebP, 1600 px or less on the long side, about 300 KB total. The finish mask counts as one.
- [ ] Every `images/…` reference in the HTML names a file that's actually in `images/`.

## card.html must

- [ ] Have `<meta name="scrollodex:orientation">` set to `landscape` (700×400) or `portrait` (400×700), and lay out for exactly that box.
- [ ] Have `<meta name="scrollodex:finish">` set to one of `matte`, `gloss`, `foil`, `holo`, `emboss`.
- [ ] Have `<meta name="scrollodex:background">` as a `#rrggbb` close to the card's main colour.
- [ ] Contain no `<script>`, no `on*=` attributes, no `<a>`, no forms or inputs, no `<iframe>`/`<video>`/`<audio>`/`<canvas>`, no `<link>`.
- [ ] Contain no `http://`, `https://` or `data:` URLs in `src`, `srcset`, `url()` or meta content, and no `@import` or `@font-face`.
- [ ] Use only library fonts: Instrument Serif, Fraunces, Playfair Display, Bodoni Moda, Cormorant, EB Garamond, Libre Caslon Text, Space Grotesk, Syne, Inter, DM Sans, Archivo Black, IBM Plex Mono, JetBrains Mono, VT323, Press Start 2P, Caveat, Pinyon Script. Fallbacks are generic keywords only (`serif`, `sans-serif`, `monospace`, `cursive`, `system-ui`…), never Georgia or Helvetica.
- [ ] Have no `:hover`, `:focus`, `:active`, `:checked` or `:target` rules.
- [ ] Have no `@media` except `prefers-color-scheme`, `prefers-reduced-motion` and `orientation`.
- [ ] Have no `position: fixed` or `sticky` (they become `absolute`; just write `absolute`).
- [ ] Use ids only if they match `^[a-z][a-z0-9-]{0,31}$`.
- [ ] Put no `style=""` on SVG elements (use a class), and no `<use>`, `<image>`, `<foreignObject>` or SMIL (`<animate>`, `<set>`).
- [ ] Stay under 3,000 elements, 48 levels deep, 100 `@keyframes`, 20 `filter`/`backdrop-filter` declarations.
- [ ] Not rely on runs of spaces or `white-space: pre`: whitespace collapses to one space outside SVG text.
- [ ] Contain no phone number or email address in the visible text or `<title>`.
- [ ] Not try to set `data-face` on any element.

## card.html should

- [ ] Put the name in the top 26% of the card (the top 104 px of a landscape card, 182 px of a portrait one), so it reads in the deck strip.
- [ ] Read at 358 px wide, about half size: nothing important smaller than 20 px on the 700 px canvas, the name 44 px or larger.
- [ ] Have a back (`html[data-face="back"] …`) that adds something the front doesn't say. No back rules means the host draws its own contact back, which is fine, but on purpose.
- [ ] Use one finish, chosen because of the design. For spot foil, holo lettering or raised emboss, pair it with a `scrollodex:finish-mask` image.
- [ ] Asked about motion; the card moves (subtly) unless they said no.
- [ ] Look finished when still. Decks show a snapshot with animation off, so the un-animated state is the design.
- [ ] Move slowly if it moves (loops of 6 s or more, small amplitude), with a `prefers-reduced-motion: reduce` block that stops it.
- [ ] Work in both schemes via `@media (prefers-color-scheme: dark)`, or look deliberately the same in both.
- [ ] Reach 4.5:1 contrast for body text and 3:1 for the name and large display type, in both schemes.
- [ ] Give meaningful SVG `role="img"` and an `aria-label`, and images an `alt`.

## contact.json

- [ ] `name.display` (1–80) and `a11y.summary` (1–300, describing what the card looks like) are present.
- [ ] Only these keys: `name`, `pronouns`, `title`, `org`, `phones`, `emails`, `links`, `location`, `bio`, `tags`, `a11y`, `remixed_from`. No `handle`, no `scrollodex`, no `remixed_from: null`.
- [ ] Phones are `+<country code><number>` (E.164). At most 5 phones, 5 emails, 10 links, 12 tags.
- [ ] Links are `https:`, `mailto:` or `tel:+…`, each with a `label`.
- [ ] The details are the person's real ones, confirmed with them. Never invent a phone number or email.

## Before you hand it over

- [ ] Run the canonical check (see SKILL.md) or walk this list by hand.
- [ ] Look at it: open `card.html` in a browser at 700×400, then add `data-face="back"` to `<html>` in a scratch copy to see the back.
- [ ] Ask yourself: could this card belong to anyone else? If yes, it isn't done.
- [ ] Hand over the folder, or its `.zip` if the chat takes one file. Never `card.html` alone.

# Scrollodex, open

*Hand someone your card again.*

Scrollodex brings back the business card: yours, designed by you or your agent, handed over with a tap. This repository holds everything open about it:
- the card format
- the sanitizer that makes cards safe
- the renderer that makes them feel physical
- a gallery of example cards

The app and service live at [scrollodex.app](https://scrollodex.app). There are no ads and no tracking, and nobody learns who looked at their card.

## The format in 60 seconds

A card is a folder:

```
card.html      one static HTML file with inline CSS. At most 50 KB.
contact.json   the details people save: name, phones, emails, links.
images/        up to 6 images, re-encoded to WebP by the publisher.
```

- **A card can do nothing.** Scripts, links, forms, external URLs and author fonts are removed at publish, and the author gets a plain-language report of what was taken out.
- **The host does the rest:**
  - it tilts and flips the card, and draws a finish on top: `matte`, `gloss`, `foil`, `holo` or `emboss`, optionally clipped by a mask like spot foil
  - it renders the back from the same HTML with `<html data-face="back">`
- **Meta tags** set the rest: `scrollodex:orientation`, `scrollodex:finish`, `scrollodex:finish-mask` and `scrollodex:background`.
- **Every card is signed and content-addressed.** Hosts verify every hash and the author's Ed25519 signature, then render the bytes in an `<iframe sandbox="">` with a CSP that allows no script and no network.

The full spec is [`spec/scf-0.md`](spec/scf-0.md), and [`spec/contact.schema.json`](spec/contact.schema.json) describes `contact.json`.

## Packages

| Package | What it does |
|---|---|
| [`@scrollodex/canon`](packages/canon) | Sanitizer, minifier, canonical digest, contact validation, Ed25519 verification. Pure TypeScript; runs the same in browsers, Node and Deno. |
| [`@scrollodex/card`](packages/card) | The card renderer: sandboxed frames, spring physics, finishes, the Rolodex deck, verify-and-inline. No framework. |

`canon` is tested against a corpus of more than 200 injection vectors, property-based fuzzing for idempotence, and golden canonical bytes.

## Examples

[`examples/cards/`](examples/cards) has the launch gallery: twelve cards from `bone` to `arcade`, each canonical and zero-script. Copy one and make it yours.

## License

- Code (`packages/`, `examples/`): Apache License 2.0. See [LICENSE](LICENSE).
- The Scrollodex Card Format spec (`spec/`): CC-BY-4.0.
- "Scrollodex" and its mark are not licensed. Implement the format freely, but please don't call your fork Scrollodex.

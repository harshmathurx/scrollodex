import { CanonError } from './errors.js';
import { jcs } from './jcs.js';
import { sha256hex } from './crypto.js';

export interface Contact {
  name: { display: string; sort?: string; given?: string; family?: string };
  pronouns?: string;
  title?: string;
  org?: string;
  phones?: { label?: string; value: string }[];
  emails?: { label?: string; value: string }[];
  links?: { label: string; url: string }[];
  location?: string;
  bio?: string;
  tags?: string[];
  a11y: { summary: string };
  remixed_from?: string;
}

// C0/C1 controls, DEL, and bidi embedding/override/isolate characters.
const BAD_CHARS = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const BAD_CHARS_BIO = /[\u0000-\u0009\u000b-\u001f\u007f-\u009f‪-‮⁦-⁩]/;
const E164 = /^\+[1-9]\d{6,14}$/;
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
const TAG = /^[\p{L}\p{N}][\p{L}\p{N} _-]{0,23}$/u;

type Errs = string[];

function str(errs: Errs, path: string, v: unknown, max: number, opts: { required?: boolean; bio?: boolean } = {}): string | undefined {
  if (v === undefined || v === null) {
    if (opts.required) errs.push(`${path} is required`);
    return undefined;
  }
  if (typeof v !== 'string') {
    errs.push(`${path} must be a string`);
    return undefined;
  }
  if (!v.isWellFormed()) {
    errs.push(`${path} contains a broken character`);
    return undefined;
  }
  if ((opts.bio ? BAD_CHARS_BIO : BAD_CHARS).test(v)) {
    errs.push(`${path} contains control or direction-override characters`);
    return undefined;
  }
  const t = v.trim();
  if (!t) {
    if (opts.required) errs.push(`${path} is required`);
    return undefined;
  }
  if ([...t].length > max) {
    errs.push(`${path} is longer than ${max} characters`);
    return undefined;
  }
  return t;
}

function onlyKeys(errs: Errs, path: string, o: Record<string, unknown>, keys: string[]): void {
  for (const k of Object.keys(o)) if (!keys.includes(k)) errs.push(`${path}.${k} is not a contact field`);
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function linkUrl(errs: Errs, path: string, v: unknown): string | undefined {
  const s = str(errs, path, v, 2048, { required: true });
  if (!s) return undefined;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    errs.push(`${path} is not a valid URL`);
    return undefined;
  }
  if (u.protocol === 'https:') {
    if (!u.hostname || u.username || u.password) {
      errs.push(`${path} must be a plain https link`);
      return undefined;
    }
    return u.href;
  }
  if (u.protocol === 'mailto:') {
    const addr = decodeURIComponent(u.pathname);
    if (!EMAIL.test(addr) || u.search) {
      errs.push(`${path} must be a plain mailto: address`);
      return undefined;
    }
    return 'mailto:' + addr;
  }
  if (u.protocol === 'tel:') {
    const num = u.pathname.replace(/[\s().-]/g, '');
    if (!E164.test(num)) {
      errs.push(`${path} must be tel:+<country code><number>`);
      return undefined;
    }
    return 'tel:' + num;
  }
  errs.push(`${path} must use https:, mailto: or tel:`);
  return undefined;
}

export function validateContact(x: unknown): { ok: true; contact: Contact } | { ok: false; errors: string[] } {
  const errs: Errs = [];
  if (!isObj(x)) return { ok: false, errors: ['contact must be an object'] };
  onlyKeys(errs, 'contact', x, ['name', 'pronouns', 'title', 'org', 'phones', 'emails', 'links', 'location', 'bio', 'tags', 'a11y', 'remixed_from']);

  const out: Partial<Contact> = {};
  if (!isObj(x.name)) errs.push('name is required');
  else {
    onlyKeys(errs, 'name', x.name, ['display', 'sort', 'given', 'family']);
    const display = str(errs, 'name.display', x.name.display, 80, { required: true });
    const name: Contact['name'] = { display: display ?? '' };
    const sort = str(errs, 'name.sort', x.name.sort, 80);
    const given = str(errs, 'name.given', x.name.given, 40);
    const family = str(errs, 'name.family', x.name.family, 40);
    if (sort) name.sort = sort;
    if (given) name.given = given;
    if (family) name.family = family;
    out.name = name;
  }
  const simple: [keyof Contact, number][] = [['pronouns', 30], ['title', 80], ['org', 80], ['location', 80]];
  for (const [k, max] of simple) {
    const v = str(errs, k, x[k], max);
    if (v) (out as Record<string, unknown>)[k] = v;
  }
  const bio = str(errs, 'bio', x.bio, 280, { bio: true });
  if (bio) out.bio = bio;

  if (x.phones !== undefined) {
    if (!Array.isArray(x.phones) || x.phones.length > 5) errs.push('phones must be a list of at most 5');
    else {
      out.phones = [];
      x.phones.forEach((p, i) => {
        if (!isObj(p)) return errs.push(`phones[${i}] must be an object`);
        onlyKeys(errs, `phones[${i}]`, p, ['label', 'value']);
        const raw = str(errs, `phones[${i}].value`, p.value, 32, { required: true });
        const value = raw?.replace(/[\s().-]/g, '');
        if (raw && !E164.test(value ?? '')) errs.push(`phones[${i}].value must look like +<country code><number>`);
        const label = str(errs, `phones[${i}].label`, p.label, 20);
        if (value && E164.test(value)) out.phones!.push(label ? { label, value } : { value });
      });
      if (!out.phones.length) delete out.phones;
    }
  }
  if (x.emails !== undefined) {
    if (!Array.isArray(x.emails) || x.emails.length > 5) errs.push('emails must be a list of at most 5');
    else {
      out.emails = [];
      x.emails.forEach((e, i) => {
        if (!isObj(e)) return errs.push(`emails[${i}] must be an object`);
        onlyKeys(errs, `emails[${i}]`, e, ['label', 'value']);
        const value = str(errs, `emails[${i}].value`, e.value, 254, { required: true });
        if (value && !EMAIL.test(value)) errs.push(`emails[${i}].value is not an email address`);
        const label = str(errs, `emails[${i}].label`, e.label, 20);
        if (value && EMAIL.test(value)) out.emails!.push(label ? { label, value } : { value });
      });
      if (!out.emails.length) delete out.emails;
    }
  }
  if (x.links !== undefined) {
    if (!Array.isArray(x.links) || x.links.length > 10) errs.push('links must be a list of at most 10');
    else {
      out.links = [];
      x.links.forEach((l, i) => {
        if (!isObj(l)) return errs.push(`links[${i}] must be an object`);
        onlyKeys(errs, `links[${i}]`, l, ['label', 'url']);
        const label = str(errs, `links[${i}].label`, l.label, 40, { required: true });
        const url = linkUrl(errs, `links[${i}].url`, l.url);
        if (label && url) out.links!.push({ label, url });
      });
      if (!out.links.length) delete out.links;
    }
  }
  if (x.tags !== undefined) {
    if (!Array.isArray(x.tags) || x.tags.length > 12) errs.push('tags must be a list of at most 12');
    else {
      const tags: string[] = [];
      x.tags.forEach((t, i) => {
        const v = str(errs, `tags[${i}]`, t, 24, { required: true });
        if (v && !TAG.test(v)) errs.push(`tags[${i}] may only use letters, numbers, spaces, - and _`);
        else if (v && !tags.includes(v)) tags.push(v);
      });
      if (tags.length) out.tags = tags;
    }
  }
  if (!isObj(x.a11y)) errs.push('a11y.summary is required (describe what the card looks like)');
  else {
    onlyKeys(errs, 'a11y', x.a11y, ['summary']);
    const summary = str(errs, 'a11y.summary', x.a11y.summary, 300, { required: true });
    out.a11y = { summary: summary ?? '' };
  }
  if (x.remixed_from !== undefined) {
    if (typeof x.remixed_from !== 'string' || !/^[0-9a-f]{64}$/.test(x.remixed_from)) errs.push('remixed_from must be a card digest');
    else out.remixed_from = x.remixed_from;
  }
  if (errs.length) return { ok: false, errors: errs };
  return { ok: true, contact: out as Contact };
}

export function canonContact(c: Contact): string {
  const v = validateContact(c);
  if (!v.ok) throw new CanonError('contact.invalid', v.errors.join('; '), v.errors);
  return jcs(v.contact);
}

/** contact_commit = sha256hex("scrollodex-contact-v0\n" + salt + "\n" + jcs(contact)) */
export async function contactCommit(contact: Contact, salt: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(salt)) throw new CanonError('contact.invalid', 'salt must be 32 random bytes, b64u');
  return sha256hex(`scrollodex-contact-v0\n${salt}\n${canonContact(contact)}`);
}

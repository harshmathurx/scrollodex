/**
 * RFC 8785 canonical JSON, restricted to the values Scrollodex signs:
 * strings, finite integers, booleans, null, arrays and plain objects.
 * Keys sort by UTF-16 code units (JavaScript's default string order).
 */
export function jcs(value: unknown): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
      if (!value.isWellFormed()) throw new TypeError('jcs: lone surrogate in string');
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isSafeInteger(value)) throw new TypeError('jcs: only safe integers are allowed');
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return '[' + value.map((v) => jcs(v)).join(',') + ']';
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) throw new TypeError('jcs: only plain objects are allowed');
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const parts: string[] = [];
      for (const k of keys) {
        if (!k.isWellFormed()) throw new TypeError('jcs: lone surrogate in key');
        const v = obj[k];
        if (v === undefined) throw new TypeError(`jcs: undefined value at key ${JSON.stringify(k)}`);
        parts.push(JSON.stringify(k) + ':' + jcs(v));
      }
      return '{' + parts.join(',') + '}';
    }
    default:
      throw new TypeError(`jcs: unsupported type ${typeof value}`);
  }
}

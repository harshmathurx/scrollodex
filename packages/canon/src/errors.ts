export type CanonErrorCode =
  | 'html.too_large'
  | 'html.not_string'
  | 'canon.unstable'
  | 'budget.elements'
  | 'budget.depth'
  | 'budget.keyframes'
  | 'budget.filters'
  | 'budget.images'
  | 'contact.invalid'
  | 'bundle.bad_path';

export class CanonError extends Error {
  readonly code: CanonErrorCode;
  readonly detail?: unknown;
  constructor(code: CanonErrorCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'CanonError';
    this.code = code;
    this.detail = detail;
  }
}

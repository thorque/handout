/** Thrown when a caller tries to change a field that is fixed for the row's lifetime. */
export class ImmutableFieldError extends Error {
  readonly field: string;

  constructor(field: string) {
    super(`${field} is immutable and cannot be changed`);
    this.name = 'ImmutableFieldError';
    this.field = field;
  }
}

/** Thrown when repeated draws all hit an address part that was already issued. */
export class SlugExhaustedError extends Error {
  readonly attempts: number;

  constructor(attempts: number) {
    super(`no free slug found after ${attempts} attempts`);
    this.name = 'SlugExhaustedError';
    this.attempts = attempts;
  }
}

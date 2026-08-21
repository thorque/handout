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

/**
 * Thrown when `moveIntoPlace` finds a target directory that already exists. This endpoint
 * is create-only: replacing an existing handout under the same address is its own story,
 * so this is refused rather than overwritten.
 */
export class HandoutDirectoryExistsError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`a handout directory for slug "${slug}" already exists`);
    this.name = 'HandoutDirectoryExistsError';
    this.slug = slug;
  }
}

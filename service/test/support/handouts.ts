/**
 * A `HandoutRepository` that throws unless a method is overridden — the same idiom
 * `checkDatabase: () => Promise.resolve(true)` already uses for the database check. A
 * suite that reaches the database by accident then fails loudly instead of passing.
 */
import type { HandoutRepository } from '../../src/handouts/repository';

function notStubbed(name: string): never {
  throw new Error(`stubHandoutRepository: ${name} was not overridden, but was called`);
}

export function stubHandoutRepository(
  overrides: Partial<HandoutRepository> = {},
): HandoutRepository {
  return {
    createHandout: overrides.createHandout ?? (() => notStubbed('createHandout')),
    getHandoutById: overrides.getHandoutById ?? (() => notStubbed('getHandoutById')),
    getHandoutBySlug: overrides.getHandoutBySlug ?? (() => notStubbed('getHandoutBySlug')),
    listHandoutsByOwner: overrides.listHandoutsByOwner ?? (() => notStubbed('listHandoutsByOwner')),
    updateHandout: overrides.updateHandout ?? (() => notStubbed('updateHandout')),
    deleteHandout: overrides.deleteHandout ?? (() => notStubbed('deleteHandout')),
    touchLastAccessed: overrides.touchLastAccessed ?? (() => notStubbed('touchLastAccessed')),
    readHandoutPassword: overrides.readHandoutPassword ?? (() => notStubbed('readHandoutPassword')),
  };
}

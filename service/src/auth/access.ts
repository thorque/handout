/**
 * Who may publish here, decided from the provider's own claims — no HTTP, no Fastify, no
 * `openid-client` type in this file. `HANDOUT_ALLOWED_EMAILS` carries both kinds of entry,
 * told apart by whether they contain an `@`.
 */

export interface AllowList {
  domains: string[];
  addresses: string[];
}

export type Refusal = 'no_email' | 'unverified' | 'not_permitted';

const WHITESPACE = /\s/;

function assertValidEntry(entry: string): void {
  if (WHITESPACE.test(entry)) {
    throw new Error(`HANDOUT_ALLOWED_EMAILS: entry "${entry}" contains whitespace`);
  }
  if (entry.startsWith('.')) {
    throw new Error(`HANDOUT_ALLOWED_EMAILS: entry "${entry}" starts with a leading "."`);
  }
  if (entry.startsWith('@')) {
    throw new Error(`HANDOUT_ALLOWED_EMAILS: entry "${entry}" starts with "@"`);
  }
  const atCount = entry.split('@').length - 1;
  if (atCount > 1) {
    throw new Error(`HANDOUT_ALLOWED_EMAILS: entry "${entry}" contains more than one "@"`);
  }
  if (atCount === 1) {
    const [localPart, domainPart] = entry.split('@');
    if (localPart === '' || domainPart === '') {
      throw new Error(`HANDOUT_ALLOWED_EMAILS: entry "${entry}" is not a valid address`);
    }
  }
}

/**
 * Splits on `,`, trims, drops empties, lower-cases. An entry with an `@` is an address, one
 * without is a domain. Every malformed entry is rejected loudly and by name, because this
 * is start-up configuration — a silent drop here would silently narrow who may publish.
 */
export function parseAllowList(raw: string): AllowList {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');

  if (entries.length === 0) {
    throw new Error('HANDOUT_ALLOWED_EMAILS must contain at least one domain or address');
  }

  const domains: string[] = [];
  const addresses: string[] = [];
  for (const entry of entries) {
    assertValidEntry(entry);
    if (entry.includes('@')) {
      addresses.push(entry);
    } else {
      domains.push(entry);
    }
  }

  return { domains, addresses };
}

/**
 * Whether `claims` may publish here. Order matters: a missing address is refused before an
 * unverified one is refused before the domain/address comparison runs — so `decideAccess`
 * never creates an owner without an address, even though `owner_email` stays nullable.
 */
export function decideAccess(
  claims: { email?: string | undefined; emailVerified?: boolean | undefined },
  list: AllowList,
): { allowed: true } | { allowed: false; refusal: Refusal } {
  const email = claims.email?.trim();
  if (email === undefined || email === '') {
    return { allowed: false, refusal: 'no_email' };
  }

  if (claims.emailVerified === false) {
    return { allowed: false, refusal: 'unverified' };
  }

  const lowered = email.toLowerCase();
  if (list.addresses.includes(lowered)) {
    return { allowed: true };
  }

  const atIndex = lowered.lastIndexOf('@');
  const domain = atIndex === -1 ? '' : lowered.slice(atIndex + 1);
  if (domain !== '' && list.domains.includes(domain)) {
    return { allowed: true };
  }

  return { allowed: false, refusal: 'not_permitted' };
}

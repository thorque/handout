import { describe, expect, it } from 'vitest';
import { decideAccess, parseAllowList } from './access';

describe('parseAllowList', () => {
  it('parses a mixed list of domains and addresses, trimmed and lower-cased', () => {
    expect(parseAllowList(' Berger-Partner.DE , t.kuhn@extern-gmbh.de ')).toEqual({
      domains: ['berger-partner.de'],
      addresses: ['t.kuhn@extern-gmbh.de'],
    });
  });

  it('rejects a list of only commas', () => {
    expect(() => parseAllowList(',,,')).toThrow(/HANDOUT_ALLOWED_EMAILS/);
  });

  it('rejects an entry with whitespace inside', () => {
    expect(() => parseAllowList('berger partner.de')).toThrow(/whitespace/);
  });

  it('rejects an entry with a leading dot', () => {
    expect(() => parseAllowList('.berger-partner.de')).toThrow(/leading/);
  });

  it('rejects an entry with a leading @', () => {
    expect(() => parseAllowList('@berger-partner.de')).toThrow(/"@"/);
  });

  it('rejects an entry with more than one @', () => {
    expect(() => parseAllowList('a@b@c.de')).toThrow(/more than one/);
  });
});

describe('decideAccess', () => {
  it('allows by domain, case-insensitively', () => {
    const list = parseAllowList('berger-partner.de');
    expect(
      decideAccess({ email: 'Thomas.Mueller@BERGER-PARTNER.DE', emailVerified: true }, list),
    ).toEqual({ allowed: true });
  });

  it('refuses a subdomain — never endsWith', () => {
    const list = parseAllowList('berger-partner.de');
    expect(
      decideAccess({ email: 'm.roth@mail.berger-partner.de', emailVerified: true }, list),
    ).toEqual({ allowed: false, refusal: 'not_permitted' });
  });

  it('refuses the suffix-comparison trap', () => {
    const list = parseAllowList('berger-partner.de');
    expect(
      decideAccess(
        { email: 'x@berger-partner.de.angreifer.example', emailVerified: true },
        list,
      ),
    ).toEqual({ allowed: false, refusal: 'not_permitted' });
  });

  it('allows a listed address even when its domain is not listed', () => {
    const list = parseAllowList('t.kuhn@extern-gmbh.de');
    expect(decideAccess({ email: 't.kuhn@extern-gmbh.de', emailVerified: true }, list)).toEqual({
      allowed: true,
    });
  });

  it('refuses a different address at the same domain as a listed address', () => {
    const list = parseAllowList('t.kuhn@extern-gmbh.de');
    expect(
      decideAccess({ email: 'other@extern-gmbh.de', emailVerified: true }, list),
    ).toEqual({ allowed: false, refusal: 'not_permitted' });
  });

  it('refuses an unverified address before the domain/address rule runs', () => {
    const list = parseAllowList('berger-partner.de');
    expect(
      decideAccess({ email: 'j.berger@berger-partner.de', emailVerified: false }, list),
    ).toEqual({ allowed: false, refusal: 'unverified' });
  });

  it('treats an unset verified flag as verified', () => {
    const list = parseAllowList('berger-partner.de');
    expect(decideAccess({ email: 'j.berger@berger-partner.de' }, list)).toEqual({
      allowed: true,
    });
  });

  it('refuses no email at all', () => {
    const list = parseAllowList('berger-partner.de');
    expect(decideAccess({}, list)).toEqual({ allowed: false, refusal: 'no_email' });
  });

  it('refuses an empty email', () => {
    const list = parseAllowList('berger-partner.de');
    expect(decideAccess({ email: '' }, list)).toEqual({ allowed: false, refusal: 'no_email' });
  });
});

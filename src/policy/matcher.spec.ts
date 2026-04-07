/**
 * Tests for the policy matcher.
 *
 * The matcher is the load-bearing piece of wallet-level compliance enforcement.
 * Every operator and every failure path must be covered. Pure function → no
 * mocks, no time bombs, deterministic.
 */

import { describe, it, expect } from 'vitest'
import { matchPolicy } from './matcher'
import type { CompliancePolicy, VerifiableCredential } from './types'

const NOW = new Date('2026-04-07T00:00:00Z')

// ── Fixtures ──────────────────────────────────────────────────────

const kycLevel2: VerifiableCredential = {
  type: ['VerifiableCredential', 'KYCCredential'],
  issuer: 'did:sns:bccr',
  issuanceDate: '2025-01-01T00:00:00Z',
  expirationDate: '2027-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:user1', level: 2, country: 'CR' },
}

const kycLevel1: VerifiableCredential = {
  type: ['VerifiableCredential', 'KYCCredential'],
  issuer: { id: 'did:web:other.com' },
  credentialSubject: { id: 'did:key:user1', level: 1, country: 'CR' },
}

const expiredKyc: VerifiableCredential = {
  type: 'KYCCredential',
  issuer: 'did:sns:bccr',
  expirationDate: '2020-01-01T00:00:00Z',
  credentialSubject: { id: 'did:key:user1', level: 5 },
}

const ageCred: VerifiableCredential = {
  type: ['VerifiableCredential', 'AgeCredential'],
  issuer: 'did:web:gov.cr',
  credentialSubject: { id: 'did:key:user1', age: 30, address: { country: 'CR' } },
}

const arraySubjectCred: VerifiableCredential = {
  type: 'MultiSubject',
  issuer: 'did:web:x',
  credentialSubject: [
    { id: 'did:key:a', score: 10 },
    { id: 'did:key:b', score: 99 },
  ],
}

const baseChallenge = { challenge: 'nonce-1', domain: 'https://app.example' }

// ── Trivial / empty cases ────────────────────────────────────────

describe('matchPolicy — empty policies', () => {
  it('satisfied when policy has no requirements at all', () => {
    const policy: CompliancePolicy = { ...baseChallenge }
    const r = matchPolicy(policy, [], NOW)
    expect(r.satisfied).toBe(true)
    expect(r.matches).toEqual([])
    expect(r.missing).toEqual([])
  })

  it('satisfied when requires is empty array', () => {
    const policy: CompliancePolicy = { ...baseChallenge, requires: [] }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(true)
  })
})

// ── AND (requires) ───────────────────────────────────────────────

describe('matchPolicy — requires (AND)', () => {
  it('matches a single requirement by type only', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(true)
    expect(r.matches).toHaveLength(1)
    expect(r.matches[0].credential).toBe(kycLevel2)
  })

  it('reports NO_MATCHING_TYPE when no VC of that type exists', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }],
    }
    const r = matchPolicy(policy, [], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.missing).toHaveLength(1)
    expect(r.missing[0].reason).toBe('NO_MATCHING_TYPE')
    expect(r.missing[0].index).toBe(0)
  })

  it('AND fails if any single requirement fails', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }, { type: 'AgeCredential' }],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.matches).toHaveLength(1)
    expect(r.missing).toHaveLength(1)
    expect(r.missing[0].requirement.type).toBe('AgeCredential')
  })

  it('AND succeeds when every requirement is matched', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }, { type: 'AgeCredential' }],
    }
    const r = matchPolicy(policy, [kycLevel2, ageCred], NOW)
    expect(r.satisfied).toBe(true)
    expect(r.matches).toHaveLength(2)
  })
})

// ── Issuer filtering ─────────────────────────────────────────────

describe('matchPolicy — issuer filtering', () => {
  it('rejects credential when issuer not in single-string allowlist', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential', issuer: 'did:sns:bccr' }],
    }
    const r = matchPolicy(policy, [kycLevel1], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.missing[0].reason).toBe('ISSUER_NOT_TRUSTED')
  })

  it('accepts credential when issuer matches single-string allowlist', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential', issuer: 'did:sns:bccr' }],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(true)
  })

  it('accepts credential when issuer matches array allowlist', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential', issuer: ['did:web:other.com', 'did:sns:bccr'] }],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(true)
  })

  it('handles object issuer form (issuer.id)', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential', issuer: 'did:web:other.com' }],
    }
    const r = matchPolicy(policy, [kycLevel1], NOW)
    expect(r.satisfied).toBe(true)
  })

  it('empty issuer array means any issuer is allowed', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential', issuer: [] }],
    }
    const r = matchPolicy(policy, [kycLevel1], NOW)
    expect(r.satisfied).toBe(true)
  })
})

// ── Expiry ───────────────────────────────────────────────────────

describe('matchPolicy — expiry', () => {
  it('rejects expired credentials', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }],
    }
    const r = matchPolicy(policy, [expiredKyc], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.missing[0].reason).toBe('EXPIRED')
  })

  it('accepts when expirationDate is in the future', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(true)
  })

  it('accepts when no expiration field present', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }],
    }
    const r = matchPolicy(policy, [kycLevel1], NOW)
    expect(r.satisfied).toBe(true)
  })

  it('treats unparseable expirationDate as not-expired', () => {
    const broken: VerifiableCredential = {
      type: 'KYCCredential',
      issuer: 'did:x',
      expirationDate: 'not-a-date',
      credentialSubject: {},
    }
    const policy: CompliancePolicy = { ...baseChallenge, requires: [{ type: 'KYCCredential' }] }
    const r = matchPolicy(policy, [broken], NOW)
    expect(r.satisfied).toBe(true)
  })

  it('honors validUntil as an expiration alias', () => {
    const vc: VerifiableCredential = {
      type: 'KYCCredential',
      issuer: 'did:x',
      validUntil: '2020-01-01T00:00:00Z',
      credentialSubject: {},
    }
    const policy: CompliancePolicy = { ...baseChallenge, requires: [{ type: 'KYCCredential' }] }
    const r = matchPolicy(policy, [vc], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.missing[0].reason).toBe('EXPIRED')
  })
})

// ── Constraint operators ─────────────────────────────────────────

describe('matchPolicy — constraint operators', () => {
  const make = (constraints: Record<string, unknown>): CompliancePolicy => ({
    ...baseChallenge,
    requires: [{ type: 'KYCCredential', constraints: constraints as never }],
  })

  it('shorthand bare-value equality (positive)', () => {
    expect(matchPolicy(make({ level: 2 }), [kycLevel2], NOW).satisfied).toBe(true)
  })

  it('shorthand bare-value equality (negative)', () => {
    expect(matchPolicy(make({ level: 5 }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('shorthand string equality', () => {
    expect(matchPolicy(make({ country: 'CR' }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ country: 'US' }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('shorthand boolean equality', () => {
    const vc: VerifiableCredential = {
      type: 'KYCCredential',
      issuer: 'x',
      credentialSubject: { verified: true },
    }
    expect(matchPolicy(make({ verified: true }), [vc], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ verified: false }), [vc], NOW).satisfied).toBe(false)
  })

  it('= operator', () => {
    expect(matchPolicy(make({ level: { '=': 2 } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ level: { '=': 3 } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('!= operator', () => {
    expect(matchPolicy(make({ level: { '!=': 1 } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ level: { '!=': 2 } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('> operator', () => {
    expect(matchPolicy(make({ level: { '>': 1 } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ level: { '>': 2 } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('>= operator', () => {
    expect(matchPolicy(make({ level: { '>=': 2 } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ level: { '>=': 3 } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('< operator', () => {
    expect(matchPolicy(make({ level: { '<': 3 } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ level: { '<': 2 } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('<= operator', () => {
    expect(matchPolicy(make({ level: { '<=': 2 } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ level: { '<=': 1 } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('numeric comparators reject non-number actuals', () => {
    expect(matchPolicy(make({ country: { '>': 1 } }), [kycLevel2], NOW).satisfied).toBe(false)
    expect(matchPolicy(make({ country: { '>=': 1 } }), [kycLevel2], NOW).satisfied).toBe(false)
    expect(matchPolicy(make({ country: { '<': 1 } }), [kycLevel2], NOW).satisfied).toBe(false)
    expect(matchPolicy(make({ country: { '<=': 1 } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('in operator', () => {
    expect(matchPolicy(make({ country: { in: ['CR', 'MX'] } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ country: { in: ['US'] } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('notIn operator', () => {
    expect(matchPolicy(make({ country: { notIn: ['US'] } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ country: { notIn: ['CR'] } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('exists operator', () => {
    expect(matchPolicy(make({ level: { exists: true } }), [kycLevel2], NOW).satisfied).toBe(true)
    expect(matchPolicy(make({ missing: { exists: true } }), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('unknown operator returns false', () => {
    // intentionally testing unknown operator — bypass via cast
    const weird = { level: { weird: 1 } as unknown as { '=': number } }
    expect(matchPolicy(make(weird), [kycLevel2], NOW).satisfied).toBe(false)
  })

  it('reports CONSTRAINT_FAILED reason when only constraint fails', () => {
    const r = matchPolicy(make({ level: { '>=': 99 } }), [kycLevel2], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.missing[0].reason).toBe('CONSTRAINT_FAILED')
  })
})

// ── Dotted path constraints ──────────────────────────────────────

describe('matchPolicy — dotted paths', () => {
  it('reads nested fields via dotted path', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'AgeCredential', constraints: { 'address.country': 'CR' } }],
    }
    expect(matchPolicy(policy, [ageCred], NOW).satisfied).toBe(true)
  })

  it('returns undefined (constraint fails) when path is broken mid-way', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'AgeCredential', constraints: { 'address.city.zip': 'x' } }],
    }
    expect(matchPolicy(policy, [ageCred], NOW).satisfied).toBe(false)
  })
})

// ── Array credentialSubject ──────────────────────────────────────

describe('matchPolicy — array credentialSubject', () => {
  it('matches if any subject in the array satisfies the constraint', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'MultiSubject', constraints: { score: { '>=': 50 } } }],
    }
    expect(matchPolicy(policy, [arraySubjectCred], NOW).satisfied).toBe(true)
  })

  it('fails if no subject in the array satisfies the constraint', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'MultiSubject', constraints: { score: { '>=': 200 } } }],
    }
    expect(matchPolicy(policy, [arraySubjectCred], NOW).satisfied).toBe(false)
  })
})

// ── Type matching: string vs array ───────────────────────────────

describe('matchPolicy — type field shapes', () => {
  it('matches when vc.type is a string', () => {
    const vc: VerifiableCredential = { type: 'KYCCredential', issuer: 'x', credentialSubject: {} }
    const policy: CompliancePolicy = { ...baseChallenge, requires: [{ type: 'KYCCredential' }] }
    expect(matchPolicy(policy, [vc], NOW).satisfied).toBe(true)
  })

  it('matches when vc.type is an array containing the requested type', () => {
    const policy: CompliancePolicy = { ...baseChallenge, requires: [{ type: 'KYCCredential' }] }
    expect(matchPolicy(policy, [kycLevel2], NOW).satisfied).toBe(true)
  })

  it('fails when string type does not match', () => {
    const vc: VerifiableCredential = { type: 'OtherCred', issuer: 'x', credentialSubject: {} }
    const policy: CompliancePolicy = { ...baseChallenge, requires: [{ type: 'KYCCredential' }] }
    const r = matchPolicy(policy, [vc], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.missing[0].reason).toBe('NO_MATCHING_TYPE')
  })
})

// ── anyOf (OR) ───────────────────────────────────────────────────

describe('matchPolicy — anyOf (OR)', () => {
  it('satisfied if any one bundle is fully satisfied', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      anyOf: [
        [{ type: 'NonExistentCred' }],
        [{ type: 'KYCCredential' }],
      ],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(true)
    expect(r.matches.some((m) => m.credential === kycLevel2)).toBe(true)
  })

  it('fails when no bundle is fully satisfied', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      anyOf: [[{ type: 'A' }], [{ type: 'B' }]],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(false)
    expect(r.missing.length).toBeGreaterThan(0)
    expect(r.missing[0].index).toBeGreaterThanOrEqual(1000)
  })

  it('handles empty anyOf bundle list as failure', () => {
    const policy: CompliancePolicy = { ...baseChallenge, anyOf: [[]] }
    // empty inner bundle is trivially satisfied (zero requirements all match)
    const r = matchPolicy(policy, [], NOW)
    expect(r.satisfied).toBe(true)
  })

  it('combines requires AND anyOf — both must hold', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }],
      anyOf: [[{ type: 'AgeCredential' }], [{ type: 'NonExistent' }]],
    }
    expect(matchPolicy(policy, [kycLevel2, ageCred], NOW).satisfied).toBe(true)
    expect(matchPolicy(policy, [kycLevel2], NOW).satisfied).toBe(false)
    expect(matchPolicy(policy, [ageCred], NOW).satisfied).toBe(false)
  })

  it('does not double-add a credential that already matched in requires', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential' }],
      anyOf: [[{ type: 'KYCCredential' }]],
    }
    const r = matchPolicy(policy, [kycLevel2], NOW)
    expect(r.satisfied).toBe(true)
    // Same VC must not appear twice in matches list.
    expect(r.matches.filter((m) => m.credential === kycLevel2)).toHaveLength(1)
  })
})

// ── Determinism & ordering ───────────────────────────────────────

describe('matchPolicy — determinism', () => {
  it('returns the first matching VC in input order', () => {
    const a: VerifiableCredential = {
      type: 'KYCCredential',
      issuer: 'x',
      credentialSubject: { level: 2 },
    }
    const b: VerifiableCredential = {
      type: 'KYCCredential',
      issuer: 'x',
      credentialSubject: { level: 2 },
    }
    const policy: CompliancePolicy = { ...baseChallenge, requires: [{ type: 'KYCCredential' }] }
    expect(matchPolicy(policy, [a, b], NOW).matches[0].credential).toBe(a)
    expect(matchPolicy(policy, [b, a], NOW).matches[0].credential).toBe(b)
  })

  it('uses default now=new Date() when not provided', () => {
    const policy: CompliancePolicy = { ...baseChallenge, requires: [{ type: 'KYCCredential' }] }
    // kycLevel2 expires in 2027 → still valid at real "now"
    const r = matchPolicy(policy, [kycLevel2])
    expect(r.satisfied).toBe(true)
  })
})

// ── Failure-reason precedence ────────────────────────────────────

describe('matchPolicy — failure reason precedence', () => {
  it('prefers ISSUER_NOT_TRUSTED over generic NO_MATCHING_TYPE when type matched', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential', issuer: 'did:sns:bccr' }],
    }
    const r = matchPolicy(policy, [kycLevel1], NOW)
    expect(r.missing[0].reason).toBe('ISSUER_NOT_TRUSTED')
  })

  it('prefers EXPIRED over CONSTRAINT_FAILED when both apply', () => {
    const policy: CompliancePolicy = {
      ...baseChallenge,
      requires: [{ type: 'KYCCredential', constraints: { level: { '>=': 99 } } }],
    }
    const r = matchPolicy(policy, [expiredKyc], NOW)
    // expired check runs before constraints check → reason is EXPIRED
    expect(r.missing[0].reason).toBe('EXPIRED')
  })
})

/**
 * Policy Matcher — pure function evaluating a CompliancePolicy against
 * a set of locally stored Verifiable Credentials.
 *
 * This is the heart of wallet-level compliance enforcement: the wallet runs
 * this function locally, decides if it can satisfy the site's policy, and
 * only THEN asks the user for consent. The site never learns anything about
 * credentials that were not needed.
 *
 * Pure, deterministic, no I/O. Safe to call in any context (background page,
 * content script, service worker).
 */

import type {
  CompliancePolicy,
  ConstraintMap,
  ConstraintOp,
  PolicyMatchResult,
  PolicyRequirement,
  RequirementGap,
  VerifiableCredential,
} from './types'

// ── Public API ────────────────────────────────────────────────────

/**
 * Evaluate a compliance policy against the holder's stored credentials.
 *
 * Semantics:
 *   - `policy.requires` is AND — every requirement must match a VC.
 *   - `policy.anyOf` is OR — at least one bundle must fully match.
 *   - When both are present, both must hold (`requires` AND any `anyOf` bundle).
 *   - The first matching VC per requirement wins (deterministic by input order).
 *
 * @param policy       The site's declared policy
 * @param credentials  All VCs the wallet currently holds
 * @param now          Current time (defaults to `new Date()`) — injectable for tests
 */
export function matchPolicy(
  policy: CompliancePolicy,
  credentials: VerifiableCredential[],
  now: Date = new Date(),
): PolicyMatchResult {
  const matches: PolicyMatchResult['matches'] = []
  const missing: RequirementGap[] = []

  // ── AND block ───────────────────────────────────────────────────
  if (policy.requires && policy.requires.length > 0) {
    for (let i = 0; i < policy.requires.length; i++) {
      const req = policy.requires[i]
      const result = findMatchingCredential(req, credentials, now)
      if (result.credential) {
        matches.push({ requirement: req, credential: result.credential })
      } else {
        missing.push({
          index: i,
          requirement: req,
          reason: result.reason ?? 'NO_MATCHING_TYPE',
          message: result.message ?? `No credential matching ${req.type}`,
        })
      }
    }
  }

  const requiresOk = missing.length === 0

  // ── OR block ────────────────────────────────────────────────────
  let anyOfOk = true
  if (policy.anyOf && policy.anyOf.length > 0) {
    anyOfOk = false
    for (const bundle of policy.anyOf) {
      const bundleMatches: PolicyMatchResult['matches'] = []
      let bundleOk = true
      for (const req of bundle) {
        const result = findMatchingCredential(req, credentials, now)
        if (!result.credential) {
          bundleOk = false
          break
        }
        bundleMatches.push({ requirement: req, credential: result.credential })
      }
      if (bundleOk) {
        anyOfOk = true
        // Merge winning bundle into the matches list (avoiding duplicates by VC id)
        for (const m of bundleMatches) {
          if (!matches.some((x) => x.credential === m.credential)) {
            matches.push(m)
          }
        }
        break
      }
    }
    if (!anyOfOk) {
      // Surface the gap so the wallet can show "you need one of: ..."
      const firstBundle = policy.anyOf[0] ?? []
      for (let i = 0; i < firstBundle.length; i++) {
        missing.push({
          index: 1000 + i, // disambiguate from `requires` indices
          requirement: firstBundle[i],
          reason: 'NO_MATCHING_TYPE',
          message: `No credential satisfying anyOf bundle requirement ${firstBundle[i].type}`,
        })
      }
    }
  }

  return {
    satisfied: requiresOk && anyOfOk,
    matches,
    missing,
  }
}

// ── Internals ─────────────────────────────────────────────────────

interface FindResult {
  credential: VerifiableCredential | null
  reason?: RequirementGap['reason']
  message?: string
}

function findMatchingCredential(
  req: PolicyRequirement,
  credentials: VerifiableCredential[],
  now: Date,
): FindResult {
  // First filter by type — anything not of the right type is not a candidate.
  const candidatesByType = credentials.filter((vc) => hasType(vc, req.type))
  if (candidatesByType.length === 0) {
    return {
      credential: null,
      reason: 'NO_MATCHING_TYPE',
      message: `No credential of type ${req.type}`,
    }
  }

  // Track the most informative failure as we walk candidates so we can
  // report something better than NO_MATCHING_TYPE when a candidate exists
  // but is rejected for another reason.
  let lastFailure: FindResult = {
    credential: null,
    reason: 'NO_MATCHING_TYPE',
    message: `No credential of type ${req.type} satisfied the requirement`,
  }

  for (const vc of candidatesByType) {
    if (req.issuer && !issuerAllowed(vc, req.issuer)) {
      lastFailure = {
        credential: null,
        reason: 'ISSUER_NOT_TRUSTED',
        message: `Credential of type ${req.type} found, but issuer not in allowlist`,
      }
      continue
    }
    if (isExpired(vc, now)) {
      lastFailure = {
        credential: null,
        reason: 'EXPIRED',
        message: `Credential of type ${req.type} is expired`,
      }
      continue
    }
    if (req.constraints && !constraintsSatisfied(vc, req.constraints)) {
      lastFailure = {
        credential: null,
        reason: 'CONSTRAINT_FAILED',
        message: `Credential of type ${req.type} did not satisfy field constraints`,
      }
      continue
    }
    return { credential: vc }
  }

  return lastFailure
}

// ── VC field helpers ──────────────────────────────────────────────

function hasType(vc: VerifiableCredential, type: string): boolean {
  if (Array.isArray(vc.type)) return vc.type.includes(type)
  return vc.type === type
}

function issuerOf(vc: VerifiableCredential): string {
  if (typeof vc.issuer === 'string') return vc.issuer
  return vc.issuer?.id ?? ''
}

function issuerAllowed(vc: VerifiableCredential, allowed: string | string[]): boolean {
  const list = Array.isArray(allowed) ? allowed : [allowed]
  if (list.length === 0) return true
  return list.includes(issuerOf(vc))
}

function isExpired(vc: VerifiableCredential, now: Date): boolean {
  const exp = vc.expirationDate ?? vc.validUntil
  if (!exp) return false
  const t = Date.parse(exp)
  if (Number.isNaN(t)) return false
  return t < now.getTime()
}

function constraintsSatisfied(vc: VerifiableCredential, constraints: ConstraintMap): boolean {
  // credentialSubject can be a single object or an array — match against any.
  const subjects = Array.isArray(vc.credentialSubject)
    ? vc.credentialSubject
    : [vc.credentialSubject]
  return subjects.some((subject) => {
    for (const [path, expected] of Object.entries(constraints)) {
      const actual = readPath(subject, path)
      if (!evaluateConstraint(actual, expected)) return false
    }
    return true
  })
}

/** Read a dotted path like `address.country` out of a nested object */
function readPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function evaluateConstraint(actual: unknown, expected: ConstraintOp | string | number | boolean): boolean {
  // Shorthand: bare value means equality
  if (typeof expected !== 'object' || expected === null) {
    return actual === expected
  }
  const op = expected as ConstraintOp
  if ('=' in op) return actual === op['=']
  if ('!=' in op) return actual !== op['!=']
  if ('>' in op) return typeof actual === 'number' && actual > op['>']
  if ('>=' in op) return typeof actual === 'number' && actual >= op['>=']
  if ('<' in op) return typeof actual === 'number' && actual < op['<']
  if ('<=' in op) return typeof actual === 'number' && actual <= op['<=']
  if ('in' in op) return op.in.includes(actual as string | number)
  if ('notIn' in op) return !op.notIn.includes(actual as string | number)
  if ('exists' in op) return actual !== undefined && actual !== null
  return false
}

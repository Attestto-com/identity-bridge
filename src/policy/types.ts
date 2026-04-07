/**
 * Compliance Policy DSL — types
 *
 * A site declares a policy describing WHICH credentials it needs and WHAT
 * constraints those credentials must satisfy. The wallet evaluates the policy
 * against locally stored VCs and only emits a Verifiable Presentation if the
 * policy is satisfied. If not, the wallet returns the list of missing
 * requirements so the site can guide the user to obtain them.
 *
 * This is the wallet-level compliance enforcement layer. The site never sees
 * the underlying credentials it does not need — it only learns whether the
 * holder satisfies the declared rules.
 */

// ── Constraint operators ──────────────────────────────────────────

/**
 * Comparison operators usable inside a constraint object.
 *
 * Example: `{ level: { '>=': 2 } }` means the credential field `level`
 * must be greater than or equal to 2.
 */
export type ConstraintOp =
  | { '=': string | number | boolean }
  | { '!=': string | number | boolean }
  | { '>': number }
  | { '>=': number }
  | { '<': number }
  | { '<=': number }
  | { in: Array<string | number> }
  | { notIn: Array<string | number> }
  | { exists: true }

/** Map of credentialSubject field path → constraint */
export type ConstraintMap = Record<string, ConstraintOp | string | number | boolean>

// ── Requirement ───────────────────────────────────────────────────

/**
 * A single requirement inside a CompliancePolicy.
 *
 * The wallet must find at least one VC in local storage that:
 *   1. has `type` matching `type`,
 *   2. was issued by an issuer in `issuer` (if specified),
 *   3. satisfies every entry in `constraints` (if specified),
 *   4. is not revoked / not expired.
 */
export interface PolicyRequirement {
  /** VC type that satisfies this requirement (e.g. 'KYCCredential') */
  type: string
  /** Optional list of acceptable issuer DIDs. Empty/undefined = any issuer. */
  issuer?: string[] | string
  /** Field-level constraints over `credentialSubject` */
  constraints?: ConstraintMap
  /**
   * Field paths the holder must disclose to the verifier. If omitted, the
   * wallet returns only that the requirement was satisfied (no field values).
   * If present, the wallet returns the listed fields inside the VP.
   *
   * NOTE: v0.4 implements this as field redaction at presentation time. True
   * BBS+ / ZK selective disclosure is on the v0.6 roadmap.
   */
  disclose?: string[]
  /** Human-readable label for UI/error messages */
  label?: string
}

// ── Policy ────────────────────────────────────────────────────────

/**
 * Top-level compliance policy a site sends to a wallet.
 *
 * `requires` is AND-semantics: every requirement must be satisfied.
 * `anyOf` is OR-semantics: at least one of the inner policies must be satisfied.
 */
export interface CompliancePolicy {
  /** All requirements that must be satisfied (AND) */
  requires?: PolicyRequirement[]
  /** Alternative requirement bundles, any of which is acceptable (OR) */
  anyOf?: PolicyRequirement[][]
  /** Challenge nonce — site supplies, wallet binds into the proof */
  challenge: string
  /** Origin of the requesting site — wallet binds into the proof */
  domain: string
  /** Optional human-readable purpose for consent UI */
  purpose?: string
}

// ── Match result ──────────────────────────────────────────────────

/** Why a single requirement failed */
export interface RequirementGap {
  /** Index of the requirement in the original policy */
  index: number
  /** The original requirement */
  requirement: PolicyRequirement
  /** Machine-readable failure code */
  reason:
    | 'NO_MATCHING_TYPE'
    | 'ISSUER_NOT_TRUSTED'
    | 'CONSTRAINT_FAILED'
    | 'REVOKED'
    | 'EXPIRED'
  /** Human-readable explanation */
  message: string
}

/**
 * Output of `matchPolicy()` — what the wallet uses to decide whether to
 * build a VP or reject with missing-credentials.
 */
export interface PolicyMatchResult {
  /** True iff every required (or one anyOf bundle) requirement matched */
  satisfied: boolean
  /** For each satisfied requirement: the VC chosen to satisfy it */
  matches: Array<{ requirement: PolicyRequirement; credential: VerifiableCredential }>
  /** Requirements that could not be satisfied — empty when satisfied=true */
  missing: RequirementGap[]
}

// ── VC shape (minimal — we only need what the matcher reads) ──────

/** Minimal VC shape used by the matcher. Compatible with W3C VCDM 1.1 / 2.0. */
export interface VerifiableCredential {
  '@context'?: string | string[]
  id?: string
  type: string | string[]
  issuer: string | { id: string; [k: string]: unknown }
  issuanceDate?: string
  validFrom?: string
  expirationDate?: string
  validUntil?: string
  credentialSubject: Record<string, unknown> | Array<Record<string, unknown>>
  credentialStatus?: { type?: string; statusListIndex?: string | number; [k: string]: unknown }
  proof?: unknown
  [k: string]: unknown
}

// ── Presentation request / response ───────────────────────────────

/** Site → wallet payload for a policy-driven presentation request */
export interface PresentationRequestDetail {
  /** Nonce to correlate request → response */
  nonce: string
  /** DID of the target wallet */
  walletDid: string
  /** The compliance policy the site is enforcing */
  policy: CompliancePolicy
}

/** Wallet → site payload after policy evaluation + optional user consent */
export interface PresentationResponseDetail {
  /** Correlates to the request nonce */
  nonce: string
  /** The result of evaluating the policy */
  response: PresentationResponse
}

/** What the wallet returns to the site */
export interface PresentationResponse {
  /** True if the user consented AND the policy was satisfied */
  approved: boolean
  /** The VP (W3C VerifiablePresentation) — present when approved */
  vp?: Record<string, unknown>
  /** Holder DID — present when approved (may be per-domain pseudonym in v0.5) */
  holderDid?: string
  /** Why the request failed — present when approved=false */
  rejection?: {
    code: 'USER_DENIED' | 'POLICY_UNSATISFIED' | 'TIMEOUT' | 'WALLET_ERROR'
    message: string
    /** When code=POLICY_UNSATISFIED, the gaps the wallet detected */
    missing?: RequirementGap[]
  }
}

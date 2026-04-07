# CLAUDE.md — `@attestto/id-wallet-adapter`

This repo is **public infrastructure published to npm** as `@attestto/id-wallet-adapter`. Anything that ships here is consumed by third parties (gov pilots, dApps, browser extensions). The bar is higher than internal repos. This file is the local rulebook — it inherits from `~/Attestto/CORTEX/CLAUDE.md` and adds publish-grade constraints.

## 1. INHERITANCE
- All rules in `~/Attestto/CORTEX/CLAUDE.md` apply here unless explicitly overridden below.
- Especially the **NO-DUPLICATION LOCK** (§1b) and the **GIT FLOW** (§1c).
- Workspace map lives at `~/Attestto/README.md`. Read it before assuming a capability is missing locally.

## 2. PUBLIC NPM HARDENING (NON-NEGOTIABLE)
This repo is published to npm. Every PR must satisfy:

1. **Lint**: `npm run lint` (currently `tsc --noEmit`) → zero errors.
2. **Tests**: `npm run test:run` → all green.
3. **Targeted coverage**: any new/modified `src/**/*.ts` must have a sibling `.spec.ts` covering it. Coverage on changed lines = **100%**. Pure functions (e.g. `policy/matcher.ts`) have no excuse.
4. **Build**: `npm run build` (`tsup`) → succeeds, types emitted.
5. **No publish without all four green.** `prepublishOnly` must run lint + test + build.

### Why
Until 2026-04-07 this repo had: tsup + typescript and **nothing else**. No vitest, no coverage, no CI, no ESLint, no test files. It was published to npm at v0.3.0 with zero automated quality gates. That is exactly the pattern that produced the SINPE-pattern incident in CORTEX (mock-style validation shipped to prod). It will not happen here again.

## 3. TEST STACK
- **Framework**: vitest (configured in `vitest.config.ts`).
- **Coverage**: `@vitest/coverage-v8`. Reported via `npm run coverage`.
- **Location**: tests live next to source, named `*.spec.ts`. No separate `tests/` tree.
- **Style**: deterministic, pure where possible. Browser APIs (`window.dispatchEvent`, `CustomEvent`) are mocked via vitest's `jsdom` env or stubbed per test.
- **Forbidden**: snapshot tests for protocol payloads — they hide regressions. Assert structure explicitly.

## 4. MATCHER & POLICY DSL — DOMAIN RULES
`src/policy/` is the wallet-level compliance enforcement layer. It is the load-bearing piece of the new pitch (Phantom et al). Rules:

- **Pure functions only** in `matcher.ts`. No `Date.now()` calls inside the matcher — accept `now: Date` as a parameter, default to `new Date()`. Tests inject `now`.
- **No I/O** in matcher. No fetch, no DID resolution, no storage reads. The wallet caller assembles the inputs.
- **Deterministic ordering**: when multiple VCs satisfy a requirement, return the first one in input order. Documented in JSDoc.
- **Exhaustive constraint operators**: every operator declared in `ConstraintOp` must have a test case (positive AND negative).
- **Schema stability**: the `CompliancePolicy` shape is part of the wire protocol. Breaking changes require a major version bump and a migration note in the README.

## 5. WIRE PROTOCOL
Events live in `src/constants.ts`. Adding a new event = adding a new public API surface — must be documented in README + tested round-trip.

Current events:
- `credential-wallet:discover` / `credential-wallet:announce` (discovery)
- `credential-wallet:sign` / `credential-wallet:sign-response` (signing)
- `credential-wallet:request-presentation` / `credential-wallet:presentation-response` (NEW — policy-driven VP request, v0.4)

## 6. SECURITY DISCLOSURES
- All security issues go via `SECURITY.md` — coordinated disclosure, no public issues.
- Anything that touches signature verification, DID resolution, or policy evaluation logic must have a test that fails when the verification step is skipped (negative test).

## 7. WHEN IN DOUBT
- Read `~/Attestto/CORTEX/CLAUDE.md` first.
- Read `~/Attestto/README.md` to find the canonical implementation in a sibling repo.
- Never write a parallel implementation of something that already exists in `vc-sdk`, `cr-vc-sdk`, `wallet-identity-resolver`, or `attestto-verify`.

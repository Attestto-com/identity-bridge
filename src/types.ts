/**
 * Credential Wallet Connector — Type definitions
 *
 * Defines the data structures for the universal wallet discovery protocol.
 */

// ---------------------------------------------------------------------------
// Wallet identity
// ---------------------------------------------------------------------------

/** A wallet's self-description, broadcast during discovery */
export interface WalletAnnouncement {
  /** The wallet's own DID — eats its own dog food */
  did: string
  /** Human-readable wallet name */
  name: string
  /** Wallet icon URL (SVG or PNG, ideally 64x64) */
  icon: string
  /** Semantic version */
  version: string
  /** Supported credential protocols */
  protocols: WalletProtocol[]
  /** Capability goals this wallet can handle (Aries RFC 0519 inspired) */
  goals?: string[]
  /** Who maintains this wallet */
  maintainer: WalletMaintainer
  /** Homepage or docs URL */
  url?: string
}

/** Credential exchange protocols a wallet may support */
export type WalletProtocol = 'chapi' | 'didcomm-v2' | 'oid4vp' | 'waci-didcomm'

/** Organization or individual maintaining a wallet */
export interface WalletMaintainer {
  /** Organization or individual name */
  name: string
  /** Maintainer's DID */
  did?: string
  /** Website */
  url?: string
}

// ---------------------------------------------------------------------------
// Event detail types
// ---------------------------------------------------------------------------

/** Payload of the discover event (site → wallets) */
export interface DiscoverDetail {
  /** Nonce to correlate discover → announce */
  nonce: string
}

/** Payload of the announce event (wallet → site) */
export interface AnnounceDetail {
  /** Correlates to the discover nonce */
  nonce: string
  /** The wallet's self-description */
  wallet: WalletAnnouncement
}

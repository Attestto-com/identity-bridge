/**
 * Site-side discovery — find all credential wallet extensions in the browser.
 */

import { DISCOVER_EVENT, ANNOUNCE_EVENT } from './constants'
import type { WalletAnnouncement, DiscoverDetail, AnnounceDetail } from './types'

/**
 * Discover all credential wallet extensions installed in the browser.
 *
 * Dispatches a `credential-wallet:discover` event and collects
 * `credential-wallet:announce` responses within a timeout window.
 * Extensions inject content scripts at `document_start`, so by the
 * time a web app mounts they are already listening.
 *
 * @param timeoutMs  How long to wait for announcements (default 800ms)
 * @returns Array of wallet announcements (may be empty)
 *
 * @example
 * ```ts
 * import { discoverWallets } from 'credential-wallet-connector'
 *
 * const wallets = await discoverWallets()
 * if (wallets.length === 0) {
 *   // Show install prompts
 * } else if (wallets.length === 1) {
 *   // Auto-select the only wallet
 * } else {
 *   // Show wallet picker
 * }
 * ```
 */
export function discoverWallets(timeoutMs = 800): Promise<WalletAnnouncement[]> {
  return new Promise((resolve) => {
    const wallets: WalletAnnouncement[] = []
    const seen = new Set<string>()
    const nonce = `cw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

    function onAnnounce(e: Event) {
      const detail = (e as CustomEvent<AnnounceDetail>).detail
      if (detail?.nonce !== nonce) return
      if (seen.has(detail.wallet.did)) return
      seen.add(detail.wallet.did)
      wallets.push(detail.wallet)
    }

    window.addEventListener(ANNOUNCE_EVENT, onAnnounce)

    window.dispatchEvent(new CustomEvent<DiscoverDetail>(DISCOVER_EVENT, {
      detail: { nonce },
    }))

    setTimeout(() => {
      window.removeEventListener(ANNOUNCE_EVENT, onAnnounce)
      resolve(wallets)
    }, timeoutMs)
  })
}

/**
 * Wallet-side registration — announce your wallet during discovery.
 */

import { DISCOVER_EVENT, ANNOUNCE_EVENT } from './constants'
import type { WalletAnnouncement, DiscoverDetail, AnnounceDetail } from './types'

/**
 * Register a credential wallet to respond to discovery events.
 *
 * Call this once in the extension's content script (MAIN world).
 * When a site dispatches `credential-wallet:discover`, this handler
 * responds with the wallet's announcement.
 *
 * @param wallet  The wallet's self-description
 *
 * @example
 * ```ts
 * import { registerWallet } from 'credential-wallet-connector'
 *
 * registerWallet({
 *   did: 'did:web:attestto.com:wallets:attestto-did',
 *   name: 'Attestto DID',
 *   icon: 'https://attestto.com/icons/attestto-did-64.svg',
 *   version: '0.1.0',
 *   protocols: ['chapi', 'didcomm-v2'],
 *   maintainer: {
 *     name: 'Attestto',
 *     did: 'did:web:attestto.com',
 *     url: 'https://attestto.com',
 *   },
 * })
 * ```
 */
export function registerWallet(wallet: WalletAnnouncement): void {
  window.addEventListener(DISCOVER_EVENT, (e: Event) => {
    const detail = (e as CustomEvent<DiscoverDetail>).detail
    if (!detail?.nonce) return

    window.dispatchEvent(new CustomEvent<AnnounceDetail>(ANNOUNCE_EVENT, {
      detail: {
        nonce: detail.nonce,
        wallet,
      },
    }))
  })
}

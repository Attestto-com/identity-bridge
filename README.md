# credential-wallet-connector

Universal discovery protocol for credential wallet browser extensions — like [EIP-6963](https://eips.ethereum.org/EIPS/eip-6963) but for W3C identity wallets.

Sites broadcast a discovery event, installed wallet extensions announce themselves with their DID identity and metadata. Multiple wallets can coexist — the user always chooses.

## Install

```bash
npm install credential-wallet-connector
```

## Quick Start

### Site-side (your web app)

```ts
import { discoverWallets } from 'credential-wallet-connector'

// Discover all installed credential wallet extensions
const wallets = await discoverWallets()

if (wallets.length === 0) {
  // No wallet found — show install prompts
} else if (wallets.length === 1) {
  // One wallet — auto-select
  console.log('Using', wallets[0].name, wallets[0].did)
} else {
  // Multiple wallets — show picker
  wallets.forEach(w => console.log(w.name, w.did, w.protocols))
}

// After user picks a wallet, request a credential via standard CHAPI:
const credential = await navigator.credentials.get({
  web: {
    VerifiablePresentation: {
      query: { type: 'DIDAuthentication' },
      challenge: crypto.randomUUID(),
      domain: window.location.origin,
    },
  },
})
```

### Wallet-side (your browser extension)

```ts
import { registerWallet } from 'credential-wallet-connector'

// Call once in your content script (MAIN world)
registerWallet({
  did: 'did:web:yourorg.com:wallets:your-wallet',
  name: 'Your Wallet',
  icon: 'https://yourorg.com/icon-64.svg',
  version: '1.0.0',
  protocols: ['chapi', 'didcomm-v2'],
  maintainer: {
    name: 'Your Org',
    did: 'did:web:yourorg.com',
    url: 'https://yourorg.com',
  },
})
```

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  Website                                            │
│                                                     │
│  1. dispatchEvent('credential-wallet:discover')     │
│                     ↓                               │
│  ┌──────────────────┼──────────────────┐            │
│  │  Extension A      │  Extension B     │           │
│  │  (Attestto Creds) │  (Spruce)        │           │
│  │         ↓         │        ↓         │           │
│  │  announce w/ DID  │  announce w/ DID │           │
│  └──────────────────┼──────────────────┘            │
│                     ↓                               │
│  2. Collect announcements (800ms window)            │
│  3. Show wallet picker to user                      │
│  4. User picks → navigator.credentials.get (CHAPI)  │
└─────────────────────────────────────────────────────┘
```

## API

### `discoverWallets(timeoutMs?: number): Promise<WalletAnnouncement[]>`

Discover all credential wallet extensions. Dispatches a discover event and collects announcements within the timeout window (default 800ms).

### `registerWallet(wallet: WalletAnnouncement): void`

Register your wallet extension to respond to discovery events. Call once in your content script's MAIN world.

### `WalletAnnouncement`

```ts
interface WalletAnnouncement {
  did: string              // Wallet's own DID
  name: string             // Human-readable name
  icon: string             // Icon URL (SVG or PNG, 64x64)
  version: string          // Semantic version
  protocols: WalletProtocol[]  // Supported protocols
  maintainer: WalletMaintainer
  url?: string             // Homepage / docs
}

type WalletProtocol = 'chapi' | 'didcomm-v2' | 'oid4vp' | 'waci-didcomm'

interface WalletMaintainer {
  name: string
  did?: string
  url?: string
}
```

### Event Constants

```ts
import { DISCOVER_EVENT, ANNOUNCE_EVENT } from 'credential-wallet-connector'
// 'credential-wallet:discover'
// 'credential-wallet:announce'
```

## Writing a Custom Wallet Integration

Any browser extension can participate. Minimal steps:

1. **Install** the package in your extension project
2. **Call `registerWallet()`** in a content script injected into the page's MAIN world
3. **Listen for CHAPI requests** via `navigator.credentials.get` override
4. **Present a consent UI** when a site requests a credential
5. **Return a Verifiable Presentation** with the user's DID as holder

Your wallet's `did` field should be a real, resolvable DID. This is the protocol eating its own dog food — wallets identify themselves the same way users do.

## Supported Protocols

| Protocol | Description |
|---|---|
| `chapi` | W3C Credential Handler API — `navigator.credentials.get()` |
| `didcomm-v2` | DIDComm v2 Present Proof 3.0 |
| `oid4vp` | OpenID for Verifiable Presentations |
| `waci-didcomm` | Wallet And Credential Interaction via DIDComm |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

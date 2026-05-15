# @lokacash/fiat

LokaCash fiat on-ramp & off-ramp SDK for third-party apps.

- **On-Ramp (Deposit)**: Add "user deposits" with **Coinbase** (Privy fundWallet / Coinbase Onramp) and **Onramper**.
- **Off-Ramp (Withdraw)**: Add "user withdrawals" with **MoonPay** — sell crypto and receive fiat.

## Installation

```bash
npm install @lokacash/fiat
```

- **Option A (Privy)**: Your app must also install `@privy-io/react-auth`. We recommend wrapping the app with the SDK's `LokaCashPrivyRoot` (see below).
- **Option B (Direct)**: You only pass the user's wallet address. For Coinbase, optionally install `@coinbase/cbpay-js`. Onramper is configured inside the SDK; no extra dependencies.

---

## On-Ramp (Deposit)

### Option A: Privy (recommended for React)

For React apps that can use Privy. Reuses Privy's `useFundWallet` and supports Onramper in a popup.

#### 1. Root wrapper (recommended: LokaCashPrivyRoot)

The SDK ships with LokaCash's Privy App ID. You only pass the `apiKey` assigned by LokaCash:

```tsx
import { LokaCashPrivyRoot } from '@lokacash/fiat/react';

const LOKACASH_API_KEY = 'your-lokacash-api-key'; // assigned by LokaCash

root.render(
  <LokaCashPrivyRoot apiKey={LOKACASH_API_KEY}>
    <App />
  </LokaCashPrivyRoot>
);
```

`LokaCashPrivyRoot` includes `PrivyProvider`, `LokaCashProvider`, and third-party provider init (e.g. Onramper, MoonPay). You don't need to set a Privy App ID.

#### 2. Optional: Your own Privy app

If you use your own Privy app, wrap with `PrivyProvider` and `LokaCashProvider`:

```tsx
import { PrivyProvider } from '@privy-io/react-auth';
import { LokaCashProvider } from '@lokacash/fiat/react';

const PRIVY_APP_ID = 'your-privy-app-id';
const LOKACASH_API_KEY = 'your-lokacash-api-key';

root.render(
  <PrivyProvider appId={PRIVY_APP_ID}>
    <LokaCashProvider appId={PRIVY_APP_ID} apiKey={LOKACASH_API_KEY}>
      <App />
    </LokaCashProvider>
  </PrivyProvider>
);
```

Install Privy in your app: `npm install @privy-io/react-auth`.

#### 3. Trigger deposit via button or Hook

```tsx
import { LokaCashDepositButton, useLokaCashDeposit } from '@lokacash/fiat/react';

// Option 1: Button (provider: coinbase | onramper)
<LokaCashDepositButton
  amount="100"
  asset="USDC"
  provider="coinbase"
  onSuccess={() => console.log('Deposit done')}
/>

// Option 2: Hook
function MyComponent() {
  const { open, isOpening } = useLokaCashDeposit();
  return (
    <button
      onClick={() =>
        open({
          amount: '50',
          asset: 'USDC',
          preferredProvider: 'onramper', // or 'coinbase'
        })
      }
      disabled={isOpening}
    >
      Deposit
    </button>
  );
}
```

**Requirement**: End users must log in or connect a wallet via Privy before depositing.

### Option B: Direct (no Privy)

For apps using any wallet (MetaMask, WalletConnect, etc.) without Privy. You only pass the user's wallet address.

#### 1. Init

```ts
import { LokaCashDeposit } from '@lokacash/fiat';

LokaCashDeposit.init({
  apiKey: 'your-lokacash-api-key',
  defaultProvider: 'coinbase', // or 'onramper'
});
```

#### 2. Open deposit

After the user has connected a wallet and you have their address:

```ts
await LokaCashDeposit.open({
  address: userAddress,   // 0x... required
  amount: '100',
  asset: 'USDC',
  chainId: 8453,          // optional, default Base
  onSuccess: () => {},
  onError: (err) => console.error(err),
});
```

**Dependencies**:

- **Coinbase**: Install `@coinbase/cbpay-js` and configure Coinbase Onramp appId (can differ from apiKey; pass via init when we support it).
- **Onramper**: Configured inside the SDK; no install or config needed in your app.

---

## Off-Ramp (Withdraw) — MoonPay

Sell crypto from the user's wallet and receive fiat via **MoonPay**. The SDK opens MoonPay's sell widget in a popup window.

### Option A: Privy (React)

If you are using `LokaCashPrivyRoot`, MoonPay is already configured. Use the withdraw button or hook directly:

```tsx
import { LokaCashWithdrawButton, useLokaCashWithdraw } from '@lokacash/fiat/react';

// Option 1: Button
<LokaCashWithdrawButton
  crypto="eth"
  fiat="usd"
  onSuccess={() => console.log('Withdraw flow opened')}
  onError={(e) => console.error(e)}
>
  Sell ETH → USD
</LokaCashWithdrawButton>

// Option 2: Hook
function MyComponent() {
  const { open, isOpening } = useLokaCashWithdraw();
  return (
    <button
      onClick={() =>
        open({
          crypto: 'usdc',
          fiat: 'usd',
          amount: '100',
        })
      }
      disabled={isOpening}
    >
      Withdraw
    </button>
  );
}
```

### Option B: Direct (no Privy)

```ts
import { LokaCashWithdraw } from '@lokacash/fiat';

// 1. Init with MoonPay API key
LokaCashWithdraw.init({
  apiKey: 'pk_live_your_moonpay_key',
  defaultFiat: 'usd',
  defaultCrypto: 'ETH',
});

// 2. Open sell flow
await LokaCashWithdraw.open({
  address: userAddress,   // 0x... required
  crypto: 'eth',
  fiat: 'usd',
  amount: '0.5',
  onSuccess: () => {},
  onError: (err) => console.error(err),
});
```

### Option C: Direct function call

For maximum control, use `openMoonPaySell` directly:

```ts
import { openMoonPaySell, configureThirdPartyProviders } from '@lokacash/fiat';

// Configure MoonPay (or pass apiKeyOverride below)
configureThirdPartyProviders({
  moonpay: { apiKey: 'pk_live_your_moonpay_key' },
});

// Open sell widget
openMoonPaySell({
  walletAddress: '0x...',
  crypto: 'eth',
  fiat: 'usd',
  amount: '0.5',
  theme: 'dark',
});
```

---

## API Summary

### On-Ramp (Deposit)

| Method / Component | Description |
|--------------------|-------------|
| `<LokaCashPrivyRoot apiKey={...}>` | Option A one-step root (includes PrivyProvider + LokaCashProvider; recommended) |
| `<LokaCashProvider>` | Option A manual setup (appId + apiKey) |
| `useLokaCashDeposit()` | React Hook; returns `{ open, isOpening, error }` |
| `<LokaCashDepositButton>` | Option A deposit button |
| `LokaCashDeposit.init(options)` | Init (Option A: pass `privyAppId`; Option B: pass `apiKey` only) |
| `LokaCashDeposit.open(options)` | Option B open deposit; requires `address` |

### Off-Ramp (Withdraw)

| Method / Component | Description |
|--------------------|-------------|
| `useLokaCashWithdraw()` | React Hook; returns `{ open, isOpening, error }` |
| `<LokaCashWithdrawButton>` | React withdraw button (opens MoonPay sell widget) |
| `LokaCashWithdraw.init(config)` | Init off-ramp with MoonPay API key |
| `LokaCashWithdraw.open(options)` | Open sell flow; requires `address` |
| `openMoonPaySell(options)` | Low-level: open MoonPay sell popup directly |

---

## Types

TypeScript types are included; import from the main entry or `@lokacash/fiat/react`:

**Deposit:**
- `DepositProvider`: `'coinbase' | 'onramper'`
- `DepositAsset`: `'USDC' | 'ETH'`
- `LokaCashDepositInitOptions`, `OpenDepositOptionsStandalone`, `OpenDepositOptionsPrivy`

**Withdraw:**
- `WithdrawProvider`: `'moonpay'`
- `WithdrawAsset`: `'USDC' | 'USDT' | 'ETH' | 'BTC'`
- `LokaCashWithdrawConfig`, `OpenWithdrawOptions`

---

## Development

```bash
npm install
npm run build
```

Output is in `dist/`: `dist/index.js` (Option B) and `dist/react.js` (Option A React).

---

## References

- [Privy Funding](https://docs.privy.io/guide/react/funding)
- [Coinbase Onramp](https://docs.cloud.coinbase.com/onramp/docs/overview)
- [Onramper](https://onramper.com/)
- [MoonPay Sell](https://docs.moonpay.com/moonpay/implementation-guide/off-ramp)

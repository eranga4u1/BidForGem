# @gem/mobile — BidForGem (Expo / React Native)

The iOS + Android app for the Gem auction platform. Built with **Expo (SDK 57)**
and **expo-router**, it reuses the shared `@gem/api-client` and `@gem/types`
packages and talks to the same API as the web app — including live bidding over
Socket.IO.

## Screens

- **Browse** (`app/index.tsx`) — live auctions from the API, pull-to-refresh.
- **Auction room** (`app/auctions/[id].tsx`) — server-driven countdown, live
  `bid:placed` / `auction:extended` / `auction:closed` updates over the socket,
  optimistic bidding with rollback on rejection.
- **Auth** (`app/login.tsx`, `app/register.tsx`) — access token in memory,
  refresh token in the OS keychain via `expo-secure-store`.

## Run it

The shared packages are consumed as built output, so build them once first:

```bash
# from the repo root
pnpm build            # builds @gem/types + @gem/api-client (and everything else)
pnpm --filter @gem/mobile start
```

Then press `a` (Android emulator), `i` (iOS simulator, macOS only), or scan the
QR code with the **Expo Go** app on your phone.

### Pointing at a different API

Defaults to the hosted API. Override per run with env vars (Expo inlines
`EXPO_PUBLIC_*` at build time):

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000 pnpm --filter @gem/mobile start
```

> On a physical device, `localhost` refers to the phone — use your machine's LAN
> IP for a local API.

## Building for the stores

Use **EAS Build** (no Mac required for the cloud build):

```bash
npm i -g eas-cli
eas build --platform android    # .aab for Google Play
eas build --platform ios        # .ipa (needs an Apple Developer account)
```

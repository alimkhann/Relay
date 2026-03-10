# Relay Production Setup

## Live app

- Web app: `https://relay-neon-kappa.vercel.app`
- Neon Auth base URL: `https://ep-broad-glitter-ag5sv14w.neonauth.c-2.eu-central-1.aws.neon.tech/neondb/auth`

## Google OAuth for Neon Auth

Create a Google OAuth client in Google Cloud Console.

- Application type: `Web application`
- Authorized JavaScript origins:
  - `https://relay-neon-kappa.vercel.app`
- Authorized redirect URIs:
  - `https://neonauth.c-2.eu-central-1.aws.neon.tech/auth/oauth/callback/google`

After Google issues the client:

1. Open Neon project `shiny-term-32281581`.
2. Go to `Auth` -> `Configuration`.
3. Open the Google provider.
4. Replace shared keys with your own `Client ID` and `Client Secret`.
5. Add the production app domain if it is not already listed:
   - `https://relay-neon-kappa.vercel.app`

## Vercel production env

These are already configured on the `relay` Vercel project:

- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`
- `NEON_AUTH_BASE_URL`
- `NEXT_PUBLIC_NEON_AUTH_URL`
- `NEON_AUTH_COOKIE_SECRET`
- `NEXT_PUBLIC_RELAY_APP_URL=https://relay-neon-kappa.vercel.app`

## Production extension build

Build command:

```bash
pnpm build:extension:prod
```

Unpacked extension directory:

- `apps/extension/build/chrome-mv3-prod`

The production extension build defaults to:

- API base: `https://relay-neon-kappa.vercel.app`

## First-run extension flow

1. Sign in on the live app.
2. Open `/settings`.
3. Create an extension token.
4. Load `apps/extension/build/chrome-mv3-prod` in `chrome://extensions`.
5. Open the Relay popup.
6. Confirm the API base matches the live app.
7. Paste the token once.
8. Load projects and bind the active tab.

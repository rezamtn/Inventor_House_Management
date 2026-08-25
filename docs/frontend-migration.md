# Authenticated frontend migration

The browser calls same-origin Vercel functions. The functions hold the VPS API token, validate an HttpOnly session cookie, and proxy inventory and push-subscription requests to the VPS. Never expose `INVENTORY_API_TOKEN`, `SESSION_SECRET`, `APP_PASSWORD_HASH`, `CRON_SECRET`, or `VAPID_PRIVATE_KEY` through a `VITE_` variable.

## Required Vercel environment variables

- `APP_ORIGIN=https://inventor-house-management.vercel.app`
- `APP_PASSWORD_HASH` and `SESSION_SECRET`: run `npm run generate-auth-secrets` and store the generated login password in a password manager.
- `INVENTORY_API_URL=https://inventory-api.motmaenqa.com`
- `INVENTORY_API_TOKEN`: copy privately from `/opt/inventory-api/.env` on the VPS.
- `CRON_SECRET`: a separate `openssl rand -hex 32` value.
- `VAPID_SUBJECT`: a `mailto:` address.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VITE_VAPID_PUBLIC_KEY`: run `npm run generate-vapid-keys`; the two public values are identical.

Generate secrets locally and never paste secret values into issues, commits, logs, or chat. Configure Production and Preview separately in Vercel. A preview login requires `APP_ORIGIN` to equal that preview's exact origin.

## Safe rollout order

1. Deploy the updated VPS API and verify `/api/push-subscriptions` with the bearer token.
2. Configure every Vercel environment variable.
3. Deploy a Vercel preview, test login, GET, PUT conflict handling, logout, and Push subscription.
4. Promote the tested deployment to production.
5. Re-enable browser notifications after VAPID rotation; old subscriptions use the compromised key and must be recreated.
6. Only after production verification, disable the old Supabase policies/project.

## Rollback

Redeploy the previous Vercel production deployment. The VPS inventory API and PostgreSQL data remain unchanged. Do not restore the compromised VAPID private key; leave Push disabled until the new key is configured.

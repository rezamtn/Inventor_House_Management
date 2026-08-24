# Inventory API deployment

This directory is a deployment bundle for the VPS. It does not modify the frontend.

## Security model

- The API publishes no host port. Only Caddy can reach it over the existing Docker proxy network.
- The API reaches PostgreSQL over PostgreSQL's existing private Docker network. Port 5432 stays non-public.
- The container runs as the unprivileged `node` user with a read-only filesystem, all Linux capabilities dropped, and `no-new-privileges`.
- Both inventory routes require a random bearer token. This token is suitable for deployment testing and a trusted server-side client. It must never be embedded in browser JavaScript; add real user authentication before connecting the frontend.
- PUT requires the ETag returned by GET in `If-Match`, preventing silent lost updates.

## 1. Read-only discovery on the VPS

```bash
docker inspect postgres --format '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{"\\n"}}{{end}}'
docker inspect caddy --format '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}{{"\\n"}}{{end}}'
docker inspect caddy --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

Record the PostgreSQL network name, Caddy network name, and host path of the Caddyfile. If the Caddy container has a different name, substitute it in the commands.

## 2. Install files

Copy this directory to `/opt/inventory-api`, then on the VPS:

```bash
cd /opt/inventory-api
cp .env.example .env
chmod 600 .env
nano .env
```

Set the two discovered network names, the existing `personal_app_user` password, a generated API token, and the exact frontend origin:

```bash
openssl rand -hex 32
```

Do not paste `.env` into chat or commit it. Confirm permissions:

```bash
stat -c '%a %U:%G %n' /opt/inventory-api/.env
```

Expected mode is `600`, owned by root.

## 3. Build and start privately

```bash
cd /opt/inventory-api
docker compose config --quiet
docker compose build
docker compose up -d
docker compose ps
docker compose logs --tail=100 inventory-api
```

Confirm there is no published port and the health check becomes healthy:

```bash
docker port inventory-api
docker inspect inventory-api --format '{{json .State.Health}}'
docker exec inventory-api node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{console.log(r.status,await r.text());if(!r.ok)process.exit(1)}).catch(e=>{console.error(e);process.exit(1)})"
```

`docker port inventory-api` should print nothing; the health request should return HTTP 200.

## 4. Add Caddy HTTPS routing

Create the DNS `A`/`AAAA` record for the chosen API subdomain first. Back up the discovered Caddyfile, add the dedicated-subdomain block from `Caddyfile.snippet`, then validate before reloading:

```bash
cp --preserve=all /path/to/Caddyfile /path/to/Caddyfile.before-inventory-api
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
docker logs --tail=100 caddy
```

Do not reload if validation fails. If using the existing domain path instead, place the alternative `handle /api/*` block inside that site's existing block. Ensure both Caddy and `inventory-api` share the configured Caddy network.

## 5. End-to-end checks

Load the token locally without printing it:

```bash
cd /opt/inventory-api
set -a
. ./.env
set +a
API_BASE=https://inventory-api.motmaenqa.com
```

Health and unauthorized access:

```bash
curl --fail-with-body --silent --show-error "$API_BASE/api/health"
curl --silent --show-error -o /dev/null -w '%{http_code}\n' "$API_BASE/api/inventory"
```

Expected: health `200`, unauthenticated inventory `401`.

Authenticated GET while saving the exact ETag:

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $API_TOKEN" \
  -D /tmp/inventory-headers \
  "$API_BASE/api/inventory" \
  -o /tmp/inventory-response.json

grep -i '^etag:' /tmp/inventory-headers
```

Before testing PUT, preserve the returned data and ETag. A no-op PUT can then verify the write route; it changes only `updated_at`:

```bash
ETAG=$(awk 'BEGIN{IGNORECASE=1} /^etag:/{gsub("\\r",""); sub(/^[^:]+:[[:space:]]*/,""); print; exit}' /tmp/inventory-headers)
jq '.data' /tmp/inventory-response.json > /tmp/inventory-data.json

curl --fail-with-body --silent --show-error \
  -X PUT \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "If-Match: $ETAG" \
  --data-binary @/tmp/inventory-data.json \
  "$API_BASE/api/inventory"
```

Delete the temporary response files afterward because inventory data may be private:

```bash
shred -u /tmp/inventory-headers /tmp/inventory-response.json /tmp/inventory-data.json 2>/dev/null || rm -f /tmp/inventory-headers /tmp/inventory-response.json /tmp/inventory-data.json
unset API_TOKEN DB_PASSWORD
```

## 6. Optional tighter database grant

This API needs only `SELECT` and `UPDATE` on `app.inventory`. After confirming that no other runtime component uses the same role for inserts/deletes, an owner/admin may reduce grants. Do not run this if `personal_app_user` is shared by another service that needs the current permissions.

```sql
REVOKE INSERT, DELETE ON app.inventory FROM personal_app_user;
```

`push_subscriptions` grants are left unchanged because those endpoints are outside this first API.

## Rollback

Application rollback (does not touch database data):

```bash
cd /opt/inventory-api
docker compose down
```

Restore the Caddyfile backup and validate/reload it. The frontend still uses Supabase at this stage, so stopping this API has no user-facing data-path impact. Keep `/opt/inventory-api/.env` for a quick recovery, or securely remove it only if abandoning the deployment. No database schema rollback is required because this deployment creates no tables or migrations.

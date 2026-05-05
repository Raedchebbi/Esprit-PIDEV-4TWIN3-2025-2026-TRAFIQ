# Production Security Configuration

## Required Secrets

Set these through your secret manager, Kubernetes Secret, or CI/CD secret store. Do not commit real values.

- `JWT_SECRET`: long random signing secret for admin JWTs.
- `AI_WS_TOKEN`: long random shared producer token used by the Python AI engine Socket.IO handshake.
- `GROQ_API_KEY`: required by the AI engine when `ENABLE_RISK_ASSESSMENT=true`.
- `MONGODB_URI`: required when MongoDB is enabled.
- `REDIS_PASSWORD`: required if your Redis deployment uses authentication.

## Initial Admin Seeding

Production no longer seeds hardcoded demo credentials.

When no users exist, production behavior is:

- If `INITIAL_SUPER_ADMIN_EMAIL` and `INITIAL_SUPER_ADMIN_PASSWORD` are set, one `SUPER_ADMIN` is created.
- If either variable is missing, seeding is skipped and a warning is logged.

Local development behavior is:

- Demo users are seeded only when `NODE_ENV !== production` and `SEED_DEMO_USERS` is not `false`.
- Set `SEED_DEMO_USERS=false` to disable local demo users.

## HTTP Rate Limits

Configured via environment variables:

- `RATE_LIMIT_LOGIN_LIMIT`, `RATE_LIMIT_LOGIN_TTL_MS`
- `RATE_LIMIT_NAV_START_LIMIT`, `RATE_LIMIT_NAV_START_TTL_MS`
- `RATE_LIMIT_NAV_UPDATE_LIMIT`, `RATE_LIMIT_NAV_UPDATE_TTL_MS`
- `RATE_LIMIT_NAV_END_LIMIT`, `RATE_LIMIT_NAV_END_TTL_MS`
- `RATE_LIMIT_PUBLIC_ROUTE_LIMIT`, `RATE_LIMIT_PUBLIC_ROUTE_TTL_MS`

Defaults are conservative enough for local usage and intended to limit brute force and public endpoint abuse.

## WebSocket Rate Limits

Configured via environment variables:

- `RATE_LIMIT_AI_WS_LIMIT`, `RATE_LIMIT_AI_WS_TTL_MS`
- `RATE_LIMIT_PUBLIC_WS_POSITION_LIMIT`, `RATE_LIMIT_PUBLIC_WS_POSITION_TTL_MS`
- `RATE_LIMIT_PUBLIC_WS_SUBSCRIBE_LIMIT`, `RATE_LIMIT_PUBLIC_WS_SUBSCRIBE_TTL_MS`

AI producer events are authenticated with `AI_WS_TOKEN` and then rate-limited per socket ID. Public navigation events are rate-limited per socket ID.

## Local vs Production

- `NODE_ENV=production` requires secure seeding configuration and rejects unauthenticated AI producer events.
- Local development keeps explicit demo behavior available, but only outside production.
- API paths and WebSocket event names are unchanged.

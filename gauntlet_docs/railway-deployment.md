# Railway Deployment — Changes & Rationale

This document records all code and configuration changes made to deploy
ShipShape on Railway.com, separate from the original AWS infrastructure.

---

## Background

The application was originally built for AWS (Elastic Beanstalk + Aurora +
CloudFront + S3 + SSM Parameter Store). To make it runnable on Railway, a
number of changes were required. No existing AWS deployment files were
modified — all changes are additive or isolated to Railway-specific files,
except for two targeted fixes in core API code.

---

## New Files Added

### `Dockerfile.railway-api`

A Railway-compatible Dockerfile for the Express API service.

**Why it was needed:** The existing `Dockerfile` is designed for AWS and
expects pre-built `api/dist` and `shared/dist` directories to be present
before the image is built. It also pulls the base image from AWS ECR Public
(`public.ecr.aws/docker/library/node:20-slim`) which is specific to
government/VPN environments. Railway builds from source inside the container,
so a new Dockerfile was created that:

- Uses the standard `node:20-slim` base image
- Builds TypeScript from source inside Docker using `npm` workspaces
  (instead of `pnpm`, which exhibited a YAML null-byte corruption bug
  specific to Railway's build context upload mechanism)
- Rewrites `package.json` at build time to replace pnpm-specific
  `workspace:*` dependency references with `*` so npm can resolve them
- Skips lifecycle scripts (`--ignore-scripts`) to avoid the `postinstall`
  hook that runs `git config` (git is not available in the slim image)

### `Dockerfile.railway-web`

A Railway-compatible Dockerfile for the React frontend service.

**Why it was needed:** The frontend was previously deployed to S3/CloudFront.
Railway serves it as a containerised nginx process. This Dockerfile:

- Uses a multi-stage build: Node.js to compile, nginx:alpine to serve
- Builds shared types then the Vite frontend from source
- Accepts `VITE_API_URL` as a build argument so the API URL is baked into
  the frontend bundle at build time
- Applies the same npm/pnpm workaround as the API Dockerfile

### `web/nginx.conf`

nginx server configuration for serving the React SPA.

**Why it was needed:** nginx needs explicit configuration to handle
client-side routing — without `try_files $uri $uri/ /index.html`, any
direct URL access (e.g. `/issues/123`) returns a 404. Also sets
long-lived cache headers for static assets (JS, CSS, fonts).

---

## Modified Files

### `.devcontainer/post-create.sh`

Added `npm install -g @railway/cli` to the post-create script.

**Why:** The Railway CLI is used to manage Railway services from within the
dev container (deploying, setting env vars, viewing logs). Without adding it
to `post-create.sh`, it is lost every time the dev container is rebuilt.

### `.dockerignore`

Updated exclusion rules for Railway builds.

**Why:** The original `.dockerignore` included `!api/dist` and `!shared/dist`
negation entries (needed by the AWS Dockerfile which copies pre-built
artifacts). These negations were removed since the Railway Dockerfiles build
from source. Additional entries were added to exclude large/unnecessary paths
from the build context: `terraform/`, `*.zip`, `e2e/`, `test-results/`,
`playwright-report/`, `_bmad/`, `gauntlet_docs/`, `plans/`, `research/`.

---

## Core Code Changes

### `api/src/config/ssm.ts` — Skip SSM on non-AWS hosts

**What changed:** Added an early-return check at the top of
`loadProductionSecrets()`:

```typescript
// Skip SSM on non-AWS hosts (Railway sets RAILWAY_ENVIRONMENT automatically)
// Also skip if secrets are already injected via env vars
if (process.env.RAILWAY_ENVIRONMENT || (process.env.DATABASE_URL && process.env.SESSION_SECRET)) {
  console.log('Secrets already present in environment, skipping SSM');
  return;
}
```

**Why:** In production mode, the API startup always attempted to load secrets
from AWS SSM Parameter Store. On Railway (which has no AWS credentials), this
caused an immediate `CredentialsProviderError` crash on every startup. The
fix checks for `RAILWAY_ENVIRONMENT` (automatically injected by Railway into
every service) or for the presence of the critical secrets already in the
environment, and skips the SSM fetch entirely in either case.

**AWS impact:** None. On AWS, `RAILWAY_ENVIRONMENT` is not set, and
`DATABASE_URL` / `SESSION_SECRET` are not pre-populated (they come from SSM),
so the existing SSM path runs unchanged.

### `api/src/app.ts` — Cross-origin session cookie and CSP

**What changed (session cookie):**

```typescript
// Before
sameSite: 'strict',

// After
sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
```

**Why:** On Railway, the frontend (`web-production-*.up.railway.app`) and
API (`api-production-*.up.railway.app`) are on different domains. Browsers
enforce `SameSite=Strict` by refusing to send cookies on cross-site requests,
so the session cookie was never sent from the frontend to the API — causing
login to appear to hang indefinitely. `SameSite=None` allows cross-origin
cookies; it requires `Secure=true`, which is already set in production (and
Railway always uses HTTPS).

**AWS impact:** Minimal. The AWS deployment serves the frontend via
CloudFront in front of Elastic Beanstalk, where the cookie origin is the
same domain. `SameSite=None; Secure` is equally valid there — it is less
restrictive than `Strict` but not insecure given `Secure=true` and
`HttpOnly=true` are both enforced.

**What changed (Content Security Policy):**

```typescript
// Before
connectSrc: ["'self'", "wss:", "ws:"],

// After
connectSrc: ["'self'", "wss:", "ws:", ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : [])],
```

**Why:** The CSP `connectSrc` directive controls which origins the browser
allows `fetch()` and XHR calls to. With the frontend on a different domain
than the API, the API's own domain needed to be explicitly permitted.
`CORS_ORIGIN` is already set to the frontend URL, so reusing it here avoids
hardcoding a Railway-specific URL.

---

## Railway Environment Variables Set

The following env vars were configured on the Railway services via CLI
(not committed to the repo):

| Service | Variable | Value / Notes |
|---|---|---|
| api | `DATABASE_URL` | Internal Railway Postgres URL |
| api | `SESSION_SECRET` | Randomly generated 32-byte hex string |
| api | `NODE_ENV` | `production` |
| api | `PORT` | `3000` |
| api | `CORS_ORIGIN` | `https://web-production-646ab.up.railway.app` |
| web | `VITE_API_URL` | `https://api-production-71a9.up.railway.app` |
| web | `PORT` | `80` (tells Railway's proxy where nginx listens) |

---

## Railway Project Structure

| Service | URL | Notes |
|---|---|---|
| Postgres | (internal only) | Managed Railway PostgreSQL |
| api | `https://api-production-71a9.up.railway.app` | Express + WebSocket |
| web | `https://web-production-646ab.up.railway.app` | React SPA via nginx |

Railway project name: **creative-flow**
Railway account: dianealcorn@gmail.com

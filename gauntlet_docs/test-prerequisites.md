# E2E Test Environment Prerequisites

This document captures environment issues that must be resolved before E2E tests can run successfully in the devcontainer.

---

## 1. Docker Socket Permissions

**Symptom:** All tests fail immediately with:
```
Error: Could not find a working container runtime strategy
```

**Root cause:** The E2E suite uses `@testcontainers/postgresql` to spin up per-worker PostgreSQL containers. The Docker socket at `/var/run/docker.sock` is owned by `root:root` with `0660` permissions. The `node` user (which the devcontainer runs as) cannot connect to it.

**Fix:** `sudo chmod 666 /var/run/docker.sock`

**Persistence:**
- `postCreateCommand` in `.devcontainer/post-create.sh` (line 65) runs this on initial container creation.
- `postStartCommand` in `.devcontainer/devcontainer.json` runs this on every container start, covering Docker daemon restarts.

**Verification:**
```bash
docker info 2>&1 | grep "Server Version"
# Should print: Server Version: 29.x.x
```

---

## 2. IPv6/IPv4 Network Binding Mismatch

**Symptom:** All tests fail with:
```
Error: Server at http://localhost:PORT did not start within 30000ms. Last error: fetch failed
```
Tests show 0 passes and 100% failure rate even though Docker is accessible.

**Root cause:** Vite's preview server (started per worker by `e2e/fixtures/isolated-env.ts`) binds only to the IPv6 loopback `[::1]` by default. Node.js `undici` (the engine behind `fetch`) cannot reliably connect to `[::1]` in this Linux container network namespace — the connection is refused at the socket level even though `ss -tlnp` confirms the port is listening. `curl` succeeds (it tries both IPv4 and IPv6), but `fetch` fails immediately with `ECONNREFUSED`.

**Fix applied in `e2e/fixtures/isolated-env.ts`:**
1. Vite preview spawn includes `--host 127.0.0.1` to bind to IPv4 (already present).
2. `webUrl` uses `http://127.0.0.1:PORT` instead of `http://localhost:PORT`.
3. `apiUrl` uses `http://127.0.0.1:PORT` instead of `http://localhost:PORT`.
4. Server startup timeouts increased from 30s to 45s (Vite's first request can take ~14s in containers).

**Verification:**
```bash
# After a test worker starts, confirm IPv4 binding:
ss -tlnp | grep LISTEN
# Should show 0.0.0.0:PORT, not [::1]:PORT
```

---

## 3. Stale Testcontainers Lock File

**Symptom:** All workers fail with `EACCES: permission denied` on startup.

**Root cause:** If tests were previously run as `root`, the file `/tmp/testcontainers-node.lock` is owned by root and the `node` user cannot acquire it.

**Fix:**
```bash
sudo rm -f /tmp/testcontainers-node.lock
```

**Prevention:** Always run E2E tests as the `node` user, never as `root`.

---

## Quick Start Checklist

Before running E2E tests, verify:

```bash
# 1. Docker is accessible
docker info 2>&1 | grep "Server Version"

# 2. No stale lock files
sudo rm -f /tmp/testcontainers-node.lock

# 3. Run tests (use 2-4 workers)
PLAYWRIGHT_WORKERS=2 npx playwright test
```

If Docker is not accessible, run:
```bash
sudo chmod 666 /var/run/docker.sock
```

# Re-run Benchmarks Guide

This document provides exact instructions for re-running every measurement in all 7 audit categories after improvements have been applied. Each section references the exact commands used in the original audit so results are directly comparable.

**Environment assumption:** All commands run inside the devcontainer (`docker exec ship_devcontainer-app-1 bash -c "..."` from the host, or directly inside the container shell). PostgreSQL is the `postgres` service container reachable at `postgres:5432`.

---

## Prerequisites (run once before any category)

```bash
# Verify PostgreSQL is reachable
node -e "import('pg').then(pg => { const p = new pg.default.Pool({connectionString:'postgres://ship:ship_dev_password@postgres:5432/ship_dev'}); p.query('SELECT 1').then(()=>{console.log('DB OK'); p.end()}); })"

# Verify dataset meets GFA Week 4 minimums (501+ docs, 100+ issues, 10+ sprints, 20+ users)
cd /workspace/api && node -e "
import('pg').then(pg => {
  const pool = new pg.default.Pool({ connectionString: 'postgres://ship:ship_dev_password@postgres:5432/ship_dev' });
  pool.query('SELECT document_type, COUNT(*) as cnt FROM documents GROUP BY document_type ORDER BY cnt DESC')
    .then(r => { r.rows.forEach(row => console.log(row.document_type, row.cnt)); return pool.query('SELECT COUNT(*) FROM documents'); })
    .then(r => { console.log('TOTAL DOCS:', r.rows[0].count); return pool.query('SELECT COUNT(*) FROM users'); })
    .then(r => { console.log('TOTAL USERS:', r.rows[0].count); pool.end(); });
})
"

# If any minimum is not met, re-run the supplemental seeder:
cd /workspace && pnpm db:seed
node /workspace/api/src/db/seed-supplement.mjs
```

---

## Category 1: Type Safety

**What is measured:** Count of `: any`, `as any`, `as SomeType`, `!` non-null assertions, and `@ts-ignore` / `@ts-expect-error` across all TypeScript source files. Compiler error count under strict mode.

```bash
cd /workspace

# --- Violation counts by type and package ---
node -e "
const fs = require('fs');
const path = require('path');
const dirs = ['web/src', 'api/src', 'shared/src'];
let any1=0,any2=0,asType=0,nonNull=0,suppress=0;
const perPkg = {};
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir, {withFileTypes:true})) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) { walk(full); continue; }
    if (!f.name.endsWith('.ts') && !f.name.endsWith('.tsx')) continue;
    const src = fs.readFileSync(full,'utf8');
    const lines = src.split('\n');
    const pkg = dir.split('/')[0];
    if (!perPkg[pkg]) perPkg[pkg]={any1:0,any2:0,asType:0,nonNull:0};
    for (const raw of lines) {
      const line = raw.replace(/\/\/.*/, '').replace(/\/\*.*?\*\//g,'');
      const a1=(line.match(/: any\b/g)||[]).length; any1+=a1; perPkg[pkg].any1+=a1;
      const a2=(line.match(/\bas any\b/g)||[]).length; any2+=a2; perPkg[pkg].any2+=a2;
      const at=(line.match(/\bas [A-Z][a-zA-Z<>\[\]|&.]+/g)||[]).filter(m=>!/as const|as unknown|as any/.test(m)).length; asType+=at; perPkg[pkg].asType+=at;
      const nn=(line.match(/[a-zA-Z0-9_)\]>]!/g)||[]).filter(m=>!m.includes('!=')).length; nonNull+=nn; perPkg[pkg].nonNull+=nn;
      if (/\@ts-(ignore|expect-error)/.test(line)) suppress++;
    }
  }
}
dirs.forEach(walk);
console.log('=== Totals ===');
console.log(': any =', any1, '  as any =', any2, '  as Type =', asType, '  ! =', nonNull, '  suppress =', suppress);
console.log('=== Per package ===');
for (const [k,v] of Object.entries(perPkg)) console.log(k, JSON.stringify(v));
"

# --- Compiler errors (strict mode, both packages) ---
cd /workspace/api && npx tsc --noEmit 2>&1 | tail -3
cd /workspace/web && npx tsc --noEmit 2>&1 | tail -3

# --- Top 10 violation-dense files (any + as + !) ---
grep -rn ': any\|as any\|as [A-Z]\|[a-zA-Z0-9_)]!' \
  web/src api/src --include="*.ts" --include="*.tsx" \
  | cut -d: -f1 | sort | uniq -c | sort -rn | head -10
```

**Baseline to beat:** 878 total violations (web: 284, api: 594, shared: 0). 0 compiler errors.

---

## Category 2: Bundle Size

**What is measured:** Total production bundle size (raw + gzip), chunk count, per-dependency byte contribution, unused dependencies.

```bash
cd /workspace/web

# --- Install visualizer if not present ---
pnpm add -D rollup-plugin-visualizer 2>/dev/null || true

# --- Add visualizer to vite.config.ts temporarily ---
# Open web/vite.config.ts and add to the plugins array:
#   import { visualizer } from 'rollup-plugin-visualizer'
#   visualizer({ filename: '/tmp/bundle-stats.json', template: 'raw-data' })
# (Remove it after running the build below)

# --- Production build ---
pnpm build 2>&1 | tee /tmp/build-output.txt

# --- Total sizes ---
du -sh dist/
du -sh dist/assets/
echo "Largest JS chunks:"
ls -lS dist/assets/*.js | awk '{printf "%s KB  %s\n", int($5/1024), $9}' | head -10

# --- Gzip total (from build output) ---
grep -E "gzip|kB" /tmp/build-output.txt | tail -5

# --- Per-dependency size breakdown (requires /tmp/bundle-stats.json from visualizer) ---
node -e "
const d = JSON.parse(require('fs').readFileSync('/tmp/bundle-stats.json','utf8'));
const pkgs = {};
for (const node of d.tree?.children || []) {
  const name = node.id?.split('/node_modules/')[1]?.split('/')[0] || node.id;
  if (!name) continue;
  pkgs[name] = (pkgs[name]||0) + (node.renderedLength||0);
}
const sorted = Object.entries(pkgs).sort(([,a],[,b])=>b-a).slice(0,15);
for (const [k,v] of sorted) console.log((v/1024).toFixed(0).padStart(6)+' KB  '+k);
"

# --- Check for dead dependencies (zero imports) ---
for dep in $(node -e "const d=require('./package.json'); console.log(Object.keys(d.dependencies||{}).join(' '))"); do
  count=$(grep -rl "from ['\"]${dep}" src --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
  [ "$count" -eq 0 ] && echo "UNUSED: $dep"
done

# --- Check for ReactQueryDevtools guard ---
grep -n "ReactQueryDevtools\|react-query-devtools" src/main.tsx

# --- Check for manualChunks / code splitting ---
grep -n "manualChunks\|React\.lazy\|import(" vite.config.ts
```

**Baseline to beat:** 2,073 KB raw / 589 KB gzip, 1 monolithic chunk, `ReactQueryDevtools` unconditionally included (105 KB gz).

---

## Category 3: API Response Time

**What is measured:** P50/P95/P99 latency for 6 key endpoints under c=10/25/50 concurrency with 501+ documents in the database.

### 3a. Start the API server with benchmark-safe rate limits

```bash
# Kill any existing API server
pkill -f 'node dist/index' 2>/dev/null || true
sleep 2

# Build if not already built
cd /workspace/api && pnpm build 2>/dev/null

# Start with E2E_TEST=1 (raises rate limit from 1,000 req/min to 10,000 req/min)
E2E_TEST=1 \
DATABASE_URL=postgres://ship:ship_dev_password@postgres:5432/ship_dev \
SESSION_SECRET=dev-secret-change-in-production \
node dist/index.js > /tmp/api-bench.log 2>&1 &

# Wait for startup, verify health
sleep 4 && curl -s http://127.0.0.1:3000/health
```

### 3b. Authenticate and capture session cookie

```bash
# Get CSRF token and login — saves session cookie to /tmp/bb.jar
CSRF_TOKEN=$(curl -s -c /tmp/bb.jar http://127.0.0.1:3000/api/csrf-token \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')

curl -s -b /tmp/bb.jar -c /tmp/bb.jar \
  -X POST http://127.0.0.1:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{"email":"dev@ship.local","password":"admin123"}' \
  | python3 -c 'import json,sys; print("Login:", json.load(sys.stdin).get("success"))'

SESSION_ID=$(grep 'session_id' /tmp/bb.jar | awk '{print $NF}')

# Verify: should return 501 documents
curl -s -H "Cookie: session_id=$SESSION_ID" http://127.0.0.1:3000/api/documents \
  | python3 -c 'import json,sys; print("doc count:", len(json.load(sys.stdin)))'
```

### 3c. Run all benchmarks

```bash
# Note: -R 100 caps total throughput at 100 req/s to stay under rate limits.
# All responses must be HTTP 200 — verify non2xx=0 in each output line.

SESSION_ID=$(grep 'session_id' /tmp/bb.jar | awk '{print $NF}')
COOKIE="session_id=$SESSION_ID"
BASE=http://127.0.0.1:3000

PARSE='import json,sys
d=json.load(sys.stdin)
lat=d["latency"]
ok=d.get("2xx",0); bad=d.get("non2xx",0)
print("  Req/s="+str(round(d["requests"]["average"]))+"  P50="+str(lat["p50"])+"ms  P95="+str(lat["p97_5"])+"ms  P99="+str(lat["p99"])+"ms  Max="+str(lat["max"])+"ms  2xx="+str(ok)+" non2xx="+str(bad))
'

bench() {
  local label=$1 url=$2 conns=$3
  echo "--- $label c=$conns ---"
  npx autocannon@8 -c "$conns" -d 30 -R 100 --no-progress -j \
    -H "Cookie: $COOKIE" "$url" 2>/dev/null | python3 -c "$PARSE"
}

# Get a sample document and issue ID
DOC_ID=$(curl -s -H "Cookie: $COOKIE" "$BASE/api/documents?limit=1" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')

echo ""
echo "### GET /api/documents"
bench 'documents' "$BASE/api/documents" 10
bench 'documents' "$BASE/api/documents" 25
bench 'documents' "$BASE/api/documents" 50

echo ""
echo "### GET /api/issues"
bench 'issues' "$BASE/api/issues" 10
bench 'issues' "$BASE/api/issues" 25
bench 'issues' "$BASE/api/issues" 50

echo ""
echo "### GET /api/documents/:id"
bench 'doc-single' "$BASE/api/documents/$DOC_ID" 10
bench 'doc-single' "$BASE/api/documents/$DOC_ID" 25
bench 'doc-single' "$BASE/api/documents/$DOC_ID" 50

echo ""
echo "### GET /api/search/mentions?q=feature"
bench 'search' "$BASE/api/search/mentions?q=feature" 10
bench 'search' "$BASE/api/search/mentions?q=feature" 25
bench 'search' "$BASE/api/search/mentions?q=feature" 50

echo ""
echo "### GET /api/projects"
bench 'projects' "$BASE/api/projects" 10
bench 'projects' "$BASE/api/projects" 25
bench 'projects' "$BASE/api/projects" 50

echo ""
echo "### GET /api/weeks"
bench 'weeks' "$BASE/api/weeks" 10
bench 'weeks' "$BASE/api/weeks" 25
bench 'weeks' "$BASE/api/weeks" 50
```

### 3d. Measure payload sizes

```bash
SESSION_ID=$(grep 'session_id' /tmp/bb.jar | awk '{print $NF}')
COOKIE="session_id=$SESSION_ID"
BASE=http://127.0.0.1:3000

for ep in 'documents' 'issues' 'projects' 'weeks'; do
  SIZE=$(curl -s -H "Cookie: $COOKIE" "$BASE/api/$ep" | wc -c)
  echo "/api/$ep: ${SIZE} bytes ($(( SIZE / 1024 )) KB)"
done
```

**Baseline to beat (c=50):** documents P50=175ms/P95=439ms/249KB payload; issues P50=95ms/P95=216ms/152KB payload.

---

## Category 4: Database Query Efficiency

**What is measured:** Query count per user flow, EXPLAIN ANALYZE plans for the three highest-risk queries, index coverage.

### 4a. Enable query logging

```bash
# Run these via the node pg client (no psql binary in container)
cd /workspace/api && node -e "
import('pg').then(pg => {
  const pool = new pg.default.Pool({ connectionString: 'postgres://ship:ship_dev_password@postgres:5432/ship_dev' });
  return pool.query(\"ALTER SYSTEM SET log_statement = 'all'\")
    .then(() => pool.query('ALTER SYSTEM SET log_min_duration_statement = 0'))
    .then(() => pool.query('SELECT pg_reload_conf()'))
    .then(() => { console.log('Query logging enabled'); pool.end(); });
});
"
```

### 4b. Count queries per user flow

For each flow below, clear the Docker log buffer, make one API request, and count the query lines.

```bash
# First, capture baseline log position
docker logs ship_devcontainer-postgres-1 2>&1 | wc -l > /tmp/log-baseline.txt

run_flow() {
  local label=$1
  local url=$2
  local BEFORE=$(docker logs ship_devcontainer-postgres-1 2>&1 | wc -l)
  curl -s -H "Cookie: session_id=$(grep 'session_id' /tmp/bb.jar | awk '{print $NF}')" \
    "http://127.0.0.1:3000/$url" > /dev/null
  sleep 0.3
  local AFTER=$(docker logs ship_devcontainer-postgres-1 2>&1 | wc -l)
  local COUNT=$(docker logs ship_devcontainer-postgres-1 2>&1 | tail -n $(( AFTER - BEFORE )) | grep -c "execute\|statement:" || true)
  echo "$label: ~$COUNT queries (log lines: $(( AFTER - BEFORE )))"
}

run_flow "View document"   "api/documents/$(curl -s -H "Cookie: session_id=$(grep 'session_id' /tmp/bb.jar | awk '{print $NF}')" http://127.0.0.1:3000/api/documents?limit=1 | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["id"])')"
run_flow "List issues"     "api/issues"
run_flow "Sprint board"    "api/weeks"
run_flow "Search content"  "api/search/mentions?q=feature"
run_flow "List projects"   "api/projects"
```

### 4c. EXPLAIN ANALYZE on highest-risk queries

```bash
cd /workspace/api && node -e "
import('pg').then(async pg => {
  const pool = new pg.default.Pool({ connectionString: 'postgres://ship:ship_dev_password@postgres:5432/ship_dev' });
  const ws = (await pool.query('SELECT id FROM workspaces LIMIT 1')).rows[0].id;

  console.log('=== Issues list query ===');
  const r1 = await pool.query(\`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT d.*, u.name as assignee_name
    FROM documents d
    LEFT JOIN users u ON d.properties->>'assignee_id' = u.id::text
    WHERE d.workspace_id = '\${ws}' AND d.document_type = 'issue'
    ORDER BY d.updated_at DESC\`);
  r1.rows.forEach(r => console.log(r['QUERY PLAN']));

  console.log('');
  console.log('=== Search ILIKE query ===');
  const r2 = await pool.query(\`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT id, title, document_type FROM documents
    WHERE workspace_id = '\${ws}' AND title ILIKE '%feature%'
    LIMIT 20\`);
  r2.rows.forEach(r => console.log(r['QUERY PLAN']));

  console.log('');
  console.log('=== Sprint board query ===');
  const r3 = await pool.query(\`EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
    SELECT d.* FROM documents d
    WHERE d.workspace_id = '\${ws}' AND d.document_type = 'sprint'
    ORDER BY d.created_at DESC\`);
  r3.rows.forEach(r => console.log(r['QUERY PLAN']));

  pool.end();
});
"
```

### 4d. Index coverage check

```bash
cd /workspace/api && node -e "
import('pg').then(async pg => {
  const pool = new pg.default.Pool({ connectionString: 'postgres://ship:ship_dev_password@postgres:5432/ship_dev' });
  const r = await pool.query(\"SELECT tablename, indexname, indexdef FROM pg_indexes WHERE tablename IN ('documents','document_associations','users','workspace_memberships') ORDER BY tablename, indexname\");
  r.rows.forEach(row => console.log(row.tablename, '|', row.indexname));
  pool.end();
});
"
```

**Baseline to beat:** Seq Scan on all three EXPLAIN queries; no `pg_trgm` index; `CREATE INDEX` on `(workspace_id, document_type)` or `pg_trgm` should appear in the plan as an Index Scan.

---

## Category 5: Test Coverage

**What is measured:** Unit test pass/fail, E2E pass/fail count, code coverage percentage (if installed).

### 5a. Unit tests

```bash
cd /workspace/api

# Run unit tests (requires PostgreSQL running)
pnpm test 2>&1 | tee /tmp/unit-test-results.txt
grep -E "Tests|passed|failed|duration" /tmp/unit-test-results.txt | tail -5

# Run with coverage (will fail if @vitest/coverage-v8 is not installed)
pnpm test:coverage 2>&1 | tee /tmp/coverage-results.txt
grep -E "%" /tmp/coverage-results.txt | head -20
```

### 5b. E2E tests

**Always use the `/e2e-test-runner` skill — do not run `pnpm test:e2e` directly.**

**Worker count:** The baseline audit was run with **4 workers** (`PLAYWRIGHT_WORKERS=4`). Use 4 workers when re-running to ensure runtime and pass/fail counts are comparable to baseline.

**8-worker results (tested on 16-core / 16 GB Docker Desktop allocation):**
- Runtime: 25.9 min (~32% faster than 4-worker baseline of ~38 min)
- Passed: 812 / Failed: 57 (vs 836 / 33 at 4 workers)
- The higher failure count is caused by increased concurrency stress on the Docker daemon and testcontainer startup timing — not code regressions.
- **Recommendation:** Use 4 workers for baseline comparisons and post-improvement re-runs. Use 8 workers for faster development iteration where absolute failure-count comparability is not required.
- **Critical:** Always run E2E tests as the `node` user (never `root`). The testcontainers reaper writes `/tmp/testcontainers-node.lock`; if this file is owned by root from a prior run, all workers will fail with `EACCES: permission denied`. Fix with: `sudo rm -f /tmp/testcontainers-node.lock && sudo chown -R node:node /workspace/web/dist/ /workspace/test-results/`

```bash
# Count tests and spec files
find /workspace/e2e -name "*.spec.ts" | wc -l
grep -rn "^test\b\|^  test\b" /workspace/e2e --include="*.spec.ts" | wc -l

# Check for empty/TODO tests
grep -rn "test.fixme\|test.skip\|TODO" /workspace/e2e --include="*.spec.ts"

# Derive pass/fail from last completed run results:
python3 -c "
import json, os
path = '/workspace/test-results/progress.jsonl'
if not os.path.exists(path):
    print('No results yet — run E2E suite first')
    exit()
tests = {}
with open(path) as f:
    for line in f:
        e = json.loads(line)
        if 'test' in e: tests[e['test']] = e.get('status', e.get('outcome'))
counts = {}
for v in tests.values(): counts[v] = counts.get(v,0)+1
print('Total:', sum(counts.values()), '| Results:', counts)
"
```

**Baseline to beat:** 836 passed / 33 failed (96.2%); coverage % = unknown (install `@vitest/coverage-v8`).

---

## Category 6: Runtime Error Handling

**What is measured:** HTTP status codes and response bodies for 14 malformed-input test cases; presence of global error middleware and process-level crash guards.

### 6a. Static checks

```bash
# Global error middleware (should be a 4-argument function registered after all routes)
grep -n "err, req, res, next\|app\.use.*err" /workspace/api/src/app.ts

# Process-level crash guards
grep -n "unhandledRejection\|uncaughtException" /workspace/api/src/index.ts /workspace/api/src/app.ts

# try/catch coverage in route handlers
grep -rn "catch" /workspace/api/src/routes --include="*.ts" | wc -l
find /workspace/api/src/routes -name "*.ts" ! -name "*.test.ts" | wc -l
```

### 6b. Live malformed-input tests

The API server must be running. Authenticate first to get a CSRF token.

```bash
BASE=http://127.0.0.1:3000
CSRF=$(curl -s -c /tmp/err-test.jar $BASE/api/csrf-token | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -s -b /tmp/err-test.jar -c /tmp/err-test.jar \
  -X POST $BASE/api/auth/login \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"dev@ship.local","password":"admin123"}' > /dev/null
SID=$(grep 'session_id' /tmp/err-test.jar | awk '{print $NF}')
AUTH="-H 'Cookie: session_id=$SID'"

check() {
  local label=$1; shift
  local result=$(eval "curl -s -o /dev/null -w '%{http_code}' $*")
  echo "$result  $label"
}

check "Non-JSON body → should NOT leak stack trace (expect 400/415, not HTML)" \
  "-X POST $BASE/api/documents -H 'Cookie: session_id=$SID' -H 'X-CSRF-Token: $CSRF' -H 'Content-Type: application/json' --data-raw 'NOT JSON AT ALL'"

check "Missing CSRF token → should NOT leak stack trace (expect 403 JSON, not HTML)" \
  "-X POST $BASE/api/documents -H 'Cookie: session_id=$SID' -H 'Content-Type: application/json' -d '{}'"

check "Invalid UUID path → should be 400, not 500" \
  "-X PATCH $BASE/api/documents/not-a-uuid -H 'Cookie: session_id=$SID' -H 'X-CSRF-Token: $CSRF' -H 'Content-Type: application/json' -d '{\"title\":\"test\"}'"

check "Oversized title → should be 400" \
  "-X POST $BASE/api/documents -H 'Cookie: session_id=$SID' -H 'X-CSRF-Token: $CSRF' -H 'Content-Type: application/json' -d '{\"title\":\"'$(python3 -c 'print(\"A\"*100000)')\"}'"

check "Unauthenticated GET → should be 401" \
  "http://127.0.0.1:3000/api/documents"

check "Empty body POST → confirm behavior (200 = no validation; 400 = validation added)" \
  "-X POST $BASE/api/documents -H 'Cookie: session_id=$SID' -H 'X-CSRF-Token: $CSRF' -H 'Content-Type: application/json' -d '{}'"

# For non-JSON and missing-CSRF cases, verify the response body is JSON (not HTML stack trace):
echo ""
echo "=== Non-JSON body response (must be JSON, must NOT contain 'at Object' or file paths) ==="
curl -s -X POST $BASE/api/documents \
  -H "Cookie: session_id=$SID" -H "X-CSRF-Token: $CSRF" \
  -H "Content-Type: application/json" \
  --data-raw 'NOT JSON AT ALL' | head -3

echo ""
echo "=== Missing CSRF response (must be JSON, must NOT contain stack trace) ==="
curl -s -X POST $BASE/api/documents \
  -H "Cookie: session_id=$SID" \
  -H "Content-Type: application/json" -d '{}' | head -3
```

**Baseline to beat:** Non-JSON body and missing CSRF must return JSON (not HTML with stack traces). Invalid UUID must return 400, not 500.

---

## Category 7: Accessibility

**What is measured:** Lighthouse accessibility score per page; axe-core WCAG 2.1 AA violation count and details; static button/ARIA counts.

### 7a. Ensure the frontend preview server is running

```bash
# Vite preview serves the production build on port 4173
ss -tlnp | grep 4173 || echo "Preview server not running"

# If not running:
cd /workspace/web && pnpm build && pnpm preview --host 127.0.0.1 --port 4173 &
sleep 3
```

### 7b. Get an authenticated session cookie for the preview server

```bash
# The preview server proxies /api to the running API (must be running on :3000)
CSRF=$(curl -s -c /tmp/a11y.jar http://127.0.0.1:3000/api/csrf-token \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
curl -s -b /tmp/a11y.jar -c /tmp/a11y.jar \
  -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"email":"dev@ship.local","password":"admin123"}' > /dev/null
SID=$(grep 'session_id' /tmp/a11y.jar | awk '{print $NF}')
echo "Session: ${SID:0:20}..."
```

### 7c. axe-core WCAG 2.1 AA audit

```bash
# Run axe-core via Playwright on 4 pages
cat > /tmp/axe-run.mjs << 'EOF'
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'fs';

const jar = readFileSync('/tmp/a11y.jar', 'utf8');
const sidLine = jar.split('\n').find(l => l.includes('session_id'));
const sid = sidLine ? sidLine.trim().split(/\s+/).pop() : '';

const PAGES = [
  { name: 'Login/redirect', url: 'http://127.0.0.1:4173/login' },
  { name: 'Issues list',    url: 'http://127.0.0.1:4173/issues' },
  { name: 'Projects list',  url: 'http://127.0.0.1:4173/projects' },
  { name: 'Issue detail',   url: 'http://127.0.0.1:4173/documents' },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
for (const { name, url } of PAGES) {
  const ctx = await browser.newContext({
    storageState: { cookies: [{ name:'session_id', value: sid, domain:'127.0.0.1', path:'/', httpOnly:true, secure:false, sameSite:'Strict' }] }
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a','wcag2aa','wcag21aa'])
    .analyze();
  const viols = results.violations;
  const counts = { critical:0, serious:0, moderate:0, minor:0 };
  for (const v of viols) counts[v.impact] = (counts[v.impact]||0) + 1;
  console.log(`\n${name}: ${viols.length} violations`, JSON.stringify(counts));
  for (const v of viols) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`);
  }
  await ctx.close();
}
await browser.close();
EOF

cd /workspace && node /tmp/axe-run.mjs 2>/dev/null
```

### 7d. Lighthouse accessibility scores

```bash
cat > /tmp/lh-run.mjs << 'EOF'
import lighthouse from '/root/.npm/_npx/0f94ee7615faf582/node_modules/lighthouse/core/index.js';
import * as chromeLauncher from '/root/.npm/_npx/0f94ee7615faf582/node_modules/chrome-launcher/dist/chrome-launcher.js';
import { readFileSync } from 'fs';

const jar = readFileSync('/tmp/a11y.jar', 'utf8');
const sidLine = jar.split('\n').find(l => l.includes('session_id'));
const sid = sidLine ? sidLine.trim().split(/\s+/).pop() : '';
const COOKIE = `session_id=${sid}`;
const CHROME = '/home/node/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome';

async function run(url) {
  const chrome = await chromeLauncher.launch({
    chromePath: CHROME,
    chromeFlags: ['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu']
  });
  const result = await lighthouse(url, {
    logLevel: 'silent', output: 'json',
    onlyCategories: ['accessibility'], port: chrome.port,
    extraHeaders: { Cookie: COOKIE },
  });
  await chrome.kill();
  return Math.round(result.lhr.categories.accessibility.score * 100);
}

const pages = [
  { name: 'Issues list', url: 'http://localhost:4173/issues' },
  { name: 'Projects list', url: 'http://localhost:4173/projects' },
  { name: 'Docs/Wiki', url: 'http://localhost:4173/docs' },
];

for (const { name, url } of pages) {
  const score = await run(url);
  console.log(`${name}: ${score}/100`);
}
EOF

node /tmp/lh-run.mjs 2>/dev/null
```

### 7e. Static ARIA / button counts

```bash
cd /workspace/web/src

# Total <button> elements
grep -rn "<button" --include="*.tsx" | wc -l

# Buttons with explicit aria-label
grep -rn "aria-label=" --include="*.tsx" | wc -l

# Skip navigation link
grep -rn "skip.*nav\|Skip to main\|#main-content" --include="*.tsx" -i | wc -l

# Custom role="dialog" (not Radix)
grep -rn 'role="dialog"' --include="*.tsx"

# Missing global error boundaries
grep -rn "ErrorBoundary\|componentDidCatch" --include="*.tsx" | wc -l
```

**Baseline to beat:** Lighthouse 100/100 on all pages; 0 axe violations on issues page; fix `color-contrast` violations on projects page (12 nodes) and issue detail (3 nodes); add skip-nav link.

---

## Interpreting Results

When comparing re-run numbers against the baseline:

| Category | Green (improvement) | Red (regression) |
|---|---|---|
| 1 Type Safety | Total violations < 878 | New compiler errors |
| 2 Bundle Size | Main chunk gzip < 589 KB | Any new unconditional prod-only dependency |
| 3 API Response Time | Documents list P50 c=50 < 175ms; issues payload < 152 KB | Any endpoint P95 c=10 > 200ms |
| 4 DB Query Efficiency | ILIKE plan shows Index Scan (not Seq Scan) | New Seq Scan on large table |
| 5 Test Coverage | Fewer than 33 E2E failures; coverage % reported | Pass rate < 96.2% |
| 6 Runtime Error Handling | Non-JSON / missing-CSRF returns JSON (not HTML); invalid UUID returns 400 | Any new 5xx on malformed input |
| 7 Accessibility | axe violations = 0; Lighthouse still 100/100 | Any new violation; Lighthouse score drop |

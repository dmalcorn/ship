# Story 8.4: Deploy Improved Fork to AWS

Status: ready-for-dev

## Story

As a Gauntlet submitter,
I want the improved fork deployed and publicly accessible,
So that graders can verify the live application works end-to-end with all 7 improvements applied.

## Acceptance Criteria

1. **Given** all 7 code epics (Epics 1–7) are merged to `master` on the fork
   **When** `./scripts/deploy.sh prod` and `./scripts/deploy-frontend.sh prod` are run
   **Then** the application is accessible at the public URL and the health check endpoint returns 200

2. **Given** the deployment is complete
   **Then** the deployed application URL is documented in the README and in `gauntlet_docs/submission.md`

3. **Given** all 7 improvement branches exist on the fork's GitHub
   **Then** all branch names are preserved for reviewer inspection (`fix/error-handling`, `fix/bundle-size`, `fix/test-coverage`, `fix/accessibility`)

## Tasks / Subtasks

- [ ] Task 1: Pre-deployment — merge all fix branches to master (AC: #1)
  - [ ] **CRITICAL PREREQUISITE:** Confirm all 7 epics are done before proceeding
  - [ ] Check CLAUDE.md for branch status:
    - `fix/error-handling` — ✅ already merged to master
    - `fix/bundle-size` (covers Cat 2, 3, 4, 1) — needs merge
    - `fix/test-coverage` (Cat 5) — needs merge
    - `fix/accessibility` (Cat 7) — needs merge
  - [ ] For each unmerged branch:
    ```bash
    git checkout master
    git merge fix/bundle-size
    git merge fix/test-coverage
    git merge fix/accessibility
    ```
  - [ ] After all merges, run `pnpm build` to confirm master builds cleanly
  - [ ] Run `pnpm test` to confirm 0 unit test failures on master
  - [ ] Push master to the fork's GitHub remote

- [ ] Task 2: Push all fix branches to GitHub (AC: #3)
  - [ ] `git push origin fix/bundle-size`
  - [ ] `git push origin fix/test-coverage`
  - [ ] `git push origin fix/accessibility`
  - [ ] `fix/error-handling` was already pushed — verify it's still on remote

- [ ] Task 3: Deploy backend to Elastic Beanstalk (AC: #1)
  - [ ] Confirm AWS CLI is configured: `aws sts get-caller-identity`
  - [ ] Run: `./scripts/deploy.sh prod`
  - [ ] Wait for deployment to complete (script handles EB environment update)
  - [ ] Verify health check: `curl http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/health`
  - [ ] Expected response: `{"status":"ok"}` with HTTP 200

- [ ] Task 4: Deploy frontend to S3/CloudFront (AC: #1)
  - [ ] Run: `./scripts/deploy-frontend.sh prod`
  - [ ] Wait for CloudFront invalidation to complete
  - [ ] Verify the frontend loads: open `https://ship.awsdev.treasury.gov` in browser (or use curl to check HTTP 200)

- [ ] Task 5: Document the deployed URLs (AC: #2)
  - [ ] Create or update `gauntlet_docs/submission.md` with:
    ```
    ## Deployed Application
    - Frontend: https://ship.awsdev.treasury.gov
    - API health: http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/health
    - Swagger UI: http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/api/docs
    ```
  - [ ] Update `README.md` to include the deployed URL (Story 8.2 should have a placeholder)
  - [ ] Commit: `docs: add deployed application URLs to submission.md and README`
  - [ ] Update sprint-status.yaml: `8-4-deploy-improved-fork-to-aws: done`

## Dev Notes

### Branch Structure

Per CLAUDE.md, the fix branches are:

| Branch | Categories Covered | Status |
|--------|-------------------|--------|
| `fix/error-handling` | Cat 6: Runtime error handling | ✅ Merged to master |
| `fix/bundle-size` | Cat 2 + Cat 3 + Cat 4 + Cat 1 (bundle, API time, DB efficiency, type safety) | On branch, needs merge |
| `fix/test-coverage` | Cat 5: Test coverage | On branch, needs merge |
| `fix/accessibility` | Cat 7: Accessibility | On branch, needs merge |

### Deploy Scripts Behavior

From `scripts/deploy.sh`:
- Pulls Terraform config from AWS SSM Parameter Store
- Packages the API into a zip and uploads to S3
- Deploys to Elastic Beanstalk (prod environment: `ship-api-prod`)
- Uses app name `ship-api` for prod

From `scripts/deploy-frontend.sh`:
- Syncs Terraform outputs for S3 bucket name + CloudFront distribution ID
- Builds the frontend with `pnpm build`
- Syncs to S3, then invalidates CloudFront cache

### Known URLs (from CLAUDE.md)

```
Prod API:  http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/health
Prod Web:  https://ship.awsdev.treasury.gov
```

Confirm these are correct for the **fork** before deploying — they may differ from the upstream repo's URLs.

### Pre-Deploy Checklist

Before running deploy scripts, verify:
- [ ] `pnpm build` succeeds on master with all branches merged
- [ ] `pnpm test` returns 0 failures
- [ ] `git log --oneline master` shows all fix branch commits

### `submission.md` Template

Create `gauntlet_docs/submission.md`:

```markdown
# ShipShape Week 4 — Submission Checklist

## Deployed Application

- **Frontend:** https://ship.awsdev.treasury.gov
- **API health check:** http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/health
- **Swagger UI:** http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/api/docs

## Fix Branches (for reviewer inspection)

- `fix/error-handling` — Cat 6 runtime error handling (merged to master)
- `fix/bundle-size` — Cat 2, 3, 4, 1 (bundle size, API response time, DB efficiency, type safety)
- `fix/test-coverage` — Cat 5 test coverage
- `fix/accessibility` — Cat 7 accessibility

## Deliverables

- [ ] Discovery write-up: `gauntlet_docs/discovery-writeup.md`
- [ ] Improvement docs: `gauntlet_docs/improvements/` (cat1–cat7)
- [ ] Orientation checklist: `gauntlet_docs/ShipShape_codebase_orientation_checklist.md`
- [ ] AI cost analysis: `gauntlet_docs/ai-cost-analysis.md`
- [ ] Demo video: [URL]
- [ ] Social post: [URL]
```

### Commit Message

```
chore: deploy improved fork to AWS prod (all 7 epics merged)
```

### References

- [Source: CLAUDE.md] — Branch status and deploy commands
- [Source: scripts/deploy.sh] — Backend deploy implementation
- [Source: scripts/deploy-frontend.sh] — Frontend deploy implementation
- [Source: gauntlet_docs/ShipShape-fix-plan.md] — Categories and branch requirements

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `gauntlet_docs/submission.md` (created)
- `README.md` (updated with deployed URL)

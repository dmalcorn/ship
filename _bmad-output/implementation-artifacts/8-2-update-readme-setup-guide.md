# Story 8.2: Update README Setup Guide

Status: ready-for-dev

> **YOLO mode:** This story is authorized for full YOLO permissions. All work is README editing only — no code changes, no deploys, no destructive operations. Proceed autonomously through all tasks without pausing for confirmation.

## Story

As a new developer or reviewer evaluating the fork,
I want a complete setup guide in the repository README,
So that anyone can clone, configure, and run the application locally without guessing at missing steps.

## Acceptance Criteria

1. **Given** the README is updated
   **When** a developer follows the guide on a fresh machine
   **Then** they can successfully: clone the repo, install prerequisites (Node 20+, pnpm, local PostgreSQL — NOT Docker), configure `.env.local`, run `pnpm dev`, and run `pnpm test`

2. **Given** the guide documents steps NOT in the original README
   **Then** it explicitly covers: local PostgreSQL setup (not Docker), correct seed/migrate order (migrate before seed), `pnpm dev` auto-database-creation behavior, and the correct default login credentials

3. **Given** the deployed application URL is known (completed in Story 8.4)
   **Then** the deployed URL is included in the README and in `gauntlet_docs/submission.md`

4. **Given** the README is committed to master
   **Then** it replaces the outdated Docker-based setup instructions with the local PostgreSQL workflow used in this fork

## Tasks / Subtasks

- [ ] Task 1: Audit the current README gaps (AC: #1, #2)
  - [ ] Read the current `README.md` Setup section
  - [ ] Compare against `CLAUDE.md` — the authoritative description of how `pnpm dev` actually works
  - [ ] Read `gauntlet_docs/ShipShape_codebase_orientation_checklist.md` section on Repository Overview for documented deviations
  - [ ] Read `gauntlet_docs/readme_improved.md` — a draft improved README already exists, use it as the base
  - [ ] Identify all gaps: Docker references, wrong seed/migrate order, missing `.env.local` instructions, missing PostgreSQL setup

- [ ] Task 2: Update `README.md` Getting Started section (AC: #1, #2)
  - [ ] Replace the Docker/docker-compose setup instructions with local PostgreSQL setup
  - [ ] Correct the prerequisite list: Node.js 20+, pnpm, **PostgreSQL 14+** (installed locally — no Docker)
  - [ ] Fix the setup steps to match the actual workflow:
    ```bash
    # 1. Clone
    git clone <your-fork-url>
    cd ship

    # 2. Install dependencies
    pnpm install

    # 3. Configure environment
    cp api/.env.example api/.env.local
    # Edit api/.env.local to set DATABASE_URL (pnpm dev creates the DB automatically)

    # 4. Start the app (auto-creates database, runs migrations, seeds on first run)
    pnpm dev
    ```
  - [ ] Document that `pnpm dev` handles: DB creation, migrations, seed on fresh databases, and port auto-discovery
  - [ ] Document the correct login credentials: `dev@ship.local` / `admin123`
  - [ ] Add the Swagger UI URL: `http://localhost:3000/api/docs`

- [ ] Task 3: Add deployed application URL (AC: #3)
  - [ ] **WAIT:** This step depends on Story 8.4 (Deploy to AWS). If 8.4 is not yet done, leave a placeholder: `[DEPLOYED URL — to be added after Story 8.4]`
  - [ ] Once Story 8.4 is complete, replace the placeholder with the actual prod URL from CLAUDE.md: `https://ship.awsdev.treasury.gov` (confirm it's the fork URL)
  - [ ] Also add the health check URL: `http://ship-api-prod.eba-xsaqsg9h.us-east-1.elasticbeanstalk.com/health`

- [ ] Task 4: Verify and commit (AC: #4)
  - [ ] Run through the setup guide mentally — does every step make sense for a new machine?
  - [ ] Confirm Docker references are removed (except possibly a note that Docker was in the original)
  - [ ] Commit with message: `docs: update README with local PostgreSQL setup guide`
  - [ ] Update sprint-status.yaml: `8-2-update-readme-setup-guide: done`

## Dev Notes

### What's Wrong with the Current README

The current `README.md` Getting Started section has these problems (documented in `gauntlet_docs/ShipShape_codebase_orientation_checklist.md`):

| Problem | Current README | Reality |
|---------|---------------|---------|
| Database setup | `docker-compose up -d` | Local PostgreSQL only (this fork removed Docker) |
| Step order | Seed before migrate | Migrate must run first (schema must exist before seeding) |
| Auto-setup | No mention | `pnpm dev` auto-creates DB, runs migrations, seeds on fresh DBs |
| DB connection | Docker port 5432 | Local PostgreSQL — `DATABASE_URL` in `.env.local` |
| Prerequisites | Docker listed | PostgreSQL 14+ installed locally (not Docker) |

### Improved README Draft

`gauntlet_docs/readme_improved.md` already contains a draft improved README — use this as the primary source. Compare against CLAUDE.md for the authoritative behavior.

### How `pnpm dev` Actually Works (from CLAUDE.md)

```
pnpm dev (via scripts/dev.sh):
1. Creates api/.env.local with DATABASE_URL if missing
2. Creates database (e.g., ship_auth_jan_6) if it doesn't exist
3. Runs migrations and seeds on fresh databases
4. Finds available ports (API: 3000+, Web: 5173+) for multi-worktree dev
5. Starts both servers in parallel
```

### Key References

- [Source: CLAUDE.md] — Authoritative description of `pnpm dev` behavior and local PostgreSQL setup
- [Source: gauntlet_docs/readme_improved.md] — Draft improved README (use as base)
- [Source: gauntlet_docs/ShipShape_codebase_orientation_checklist.md#Repository-Overview] — Documented deviations found during orientation
- [Source: scripts/dev.sh] — Actual implementation of the dev startup script

### Commit Message

```
docs: update README with local PostgreSQL setup guide
```

### File List

- `README.md` (updated)

## Dev Agent Record

### Agent Model Used

_to be filled in by dev agent_

### Debug Log References

_to be filled in by dev agent_

### Completion Notes List

_to be filled in by dev agent_

### File List

- `README.md` (updated)

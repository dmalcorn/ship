<p align="center">
  <a href="https://github.com/US-Department-of-the-Treasury/ship">
    <img src="web/public/icons/blue/android-chrome-512x512.png" alt="Ship logo" width="120">
  </a>
</p>

<h1 align="center">Ship</h1>

<p align="center">
  <strong>Project management that helps teams learn and improve</strong>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License"></a>
  <a href="https://github.com/US-Department-of-the-Treasury/ship/pulls"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  <img src="https://img.shields.io/badge/Section_508-Compliant-blue.svg" alt="Section 508 Compliant">
  <img src="https://img.shields.io/badge/WCAG_2.1-AA-blue.svg" alt="WCAG 2.1 AA">
</p>

---

## What is Ship?

Ship is a project management tool that combines documentation, issue tracking, and plan-driven weekly workflows in one place. Instead of switching between a wiki, a task tracker, and a spreadsheet, everything lives together with real-time collaborative editing.

**Built by the U.S. Department of the Treasury** for government teams, but useful for any organization that wants to work more effectively.

---

## Key Features

- **Unified Document Model** -- Everything (wikis, issues, projects, sprints, people) is stored as a document with type-specific properties. Link anything to anything.
- **Real-time Collaboration** -- Multiple users edit simultaneously with live cursors, powered by TipTap + Yjs CRDTs synced over WebSocket.
- **Plan-Driven Workflows** -- Weekly plans declare intent; retrospectives capture lessons learned. Issues are a trailing indicator, not a leading one.
- **4-Panel Editor Layout** -- Consistent UI across all document types: Icon Rail | Contextual Sidebar | Rich Content Editor | Properties Panel.
- **Interactive API Documentation** -- Auto-generated Swagger UI and OpenAPI 3.0 spec at `/api/docs`.
- **Government-Grade Security** -- No external telemetry, no third-party CDN, 15-minute session timeout, audit logging.
- **Section 508 / WCAG 2.1 AA Accessible** -- Color contrast compliance, full keyboard navigation, screen reader support.

---

## How to Use Ship

Ship has four main views, each designed for different questions:

| View | What it answers |
|------|-----------------|
| **Docs** | "Where's that document?" -- Wiki-style pages for team knowledge |
| **Issues** | "What needs to be done?" -- Track tasks, bugs, and features |
| **Projects** | "What are we building?" -- Group issues into deliverables |
| **Teams** | "Who's doing what?" -- See workload across people and weeks |

### The Basics

1. **Create documents** for anything your team needs to remember -- meeting notes, specs, onboarding guides
2. **Create issues** for work that needs to get done -- assign them to people and track progress
3. **Group issues into projects** to organize related work
4. **Write weekly plans** to declare what you intend to accomplish each week

Everyone on the team can edit documents at the same time. You'll see other people's cursors as they type.

---

## Getting Started

### Choose Your Setup Path

| Path | When to use |
|------|-------------|
| **[Docker (recommended)](#setup-docker-recommended)** | You have Docker Desktop installed |
| **[Native](#setup-native-postgresql)** | You have PostgreSQL installed and running locally |

---

### Setup: Docker (recommended)

#### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- [Docker Desktop](https://www.docker.com/)

#### Steps

```bash
# 1. Clone the repository
git clone https://github.com/US-Department-of-the-Treasury/ship.git
cd ship

# 2. Install dependencies
pnpm install

# 3. Build and start everything (database, API, web)
pnpm docker:up
```

That's it. `pnpm docker:up` handles the rest automatically:

- Starts PostgreSQL on port **5433** (avoids conflicts with any existing PostgreSQL on 5432)
- Builds and starts the API and web containers
- Runs all database migrations
- Seeds the database with sample data

> **Note:** The first run downloads Docker images and installs dependencies inside containers, which takes a few minutes. Subsequent starts are fast.

#### Open the App

Once you see `VITE ready` in the output, open your browser to:

**http://localhost:5173**

Log in with the demo account:
- **Email:** `dev@ship.local`
- **Password:** `admin123`

---

### Setup: Native PostgreSQL

Use this path if you have PostgreSQL installed locally and prefer to run the API and web servers as native Node.js processes.

#### Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/) (`npm install -g pnpm`)
- PostgreSQL 14 or newer, running locally

#### Steps

```bash
# 1. Clone the repository
git clone https://github.com/US-Department-of-the-Treasury/ship.git
cd ship

# 2. Install dependencies
pnpm install

# 3. Start the application
#    pnpm dev auto-creates api/.env.local, creates the database,
#    runs migrations, and seeds on first run -- no manual setup needed
pnpm dev
```

> **Manual environment setup (optional):** Copy `api/.env.example` to `api/.env.local` and set `DATABASE_URL` to your local PostgreSQL connection string. Then run `pnpm db:migrate` followed by `pnpm db:seed` to set up the schema and sample data manually.

#### Open the App

**http://localhost:5173**

Log in with the demo account:
- **Email:** `dev@ship.local`
- **Password:** `admin123`

---

### What's Running

| Service | URL | Description |
|---------|-----|-------------|
| Web app | http://localhost:5173 | The Ship interface |
| API server | http://localhost:3000 | Backend services |
| Swagger UI | http://localhost:3000/api/docs | Interactive API documentation |
| OpenAPI spec | http://localhost:3000/api/openapi.json | OpenAPI 3.0 specification |
| PostgreSQL | localhost:5432 (native) or 5433 (Docker) | Database |

---

## Architecture

### Monorepo Structure

Ship is a pnpm monorepo with three packages:

```
ship/
├── api/                    # Express backend
│   ├── src/
│   │   ├── routes/         # REST endpoints (documents, issues, projects, weeks, auth, search)
│   │   ├── collaboration/  # WebSocket + Yjs real-time sync
│   │   ├── db/             # Database queries, schema, migrations
│   │   └── middleware/     # Auth, error handling, rate limiting
│   └── package.json
│
├── web/                    # React frontend
│   ├── src/
│   │   ├── components/     # UI components (shadcn/ui + Radix primitives)
│   │   ├── pages/          # Route pages
│   │   └── hooks/          # Custom hooks (TanStack Query)
│   └── package.json
│
├── shared/                 # Shared TypeScript types
├── e2e/                    # Playwright E2E tests (~69 spec files, 869+ tests)
├── docs/                   # Architecture and design documentation
├── gauntlet_docs/          # Audit deliverables and improvement plans
└── scripts/                # Dev, deploy, and CI scripts
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TailwindCSS, shadcn/ui (Radix primitives) |
| Editor | TipTap + Yjs CRDTs (real-time collaborative editing) |
| State Management | TanStack Query + IndexedDB persistence |
| Backend | Express, Node.js |
| Database | PostgreSQL (raw SQL via `pg`, no ORM) |
| Real-time | WebSocket (Yjs sync protocol) |
| Testing | Vitest (unit, ~451 tests), Playwright (E2E, ~869 tests) |
| Deployment | AWS Elastic Beanstalk (API) + S3/CloudFront (frontend) |

### Design Principles

- **Everything is a document** -- Single `documents` table with a `document_type` field (wiki, issue, project, sprint, program, person). The difference between content types is properties, not structure.
- **Server is truth** -- Offline-tolerant via CRDTs; syncs when reconnected.
- **Boring technology** -- Well-understood tools (Express, PostgreSQL, React) over cutting-edge experiments.
- **Plan-driven development** -- Weekly plans and retrospectives drive continuous learning.

### Data Model

All content is stored in a unified `documents` table:

| Column | Purpose |
|--------|---------|
| `document_type` | Discriminator: wiki, issue, project, sprint, program, person |
| `content` | TipTap JSON (rich text) |
| `yjs_state` | Binary Yjs CRDT state for conflict-free sync |
| `properties` | JSONB for type-specific fields (status, priority, assignee, etc.) |

Documents relate to each other through a `document_associations` junction table with relationship types: `parent`, `project`, `sprint`, `program`.

See [docs/unified-document-model.md](docs/unified-document-model.md) for the full data model specification.

---

## Development

### Common Commands

```bash
# Development
pnpm dev              # Start API + web (auto-creates DB, finds available ports)
pnpm dev:api          # Start just the API on :3000
pnpm dev:web          # Start just the web app on :5173
pnpm build            # Build all packages
pnpm build:shared     # Build shared types (required before api/web)

# Database
pnpm db:migrate       # Run database migrations
pnpm db:seed          # Seed database with sample data

# Quality
pnpm type-check       # TypeScript checking across all packages
pnpm lint             # Lint all packages
pnpm test             # Run unit tests (Vitest)
pnpm test:e2e         # Run E2E tests (Playwright)

# Docker
pnpm docker:up        # Build and start all services
pnpm docker:down      # Stop all services
pnpm docker:clean     # Stop and delete volumes (resets database)
```

### Database Migrations

Schema changes must go in numbered migration files under `api/src/db/migrations/`:

```
api/src/db/migrations/
├── 001_properties_jsonb.sql
├── 002_person_membership_decoupling.sql
├── ...
└── 027_*.sql
```

Never modify `schema.sql` directly for existing tables. Migrations run automatically on deploy and are tracked in the `schema_migrations` table.

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SESSION_SECRET` | Cookie signing secret | Required |
| `PORT` | API server port | `3000` |

---

## Testing

Ship uses a two-layer testing strategy:

- **Unit tests (Vitest):** ~451 tests covering API routes, database queries, and business logic
- **E2E tests (Playwright):** ~869 tests across 69 spec files covering real user workflows in Chromium

```bash
# Run unit tests
pnpm test

# Run E2E tests
pnpm test:e2e

# Run a specific E2E test file
pnpm test:e2e e2e/documents.spec.ts
```

---

## Deployment

| Environment | Infrastructure |
|-------------|---------------|
| **Development** | Docker Compose (`pnpm docker:up`) or native PostgreSQL (`pnpm dev`) |
| **Production** | AWS Elastic Beanstalk (API) + S3/CloudFront (frontend) |

```bash
./scripts/deploy.sh prod           # Backend -> Elastic Beanstalk
./scripts/deploy-frontend.sh prod  # Frontend -> S3/CloudFront
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions and [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) for pre-deploy verification steps.

---

## Security

- **No external telemetry** -- No Sentry, PostHog, or third-party analytics
- **No external CDN** -- All assets served from your infrastructure
- **Session timeout** -- 15-minute idle timeout, 12-hour absolute timeout (government standard)
- **Audit logging** -- Track all document operations

> **Reporting Vulnerabilities:** See [SECURITY.md](./SECURITY.md) for our vulnerability disclosure policy.

---

## Accessibility

Ship is Section 508 compliant and meets WCAG 2.1 AA standards:

- All color contrasts meet 4.5:1 minimum
- Full keyboard navigation
- Screen reader support
- Visible focus indicators

---

## The Ship Philosophy

### Everything is a Document

In Ship, there's no difference between a "wiki page" and an "issue" at the data level. They're all documents with different properties. This means:

- You can link any document to any other document
- Issues can have rich content, not just a title and description
- Projects and sprints are documents too -- they can contain notes, decisions, and context

### Plans Are the Unit of Intent

Ship is plan-driven: each week starts with a written plan declaring what you intend to accomplish and ends with a retro capturing what you learned.

1. **Plan (Weekly Plan)** -- Before the week, write down what you intend to accomplish and why
2. **Execute (The Week)** -- Do the work; issues track what was actually done
3. **Reflect (Weekly Retro)** -- After the week, write down what actually happened and what you learned

### Learning, Not Compliance

Documentation requirements in Ship are visible but not blocking. You can start a new week without finishing the last retro. But the system makes missing documentation obvious -- it shows up as a visual indicator that escalates from yellow to red over time.

The goal isn't to check boxes. It's to capture what your team learned so you can get better.

---

## Documentation

- [Application Architecture](./docs/application-architecture.md) -- Tech stack and design decisions
- [Unified Document Model](./docs/unified-document-model.md) -- Data model and sync architecture
- [Document Model Conventions](./docs/document-model-conventions.md) -- Terminology and patterns
- [Week Documentation Philosophy](./docs/week-documentation-philosophy.md) -- Why weekly plans and retros work the way they do
- [Accountability Philosophy](./docs/accountability-philosophy.md) -- How Ship encourages accountability
- [Accountability Manager Guide](./docs/accountability-manager-guide.md) -- Using approval workflows
- [Deployment Guide](./DEPLOYMENT.md) -- Deployment instructions
- [Contributing Guidelines](./CONTRIBUTING.md) -- How to contribute
- [Security Policy](./SECURITY.md) -- Vulnerability reporting

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## License

[MIT License](./LICENSE)

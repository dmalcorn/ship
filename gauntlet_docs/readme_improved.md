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

Ship is a project management tool that combines documentation, issue tracking, and plan-driven weekly workflows in one place. Instead of switching between a wiki, a task tracker, and a spreadsheet, everything lives together.

**Built by the U.S. Department of the Treasury** for government teams, but useful for any organization that wants to work more effectively.

---

## How to Use Ship

Ship has four main views, each designed for different questions:

| View | What it answers |
|------|-----------------|
| **Docs** | "Where's that document?" — Wiki-style pages for team knowledge |
| **Issues** | "What needs to be done?" — Track tasks, bugs, and features |
| **Projects** | "What are we building?" — Group issues into deliverables |
| **Teams** | "Who's doing what?" — See workload across people and weeks |

### The Basics

1. **Create documents** for anything your team needs to remember — meeting notes, specs, onboarding guides
2. **Create issues** for work that needs to get done — assign them to people and track progress
3. **Group issues into projects** to organize related work
4. **Write weekly plans** to declare what you intend to accomplish each week

Everyone on the team can edit documents at the same time. You'll see other people's cursors as they type.

---

## The Ship Philosophy

### Everything is a Document

In Ship, there's no difference between a "wiki page" and an "issue" at the data level. They're all documents with different properties. This means:

- You can link any document to any other document
- Issues can have rich content, not just a title and description
- Projects and weeks are documents too — they can contain notes, decisions, and context

### Plans Are the Unit of Intent

Ship is plan-driven: each week starts with a written plan declaring what you intend to accomplish and ends with a retro capturing what you learned. Issues are a trailing indicator of what was done, not a leading indicator of what to do.

1. **Plan (Weekly Plan)** — Before the week, write down what you intend to accomplish and why
2. **Execute (The Week)** — Do the work; issues track what was actually done
3. **Reflect (Weekly Retro)** — After the week, write down what actually happened and what you learned

This isn't paperwork for paperwork's sake. Teams that skip retrospectives repeat the same mistakes. Teams that write things down learn and improve.

### Learning, Not Compliance

Documentation requirements in Ship are visible but not blocking. You can start a new week without finishing the last retro. But the system makes missing documentation obvious — it shows up as a visual indicator that escalates from yellow to red over time.

The goal isn't to check boxes. It's to capture what your team learned so you can get better.

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

#### What's Running

| Service | URL | Description |
|---------|-----|-------------|
| Web app | http://localhost:5173 | The Ship interface |
| API server | http://localhost:3000 | Backend services |
| Swagger UI | http://localhost:3000/api/docs | Interactive API documentation |
| OpenAPI spec | http://localhost:3000/api/openapi.json | OpenAPI 3.0 specification |
| PostgreSQL | localhost:5433 | Database (Docker, port 5433) |

#### Common Commands (Docker)

```bash
pnpm docker:up      # Build and start all services
pnpm docker:down    # Stop all services
pnpm docker:clean   # Stop and delete volumes (resets database to fresh state)
```

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

# 3. Configure environment
cp api/.env.example api/.env.local
# Edit api/.env.local and set DATABASE_URL to match your local PostgreSQL credentials

cp web/.env.example web/.env

# 4. Run database migrations (must run before seeding)
pnpm db:migrate

# 5. Seed the database with sample data
pnpm db:seed

# 6. Start the application
pnpm dev
```

> **Note:** `pnpm dev` auto-creates `api/.env.local` with a local DATABASE_URL if the file does not exist. If you already copied `.env.example`, verify the `DATABASE_URL` matches your local PostgreSQL setup before running.

#### Open the App

**http://localhost:5173**

Log in with the demo account:
- **Email:** `dev@ship.local`
- **Password:** `admin123`

#### What's Running

| Service | URL | Description |
|---------|-----|-------------|
| Web app | http://localhost:5173 | The Ship interface |
| API server | http://localhost:3000 | Backend services |
| Swagger UI | http://localhost:3000/api/docs | Interactive API documentation |
| OpenAPI spec | http://localhost:3000/api/openapi.json | OpenAPI 3.0 specification |
| PostgreSQL | localhost:5432 | Your local PostgreSQL instance |

#### Common Commands (Native)

```bash
pnpm dev          # Start API and web servers
pnpm dev:web      # Start just the web app
pnpm dev:api      # Start just the API
pnpm db:migrate   # Run database migrations
pnpm db:seed      # Reset database with sample data
pnpm test         # Run tests
```

---

## Technical Details

### Architecture

Ship is a monorepo with three packages:

- **web/** — React frontend with TipTap editor for real-time collaboration
- **api/** — Express backend with WebSocket support
- **shared/** — TypeScript types used by both

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React, Vite, TailwindCSS |
| Editor | TipTap + Yjs (real-time collaboration) |
| Backend | Express, Node.js |
| Database | PostgreSQL |
| Real-time | WebSocket |

### Design Decisions

- **Everything is a document** — Single `documents` table with a `document_type` field
- **Server is truth** — Offline-tolerant, syncs when reconnected
- **Boring technology** — Well-understood tools over cutting-edge experiments
- **E2E testing** — 73+ Playwright tests covering real user flows

See [docs/application-architecture.md](docs/application-architecture.md) for more.

### Repository Structure

```
ship/
├── api/                    # Express backend
│   ├── src/
│   │   ├── routes/         # REST endpoints
│   │   ├── collaboration/  # WebSocket + Yjs sync
│   │   └── db/             # Database queries
│   └── package.json
│
├── web/                    # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages
│   │   └── hooks/          # Custom hooks
│   └── package.json
│
├── shared/                 # Shared TypeScript types
├── e2e/                    # Playwright E2E tests
└── docs/                   # Architecture documentation
```

---

## Testing

```bash
# Run all E2E tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run specific test file
pnpm test e2e/documents.spec.ts
```

Ship uses Playwright for end-to-end testing with 73+ tests covering all major functionality.

---

## Deployment

Ship supports multiple deployment patterns:

| Environment | Recommended Approach |
|-------------|---------------------|
| **Development** | Docker Compose (`pnpm docker:up`) |
| **Staging** | AWS Elastic Beanstalk |
| **Production** | AWS GovCloud with Terraform |

### Docker

```bash
# Build production images
docker build -t ship-api ./api
docker build -t ship-web ./web

# Run with Docker Compose
docker-compose -f docker-compose.prod.yml up
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `SESSION_SECRET` | Cookie signing secret | Required |
| `PORT` | API server port | `3000` |

---

## Security

- **No external telemetry** — No Sentry, PostHog, or third-party analytics
- **No external CDN** — All assets served from your infrastructure
- **Session timeout** — 15-minute idle timeout (government standard)
- **Audit logging** — Track all document operations

> **Reporting Vulnerabilities:** See [SECURITY.md](./SECURITY.md) for our vulnerability disclosure policy.

---

## Accessibility

Ship is Section 508 compliant and meets WCAG 2.1 AA standards:

- All color contrasts meet 4.5:1 minimum
- Full keyboard navigation
- Screen reader support
- Visible focus indicators

---

## Contributing

We welcome contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## Documentation

- [Application Architecture](./docs/application-architecture.md) — Tech stack and design decisions
- [Unified Document Model](./docs/unified-document-model.md) — Data model and sync architecture
- [Document Model Conventions](./docs/document-model-conventions.md) — Terminology and patterns
- [Week Documentation Philosophy](./docs/week-documentation-philosophy.md) — Why weekly plans and retros work the way they do
- [Accountability Philosophy](./docs/accountability-philosophy.md) — How Ship enforces accountability
- [Accountability Manager Guide](./docs/accountability-manager-guide.md) — Using approval workflows
- [Contributing Guidelines](./CONTRIBUTING.md) — How to contribute
- [Security Policy](./SECURITY.md) — Vulnerability reporting

---

## License

[MIT License](./LICENSE)

# ShipShape Codebase Discovery Write-Up

## Overview

Three discoveries made during the Week 4 Gauntlet audit of the ShipShape codebase. Each represents a technique or architectural pattern that was new to me and is applicable to future projects.

---

## Discovery 1: Dual-State CRDT Persistence with IndexedDB Cache Invalidation

**Found at:** `api/src/collaboration/index.ts`, lines 192–193 (`freshFromJsonDocs` Set), lines 211–238 (dual-path load), lines 693–700 (cache-clear signal)

**What it does and why it matters:**

The collaboration server maintains document content in two parallel representations: a binary Yjs CRDT state (`yjs_state BYTEA` in PostgreSQL) and a JSON content snapshot (`content JSONB`). When a document is created via the REST API, it only has JSON content — no CRDT state exists yet. On first WebSocket connection, the server detects this gap and converts the JSON to a Yjs Y.Doc via `jsonToYjs()`. The critical insight is what happens next: the server adds the doc name to a `freshFromJsonDocs` Set and, on the very first client connection, sends a custom `messageClearCache` (message type 3) over the WebSocket before beginning the normal sync handshake. This tells the browser to wipe its locally-cached IndexedDB state before syncing — preventing the browser's stale CRDT from merging with the freshly-converted server state and producing garbage content. After the first client connects, the flag is cleared; subsequent clients sync against the now-canonical CRDT state.

The server also uses custom WebSocket close codes as a signaling vocabulary: `4100` (document type converted — frontend should redirect), `4101` (content updated via API — reconnect for fresh state), `4403` (access revoked — user lost visibility). These codes let the frontend distinguish recoverable from unrecoverable disconnect scenarios without polling.

**How I would apply this in a future project:**

Any time a REST API and a real-time CRDT system share ownership of the same document state, you need exactly this pattern: a "loaded from API" flag that triggers a one-time cache bust on the first collaborative connection. I'd generalize the custom close codes into an enum defined in a shared module (not magic numbers) so that frontend handlers and server dispatch are linked by type. The dual-state approach — binary CRDT for collaboration fidelity, JSON snapshot for API readability — is a technique I'd adopt in any collaborative editor that also needs to serve content to non-WebSocket consumers.

---

## Discovery 2: Unified Document Model with JSONB Properties and Conversion Lineage

**Found at:** `api/src/db/schema.sql`, lines 98–159 (document type enum and core documents table)

**What it does and why it matters:**

Rather than a separate table per content type (issues table, projects table, wikis table), every piece of content in ShipShape is a row in a single `documents` table. A PostgreSQL enum (`document_type`) distinguishes wikis, issues, projects, sprints, programs, persons, weekly plans, retros, standups, and reviews. Type-specific properties — an issue's `state` and `priority`, a sprint's `start_date` and `end_date`, a person's `capacity_hours` — all live in a `properties JSONB` column rather than typed columns. The shared columns (`title`, `content`, `yjs_state`, `visibility`, `parent_id`, `position`) apply universally; the type-specific semantics are in the JSON blob.

What surprised me was the document conversion tracking: `converted_to_id`, `converted_from_id`, `original_type`, `conversion_count`, and `converted_at` are first-class columns, not soft metadata. When a user converts an issue into a project, the original row is archived and a new row is created, but both rows carry pointers to each other. The schema preserves conversion lineage indefinitely. This supports the product decision that type is not destiny — a piece of work can move from idea (wiki) to tracked task (issue) to deliverable (project) without losing its history.

**How I would apply this in a future project:**

The unified document model is the right default whenever content types share more structure than they differ. The JSONB properties column lets you add type-specific fields without migrations — a significant operational advantage. I'd use PostgreSQL's JSONB `CHECK` constraints or a trigger to enforce required properties per type at the database layer, giving the flexibility of JSONB without the risk of missing required fields. The conversion lineage columns I'd adopt verbatim — tracking `original_type` and `converted_at` costs two columns and makes audit trails trivial.

---

## Discovery 3: Zod Schemas as the Single Source of Truth for Validation and OpenAPI Documentation

**Found at:** `api/src/openapi/registry.ts`, lines 1–81; `api/src/openapi/schemas/` (22 schema files)

**What it does and why it matters:**

Every API endpoint in ShipShape registers its request/response Zod schemas with a central `OpenAPIRegistry` from `@asteasolutions/zod-to-openapi`. At server startup, `generateOpenAPIDocument()` calls `OpenApiGeneratorV3` on all registered definitions and returns a complete OpenAPI 3.0 JSON object — which is then served at `/api/openapi.json` and rendered by Swagger UI at `/api/docs`.

The consequence is that validation and documentation cannot diverge. A schema defined with Zod and registered with the registry is simultaneously: the runtime validator that rejects bad requests, the type source that TypeScript infers response shapes from, and the documentation artifact that describes the endpoint to consumers and tools. There is no separate API spec file to maintain, no risk of "the docs say X but the code does Y." The 22 schema files in `api/src/openapi/schemas/` cover every resource type with `.openapi()` metadata (descriptions, examples) attached directly to the Zod shapes. Notably, the OpenAPI document also auto-generates MCP (Model Context Protocol) tool definitions — every registered endpoint becomes a tool callable by an AI agent without extra work.

**How I would apply this in a future project:**

I'd adopt `@asteasolutions/zod-to-openapi` as the standard approach for any Express or Hono API that needs documentation. The pattern eliminates an entire class of documentation drift bugs. The key discipline is registering every route at definition time rather than as an afterthought — I'd enforce this with a lint rule or CI check that compares the route count against the registry count. For AI-integrated projects, the MCP auto-generation is a force multiplier: define your API once and get both human-readable docs and agent-callable tools.

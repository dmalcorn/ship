import { beforeAll, afterAll } from 'vitest'
import { pool } from '../db/client.js'

// Test setup for API integration tests
// This runs before all tests in each test file

// Set NODE_ENV=test at module load time (before any test files import app.ts)
// so that module-level rate-limiter config in app.ts uses the test-safe limit (1000)
// instead of the production limit (5). NODE_ENV may already be 'development' in this
// devcontainer, so we force it here before modules initialize.
process.env.NODE_ENV = 'test'

beforeAll(async () => {

  // Clean up test data from previous runs to prevent duplicate key errors
  // Use TRUNCATE CASCADE which is faster and bypasses row-level triggers
  // (audit_logs has AU-9 compliance triggers preventing DELETE)
  await pool.query(`TRUNCATE TABLE
    workspace_invites, sessions, files, document_links, document_history,
    comments, document_associations, document_snapshots, sprint_iterations,
    issue_iterations, documents, audit_logs, workspace_memberships,
    users, workspaces
    CASCADE`)
})

afterAll(async () => {
  // Close pool only at the very end - vitest handles this via globalTeardown
})

/**
 * Supplemental seeder — brings DB up to GFA Week 4 requirements:
 *   - 20+ users
 *   - 500+ total documents
 *   - 100+ issues  (already satisfied by base seed)
 *   - 10+ sprints  (already satisfied by base seed)
 */
import pg from 'pg';
import { randomUUID } from 'crypto';

const DB_URL = 'postgres://ship:ship_dev_password@postgres:5432/ship_dev';
const pool = new pg.Pool({ connectionString: DB_URL });

async function query(sql, params) {
  const res = await pool.query(sql, params);
  return res;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function slug(n) {
  return String(n).padStart(3, '0');
}

const LOREM = [
  'Implement feature flag for rollout',
  'Fix pagination edge case on list view',
  'Refactor authentication middleware',
  'Add unit tests for validation logic',
  'Update API response schema',
  'Improve error messages on form submit',
  'Migrate legacy endpoint to new pattern',
  'Audit logging for compliance requirements',
  'Performance review of search query',
  'Document onboarding steps for new users',
  'Remove deprecated config options',
  'Add rate limiting to public endpoints',
  'Resolve accessibility issues in modal',
  'Sync design tokens with Figma',
  'Investigate memory leak in WebSocket handler',
];

function randomTitle(prefix, i) {
  return `${prefix} ${LOREM[i % LOREM.length]} (#${i})`;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function run() {
  // 1. Get workspace
  const wsRes = await query('SELECT id FROM workspaces LIMIT 1');
  const workspaceId = wsRes.rows[0].id;
  console.log('Workspace:', workspaceId);

  // 2. Get a creator user id
  const devRes = await query("SELECT id FROM users WHERE email = 'dev@ship.local' LIMIT 1");
  const creatorId = devRes.rows[0].id;

  // 3. Get projects and sprints
  const projRes = await query("SELECT id FROM documents WHERE workspace_id=$1 AND document_type='project'", [workspaceId]);
  const projects = projRes.rows.map(r => r.id);

  const sprintRes = await query("SELECT id FROM documents WHERE workspace_id=$1 AND document_type='sprint'", [workspaceId]);
  const sprints = sprintRes.rows.map(r => r.id);

  // ── Users ─────────────────────────────────────────────────────────────────
  const existingUsersRes = await query('SELECT COUNT(*) as cnt FROM users');
  const existingUsers = parseInt(existingUsersRes.rows[0].cnt, 10);
  const usersNeeded = Math.max(0, 21 - existingUsers); // ensure 21+ users
  console.log(`Current users: ${existingUsers}, adding ${usersNeeded}`);

  const newUserIds = [];
  for (let i = 0; i < usersNeeded; i++) {
    const email = `supplement-user-${slug(i)}@ship.local`;
    const name = `Supplement User ${slug(i)}`;
    // Check if exists
    const exists = await query('SELECT id FROM users WHERE email=$1', [email]);
    if (exists.rows.length > 0) {
      newUserIds.push(exists.rows[0].id);
      continue;
    }
    const uid = await query(
      `INSERT INTO users (email, password_hash, name, last_workspace_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [email, '$2b$10$EIX3w3okmj2oB9yrh5.cQeS7K4Kqb7c8i3Eg.v0jh0yP1B7Y5fzEa', name, workspaceId]
    );
    newUserIds.push(uid.rows[0].id);
    // workspace membership
    await query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
      [workspaceId, uid.rows[0].id]
    );
    // Person document
    await query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES ($1, 'person', $2, $3, $4)`,
      [workspaceId, name, JSON.stringify({ user_id: uid.rows[0].id }), creatorId]
    );
  }
  console.log(`✅ Users now ≥ 21`);

  // ── Documents ─────────────────────────────────────────────────────────────
  const existingDocsRes = await query('SELECT COUNT(*) as cnt FROM documents WHERE workspace_id=$1', [workspaceId]);
  const existingDocs = parseInt(existingDocsRes.rows[0].cnt, 10);
  const docsNeeded = Math.max(0, 501 - existingDocs);
  console.log(`Current docs: ${existingDocs}, adding ${docsNeeded}`);

  // Mix: 60% wiki, 25% issue, 15% project-linked wiki
  const wikiCount = Math.ceil(docsNeeded * 0.60);
  const issueCount = Math.ceil(docsNeeded * 0.25);
  const linkedWikiCount = docsNeeded - wikiCount - issueCount;

  let created = 0;

  // Wiki pages
  for (let i = 0; i < wikiCount; i++) {
    const title = randomTitle('Wiki page:', created);
    await query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES ($1, 'wiki', $2, '{}', $3)`,
      [workspaceId, title, creatorId]
    );
    created++;
    if (created % 100 === 0) console.log(`  ... ${created}/${docsNeeded} docs created`);
  }

  // Issues (extra, linked to random project + sprint)
  for (let i = 0; i < issueCount; i++) {
    const title = randomTitle('Issue:', created);
    const projectId = projects[created % projects.length];
    const sprintId = sprints[created % sprints.length];
    const docRes = await query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES ($1, 'issue', $2, $3, $4) RETURNING id`,
      [workspaceId, title, JSON.stringify({ status: 'backlog', priority: 'medium' }), creatorId]
    );
    const docId = docRes.rows[0].id;
    if (projectId) {
      await query(
        `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
         VALUES ($1, $2, 'project', '{}') ON CONFLICT DO NOTHING`,
        [docId, projectId]
      );
    }
    if (sprintId) {
      await query(
        `INSERT INTO document_associations (document_id, related_id, relationship_type, metadata)
         VALUES ($1, $2, 'sprint', '{}') ON CONFLICT DO NOTHING`,
        [docId, sprintId]
      );
    }
    created++;
    if (created % 100 === 0) console.log(`  ... ${created}/${docsNeeded} docs created`);
  }

  // Remaining as project-linked wiki
  for (let i = 0; i < linkedWikiCount; i++) {
    const title = randomTitle('Project Doc:', created);
    await query(
      `INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
       VALUES ($1, 'wiki', $2, '{}', $3)`,
      [workspaceId, title, creatorId]
    );
    created++;
    if (created % 100 === 0) console.log(`  ... ${created}/${docsNeeded} docs created`);
  }

  console.log(`✅ Created ${created} documents`);

  // ── Final counts ──────────────────────────────────────────────────────────
  const finalDocs = await query('SELECT document_type, COUNT(*) as cnt FROM documents WHERE workspace_id=$1 GROUP BY document_type ORDER BY cnt DESC', [workspaceId]);
  console.log('\nFinal document counts:');
  let total = 0;
  for (const row of finalDocs.rows) {
    console.log(`  ${row.document_type}: ${row.cnt}`);
    total += parseInt(row.cnt, 10);
  }
  console.log(`  TOTAL: ${total}`);

  const finalUsers = await query('SELECT COUNT(*) as cnt FROM users');
  console.log(`Final users: ${finalUsers.rows[0].cnt}`);

  await pool.end();
}

run().catch(e => { console.error('FATAL:', e.message); pool.end(); process.exit(1); });

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { v4 as uuidv4 } from 'uuid'
import { createApp } from '../app.js'
import { pool } from '../db/client.js'

/**
 * Invites API unit tests
 *
 * Covers the security contract for invite token validation and acceptance
 * that cannot be reliably tested at the E2E level (expired tokens, already-used
 * tokens, and weak-password rejection require precise DB state).
 *
 * Routes under test:
 *   GET  /api/invites/:token          — validate token (public, no auth required)
 *   POST /api/invites/:token/accept   — accept invite and create session
 *
 * Security invariants pinned here:
 *   - Bogus/unknown tokens → 404
 *   - Expired tokens → 400 (not silently accepted)
 *   - Already-used tokens → 400 (not replayable)
 *   - New user created via accept requires password ≥ 8 chars
 *   - Accepting when already a workspace member → 400 (idempotency guard)
 *   - Accepting with a valid token creates a session cookie
 */

describe('Invites API', () => {
  const app = createApp()
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  let workspaceId: string
  let invitingUserId: string

  // Token strings (not UUIDs — invite tokens are random hex/uuid strings)
  let validToken: string
  let expiredToken: string
  let usedToken: string
  let inviteId: string          // for the valid invite
  let expiredInviteId: string
  let usedInviteId: string

  // For the "already a member" test
  let existingMemberEmail: string
  let existingMemberId: string
  let memberInviteToken: string

  // Track users created by the accept endpoint so we can clean them up
  const createdUserEmails: string[] = []

  // ------------------------------------------------------------------
  // Helper: get CSRF token (needed for POST requests)
  // ------------------------------------------------------------------
  async function getCsrf() {
    const res = await request(app).get('/api/csrf-token')
    const connectSid = res.headers['set-cookie']?.[0]?.split(';')[0] ?? ''
    return { token: res.body.token as string, cookie: connectSid }
  }

  // ------------------------------------------------------------------
  // Setup
  // ------------------------------------------------------------------
  beforeAll(async () => {
    // Workspace
    const ws = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Invites Test ${runId}`]
    )
    workspaceId = ws.rows[0].id

    // The user who sends invites (must exist for the JOIN in GET /:token)
    const iu = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'hash', 'Inviter') RETURNING id`,
      [`inviter-${runId}@ship.local`]
    )
    invitingUserId = iu.rows[0].id
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [workspaceId, invitingUserId]
    )

    // Valid invite (expires 1 hour from now)
    validToken = uuidv4()
    const vi = await pool.query(
      `INSERT INTO workspace_invites (workspace_id, email, role, token, expires_at, invited_by_user_id)
       VALUES ($1, $2, 'member', $3, now() + interval '1 hour', $4) RETURNING id`,
      [workspaceId, `new-user-${runId}@ship.local`, validToken, invitingUserId]
    )
    inviteId = vi.rows[0].id

    // Expired invite (expired 1 hour ago)
    expiredToken = uuidv4()
    const ei = await pool.query(
      `INSERT INTO workspace_invites (workspace_id, email, role, token, expires_at, invited_by_user_id)
       VALUES ($1, $2, 'member', $3, now() - interval '1 hour', $4) RETURNING id`,
      [workspaceId, `expired-${runId}@ship.local`, expiredToken, invitingUserId]
    )
    expiredInviteId = ei.rows[0].id

    // Already-used invite
    usedToken = uuidv4()
    const ui = await pool.query(
      `INSERT INTO workspace_invites (workspace_id, email, role, token, expires_at, used_at, invited_by_user_id)
       VALUES ($1, $2, 'member', $3, now() + interval '1 hour', now(), $4) RETURNING id`,
      [workspaceId, `used-${runId}@ship.local`, usedToken, invitingUserId]
    )
    usedInviteId = ui.rows[0].id

    // Existing member for the "already a member" test
    existingMemberEmail = `existing-member-${runId}@ship.local`
    const em = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'hash', 'Existing Member') RETURNING id`,
      [existingMemberEmail]
    )
    existingMemberId = em.rows[0].id
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`,
      [workspaceId, existingMemberId]
    )
    memberInviteToken = uuidv4()
    await pool.query(
      `INSERT INTO workspace_invites (workspace_id, email, role, token, expires_at, invited_by_user_id)
       VALUES ($1, $2, 'member', $3, now() + interval '1 hour', $4)`,
      [workspaceId, existingMemberEmail, memberInviteToken, invitingUserId]
    )
  })

  // ------------------------------------------------------------------
  // Teardown
  // ------------------------------------------------------------------
  afterAll(async () => {
    // Clean up users the accept endpoint may have created
    for (const email of createdUserEmails) {
      const u = await pool.query('SELECT id FROM users WHERE email = $1', [email])
      if (u.rows[0]) {
        const uid = u.rows[0].id
        await pool.query('DELETE FROM sessions WHERE user_id = $1', [uid])
        await pool.query('DELETE FROM document_associations WHERE document_id IN (SELECT id FROM documents WHERE workspace_id = $1 AND created_by = $2)', [workspaceId, uid])
        await pool.query('DELETE FROM documents WHERE workspace_id = $1 AND created_by = $2', [workspaceId, uid])
        await pool.query('DELETE FROM workspace_memberships WHERE user_id = $1', [uid])
        await pool.query('DELETE FROM users WHERE id = $1', [uid])
      }
    }

    await pool.query('DELETE FROM workspace_invites WHERE workspace_id = $1', [workspaceId])
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [invitingUserId])
    await pool.query('DELETE FROM document_associations WHERE document_id IN (SELECT id FROM documents WHERE workspace_id = $1)', [workspaceId])
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId])
    await pool.query('DELETE FROM workspace_memberships WHERE workspace_id = $1', [workspaceId])
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [invitingUserId, existingMemberId])
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])
  })

  // ==================================================================
  // GET /api/invites/:token — token validation
  // ==================================================================
  describe('GET /api/invites/:token', () => {
    it('returns invite details for a valid token', async () => {
      const res = await request(app).get(`/api/invites/${validToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.email).toBe(`new-user-${runId}@ship.local`)
      expect(res.body.data.role).toBe('member')
      expect(res.body.data.workspaceId).toBe(workspaceId)
      expect(res.body.data.userExists).toBe(false)
      expect(res.body.data.alreadyMember).toBe(false)
    })

    it('returns 404 for an unknown token', async () => {
      const res = await request(app).get(`/api/invites/${uuidv4()}`)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('returns 400 for an expired token', async () => {
      const res = await request(app).get(`/api/invites/${expiredToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/expired/i)
    })

    it('returns 400 for an already-used token', async () => {
      const res = await request(app).get(`/api/invites/${usedToken}`)

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/already been used/i)
    })

    it('sets userExists=true and alreadyMember=true when invitee is already a workspace member', async () => {
      const res = await request(app).get(`/api/invites/${memberInviteToken}`)

      expect(res.status).toBe(200)
      expect(res.body.data.userExists).toBe(true)
      expect(res.body.data.alreadyMember).toBe(true)
    })
  })

  // ==================================================================
  // POST /api/invites/:token/accept — accept invite
  // ==================================================================
  describe('POST /api/invites/:token/accept', () => {
    it('accepts a valid invite, creates user, and returns a session cookie', async () => {
      // Need a fresh invite for this test (valid token is shared across GET tests)
      const acceptToken = uuidv4()
      const acceptEmail = `accept-new-${runId}@ship.local`
      createdUserEmails.push(acceptEmail)

      await pool.query(
        `INSERT INTO workspace_invites (workspace_id, email, role, token, expires_at, invited_by_user_id)
         VALUES ($1, $2, 'member', $3, now() + interval '1 hour', $4)`,
        [workspaceId, acceptEmail, acceptToken, invitingUserId]
      )

      const { token: csrfToken, cookie: csrfCookie } = await getCsrf()
      const res = await request(app)
        .post(`/api/invites/${acceptToken}/accept`)
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'New Member', password: 'SecurePass123' })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.user.email).toBe(acceptEmail)
      expect(res.body.data.workspace.id).toBe(workspaceId)

      // Session cookie must be set
      const setCookie = res.headers['set-cookie'] as string[] | undefined
      expect(setCookie?.some((c: string) => c.startsWith('session_id='))).toBe(true)
    })

    it('returns 400 for an expired token', async () => {
      const { token: csrfToken, cookie: csrfCookie } = await getCsrf()
      const res = await request(app)
        .post(`/api/invites/${expiredToken}/accept`)
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Late Joiner', password: 'SecurePass123' })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/expired/i)
    })

    it('returns 400 for an already-used token', async () => {
      const { token: csrfToken, cookie: csrfCookie } = await getCsrf()
      const res = await request(app)
        .post(`/api/invites/${usedToken}/accept`)
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Replay Attacker', password: 'SecurePass123' })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/already been used/i)
    })

    it('returns 404 for an unknown token', async () => {
      const { token: csrfToken, cookie: csrfCookie } = await getCsrf()
      const res = await request(app)
        .post(`/api/invites/${uuidv4()}/accept`)
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Nobody', password: 'SecurePass123' })

      expect(res.status).toBe(404)
    })

    it('rejects a weak password (< 8 characters) for new user creation', async () => {
      const weakPwdToken = uuidv4()
      const weakPwdEmail = `weak-pwd-${runId}@ship.local`

      await pool.query(
        `INSERT INTO workspace_invites (workspace_id, email, role, token, expires_at, invited_by_user_id)
         VALUES ($1, $2, 'member', $3, now() + interval '1 hour', $4)`,
        [workspaceId, weakPwdEmail, weakPwdToken, invitingUserId]
      )

      const { token: csrfToken, cookie: csrfCookie } = await getCsrf()
      const res = await request(app)
        .post(`/api/invites/${weakPwdToken}/accept`)
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Weak User', password: 'short' })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/8 characters/i)

      // Confirm no user was created
      const check = await pool.query('SELECT id FROM users WHERE email = $1', [weakPwdEmail])
      expect(check.rows).toHaveLength(0)
    })

    it('returns 400 when existing workspace member tries to accept an invite', async () => {
      // existingMemberId is already in the workspace — the memberInviteToken targets their email
      const { token: csrfToken, cookie: csrfCookie } = await getCsrf()

      // Use a fresh token pointing to the existing member's email
      const dupToken = uuidv4()
      await pool.query(
        `INSERT INTO workspace_invites (workspace_id, email, role, token, expires_at, invited_by_user_id)
         VALUES ($1, $2, 'member', $3, now() + interval '1 hour', $4)`,
        [workspaceId, existingMemberEmail, dupToken, invitingUserId]
      )

      const res = await request(app)
        .post(`/api/invites/${dupToken}/accept`)
        .set('Cookie', csrfCookie)
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Already Here' })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/already a member/i)
    })
  })
})

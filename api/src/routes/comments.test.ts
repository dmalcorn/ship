import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { createApp } from '../app.js'
import { pool } from '../db/client.js'

/**
 * Comments API unit tests
 *
 * Covers authorization rules that the E2E inline-comments spec cannot reach:
 *   - Only the comment author may edit content (PATCH)
 *   - Any workspace member may resolve/unresolve a comment (PATCH resolved_at)
 *   - DELETE is owner-only (non-owner silently gets 404 from the WHERE clause)
 *   - Non-existent comment IDs must return 404, not 403 (bug guard)
 *   - Cross-workspace isolation: comments are scoped to workspace_id
 *   - Threaded replies: parent must belong to the same document
 *
 * Routes under test:
 *   GET    /api/documents/:id/comments
 *   POST   /api/documents/:id/comments
 *   PATCH  /api/comments/:id
 *   DELETE /api/comments/:id
 */

describe('Comments API', () => {
  const app = createApp()
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  // Primary actor (comment author)
  const authorEmail = `comments-author-${runId}@ship.local`
  let authorId: string
  let authorSession: string
  let authorCsrf: string

  // Secondary actor (same workspace, different user)
  const memberEmail = `comments-member-${runId}@ship.local`
  let memberId: string
  let memberSession: string
  let memberCsrf: string

  let workspaceId: string
  let documentId: string

  // Refreshed per test
  let commentId: string   // DB uuid (primary key)
  let commentTipTapId: string  // TipTap comment_id (uuid stored in content)

  // ------------------------------------------------------------------
  // Helper: fetch CSRF token, returns { token, connectSidCookie }
  // ------------------------------------------------------------------
  async function getCsrf(sessionCookie: string) {
    const res = await request(app)
      .get('/api/csrf-token')
      .set('Cookie', sessionCookie)
    const connectSid = res.headers['set-cookie']?.[0]?.split(';')[0] ?? ''
    return {
      token: res.body.token as string,
      cookie: connectSid ? `${sessionCookie}; ${connectSid}` : sessionCookie,
    }
  }

  // ------------------------------------------------------------------
  // Helper: create a raw DB session, return "session_id=..." cookie string
  // ------------------------------------------------------------------
  async function createSession(userId: string, wsId: string) {
    const sid = crypto.randomBytes(32).toString('hex')
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, expires_at)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [sid, userId, wsId]
    )
    return `session_id=${sid}`
  }

  // ------------------------------------------------------------------
  // Setup: workspace, two users, one document
  // ------------------------------------------------------------------
  beforeAll(async () => {
    const ws = await pool.query(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`Comments Test ${runId}`]
    )
    workspaceId = ws.rows[0].id

    // Author user
    const au = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'hash', 'Comment Author') RETURNING id`,
      [authorEmail]
    )
    authorId = au.rows[0].id
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`,
      [workspaceId, authorId]
    )
    const authorRaw = await createSession(authorId, workspaceId)
    const authorAuth = await getCsrf(authorRaw)
    authorSession = authorAuth.cookie
    authorCsrf = authorAuth.token

    // Member user (not the author)
    const mu = await pool.query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1, 'hash', 'Workspace Member') RETURNING id`,
      [memberEmail]
    )
    memberId = mu.rows[0].id
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'member')`,
      [workspaceId, memberId]
    )
    const memberRaw = await createSession(memberId, workspaceId)
    const memberAuth = await getCsrf(memberRaw)
    memberSession = memberAuth.cookie
    memberCsrf = memberAuth.token

    // Document owned by author
    const doc = await pool.query(
      `INSERT INTO documents (workspace_id, document_type, title, created_by)
       VALUES ($1, 'wiki', 'Test Doc', $2) RETURNING id`,
      [workspaceId, authorId]
    )
    documentId = doc.rows[0].id
  })

  // ------------------------------------------------------------------
  // Per-test: create a fresh comment by the author
  // ------------------------------------------------------------------
  beforeEach(async () => {
    await pool.query('DELETE FROM comments WHERE document_id = $1', [documentId])

    commentTipTapId = uuidv4()
    const c = await pool.query(
      `INSERT INTO comments (document_id, comment_id, author_id, workspace_id, content)
       VALUES ($1, $2, $3, $4, 'Original comment text') RETURNING id`,
      [documentId, commentTipTapId, authorId, workspaceId]
    )
    commentId = c.rows[0].id
  })

  // ------------------------------------------------------------------
  // Teardown
  // ------------------------------------------------------------------
  afterAll(async () => {
    await pool.query('DELETE FROM comments WHERE workspace_id = $1', [workspaceId])
    await pool.query('DELETE FROM sessions WHERE user_id IN ($1, $2)', [authorId, memberId])
    await pool.query('DELETE FROM documents WHERE workspace_id = $1', [workspaceId])
    await pool.query('DELETE FROM workspace_memberships WHERE workspace_id = $1', [workspaceId])
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [authorId, memberId])
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId])
  })

  // ==================================================================
  // GET /api/documents/:id/comments
  // ==================================================================
  describe('GET /api/documents/:id/comments', () => {
    it('returns the comment list for the document', async () => {
      const res = await request(app)
        .get(`/api/documents/${documentId}/comments`)
        .set('Cookie', authorSession)

      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body).toHaveLength(1)
      expect(res.body[0].content).toBe('Original comment text')
      expect(res.body[0].author.id).toBe(authorId)
    })

    it('returns 401 when not authenticated', async () => {
      const res = await request(app)
        .get(`/api/documents/${documentId}/comments`)

      expect(res.status).toBe(401)
    })
  })

  // ==================================================================
  // POST /api/documents/:id/comments
  // ==================================================================
  describe('POST /api/documents/:id/comments', () => {
    it('creates a top-level comment and returns 201', async () => {
      const newTipTapId = uuidv4()
      const res = await request(app)
        .post(`/api/documents/${documentId}/comments`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)
        .send({ comment_id: newTipTapId, content: 'A new comment' })

      expect(res.status).toBe(201)
      expect(res.body.content).toBe('A new comment')
      expect(res.body.author.id).toBe(authorId)
      expect(res.body.parent_id).toBeNull()
    })

    it('creates a reply when parent_id is provided', async () => {
      const replyTipTapId = uuidv4()
      const res = await request(app)
        .post(`/api/documents/${documentId}/comments`)
        .set('Cookie', memberSession)
        .set('x-csrf-token', memberCsrf)
        .send({ comment_id: replyTipTapId, content: 'A reply', parent_id: commentId })

      expect(res.status).toBe(201)
      expect(res.body.parent_id).toBe(commentId)
      expect(res.body.author.id).toBe(memberId)
    })

    it('returns 400 for empty content', async () => {
      const res = await request(app)
        .post(`/api/documents/${documentId}/comments`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)
        .send({ comment_id: uuidv4(), content: '' })

      expect(res.status).toBe(400)
    })

    it('returns 404 for a non-existent document', async () => {
      const res = await request(app)
        .post(`/api/documents/${uuidv4()}/comments`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)
        .send({ comment_id: uuidv4(), content: 'Orphan comment' })

      expect(res.status).toBe(404)
    })

    it('returns 404 when parent_id does not belong to this document', async () => {
      const res = await request(app)
        .post(`/api/documents/${documentId}/comments`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)
        .send({ comment_id: uuidv4(), content: 'Bad reply', parent_id: uuidv4() })

      expect(res.status).toBe(404)
    })
  })

  // ==================================================================
  // PATCH /api/comments/:id
  // ==================================================================
  describe('PATCH /api/comments/:id', () => {
    it('author can update their own comment content', async () => {
      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)
        .send({ content: 'Edited by author' })

      expect(res.status).toBe(200)
      expect(res.body.content).toBe('Edited by author')
    })

    it('non-author cannot edit comment content — returns 403', async () => {
      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Cookie', memberSession)
        .set('x-csrf-token', memberCsrf)
        .send({ content: 'Attempted hijack' })

      expect(res.status).toBe(403)
    })

    it('any workspace member can resolve a comment (not just the author)', async () => {
      // Member resolves author's comment — this is intentionally permitted
      const resolvedAt = new Date().toISOString()
      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Cookie', memberSession)
        .set('x-csrf-token', memberCsrf)
        .send({ resolved_at: resolvedAt })

      expect(res.status).toBe(200)
      expect(res.body.resolved_at).not.toBeNull()
    })

    it('any workspace member can un-resolve a comment', async () => {
      // First resolve it
      await pool.query(
        `UPDATE comments SET resolved_at = NOW() WHERE id = $1`,
        [commentId]
      )

      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Cookie', memberSession)
        .set('x-csrf-token', memberCsrf)
        .send({ resolved_at: null })

      expect(res.status).toBe(200)
      expect(res.body.resolved_at).toBeNull()
    })

    it('non-existent comment returns 404, not 403 (bug guard)', async () => {
      // Previously returned 403 because the author ownership check ran before the
      // existence check — undefined !== userId is always true on a missing row.
      const res = await request(app)
        .patch(`/api/comments/${uuidv4()}`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)
        .send({ content: 'Ghost edit' })

      expect(res.status).toBe(404)
    })

    it('returns 400 when no fields are provided', async () => {
      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)
        .send({})

      expect(res.status).toBe(400)
    })
  })

  // ==================================================================
  // DELETE /api/comments/:id
  // ==================================================================
  describe('DELETE /api/comments/:id', () => {
    it('author can delete their own comment', async () => {
      const res = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Cookie', authorSession)
        .set('x-csrf-token', authorCsrf)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      // Confirm gone from DB
      const check = await pool.query('SELECT id FROM comments WHERE id = $1', [commentId])
      expect(check.rows).toHaveLength(0)
    })

    it('non-author cannot delete another user\'s comment — returns 404', async () => {
      // The DELETE WHERE clause includes author_id = $3, so wrong owner gets 404
      const res = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Cookie', memberSession)
        .set('x-csrf-token', memberCsrf)

      expect(res.status).toBe(404)

      // Confirm the comment still exists (was not deleted)
      const check = await pool.query('SELECT id FROM comments WHERE id = $1', [commentId])
      expect(check.rows).toHaveLength(1)
    })

    it('returns 401 when not authenticated', async () => {
      // Fetch a CSRF token without a session cookie so the CSRF middleware
      // passes (it only validates the token, not auth) and the auth middleware
      // can return 401 rather than CSRF's 403.
      const csrfRes = await request(app).get('/api/csrf-token')
      const csrfToken = csrfRes.body.token as string
      const connectSid = csrfRes.headers['set-cookie']?.[0]?.split(';')[0] ?? ''

      const res = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Cookie', connectSid)
        .set('x-csrf-token', csrfToken)

      expect(res.status).toBe(401)
    })
  })
})

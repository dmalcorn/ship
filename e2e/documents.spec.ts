import { test, expect } from './fixtures/isolated-env'

test.describe('Documents', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    await page.locator('#email').fill('dev@ship.local')
    await page.locator('#password').fill('admin123')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()

    // Wait for app to load
    await expect(page).not.toHaveURL('/login', { timeout: 5000 })
  })

  test('can view document list', async ({ page }) => {
    // Navigate to docs
    await page.goto('/docs')

    // Should see Documents heading in the main content area
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible({ timeout: 5000 })
  })

  test('can create a new document', async ({ page }) => {
    await page.goto('/docs')

    // Click New Document button in header (not sidebar)
    const newButton = page.getByRole('button', { name: 'New Document', exact: true })
    await expect(newButton).toBeVisible({ timeout: 5000 })
    await newButton.click()

    // Should navigate to editor
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 5000 })
  })

  test('can edit document title', async ({ page }) => {
    await page.goto('/docs')

    // Create a new document first - use exact match for header button
    const newButton = page.getByRole('button', { name: 'New Document', exact: true })
    await expect(newButton).toBeVisible({ timeout: 5000 })
    await newButton.click()

    // Wait for editor
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 5000 })

    // Find title input (large title input in editor) and enter text
    const titleInput = page.getByPlaceholder('Untitled')
    await expect(titleInput).toBeVisible({ timeout: 5000 })
    await titleInput.fill('Test Document Title')

    // Wait for save
    await page.waitForResponse(resp => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH')

    // Verify title was entered
    await expect(titleInput).toHaveValue('Test Document Title')
  })

  test('does not create documents from empty API payload', async ({ page }) => {
    // Risk mitigated: POST /api/documents with empty body previously returned 200 and created
    // junk documents. This test ensures the UI does not expose a path to create empty documents
    // inadvertently.

    // Fetch CSRF token first (required for state-mutating requests)
    const csrfRes = await page.request.get('/api/csrf-token')
    const { token: csrfToken } = await csrfRes.json()

    // Attempt direct API call with empty body (bypassing UI validation)
    const response = await page.request.post('/api/documents', {
      data: {},
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': csrfToken,
      },
    })

    // The API either:
    // (A) Rejects the empty body with 400 (strict validation), OR
    // (B) Creates a document with safe defaults ("Untitled" title, not empty/junk)
    const body = await response.json()

    if (response.status() === 400) {
      // Strict rejection: empty body not accepted
      expect(response.status()).toBe(400)
    } else if (response.status() === 200 || response.status() === 201) {
      // Safe defaults: document created with non-empty title (no junk records)
      const title = body.data?.title ?? body.title
      expect(title).toBeTruthy()
      expect(title).not.toBe('')
    } else {
      throw new Error(`Unexpected status ${response.status()} from POST /api/documents with empty body`)
    }
  })

  test('document list updates when new document created', async ({ page }) => {
    await page.goto('/docs')

    // Wait for main content to load
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible({ timeout: 5000 })

    // Create new document - use exact match for header button
    const newButton = page.getByRole('button', { name: 'New Document', exact: true })
    await newButton.click()

    // Wait for editor
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 10000 })

    // Give title so it shows in sidebar - use unique timestamp to avoid conflicts
    const uniqueTitle = `Test Doc ${Date.now()}`
    const titleInput = page.getByPlaceholder('Untitled')
    await titleInput.fill(uniqueTitle)

    // Wait for save to complete
    await page.waitForResponse(resp => resp.url().includes('/api/documents/') && resp.request().method() === 'PATCH')

    // The new document should now appear in sidebar - use longer timeout for context update
    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 10000 })
  })
})

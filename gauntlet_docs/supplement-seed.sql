DO $$
DECLARE
  ws_id UUID := '71c50b54-69ad-4dbf-ace5-b884951c3ff6';
  dev_user_id UUID := 'd38d3e92-dcd1-495c-a5bb-28e9f75df15c';
  new_user_id UUID;
  new_doc_id UUID;
  i INT;
  issue_titles TEXT[] := ARRAY[
    'Implement rate limiting on API endpoints',
    'Add cursor-based pagination to documents list',
    'Fix memory leak in WebSocket connection pool',
    'Migrate from ILIKE to full-text search with tsvector',
    'Add Redis caching layer for frequently accessed documents',
    'Optimize Yjs state persistence to avoid full rewrites',
    'Implement document archival bulk action',
    'Add export to PDF functionality',
    'Fix race condition in concurrent sprint creation',
    'Implement soft-delete cleanup cron job',
    'Add GraphQL schema alongside REST API',
    'Fix issue with emoji picker on mobile viewports',
    'Implement keyboard shortcut customization',
    'Add document version history diff view',
    'Fix broken backlink resolution after document rename',
    'Implement workspace-level audit log viewer',
    'Add dark mode support across all components',
    'Fix TipTap table resize handle on Firefox',
    'Implement inline comment threading',
    'Add Slack notification integration for issue assignments',
    'Fix session expiry not logging out all browser tabs',
    'Implement drag-and-drop issue prioritization',
    'Add bulk status update for sprint board',
    'Fix CORS preflight failures on certain CDN configurations',
    'Implement document template library',
    'Add two-factor authentication support',
    'Fix timestamp display in non-US timezones',
    'Implement API key management UI',
    'Add CSV export for issue backlog',
    'Fix missing aria-label on toolbar icon buttons',
    'Implement sprint velocity tracking dashboard',
    'Add webhook support for document changes',
    'Fix content overflow in narrow sidebar mode',
    'Implement global search with filters',
    'Add mention autocomplete in comments',
    'Fix Y.js conflict on simultaneous title edits',
    'Implement read-only document sharing via link',
    'Add Lighthouse CI to deployment pipeline',
    'Fix 500 error on documents with null yjs_state',
    'Implement program health score calculation',
    'Add issue dependency tracking',
    'Fix focus trap in CommandPalette on Escape',
    'Implement recurring standup reminders',
    'Add custom field support for issues',
    'Fix infinite scroll not triggering near list bottom',
    'Implement document change notifications',
    'Add SAML SSO integration',
    'Fix broken mention links after user deactivation',
    'Implement batch document move between projects',
    'Add Gantt chart view for sprints',
    'Fix PostgreSQL connection pool exhaustion under load',
    'Implement optimistic UI updates for issue status changes',
    'Add per-workspace feature flags',
    'Fix emoji rendering in PDF export',
    'Implement sprint goal tracking',
    'Add document locking for review workflows',
    'Fix audio/video attachment preview',
    'Implement project milestone view',
    'Add time-tracking fields to issues',
    'Fix broken pagination on team members page',
    'Implement document search within sidebar',
    'Add user presence indicators on document list',
    'Fix code block syntax highlighting for Rust',
    'Implement issue priority auto-sort',
    'Add cross-workspace document linking',
    'Fix missing loading state on initial document fetch',
    'Implement document access control by role',
    'Add inline image resizing in TipTap editor',
    'Fix sprint board not reflecting real-time updates',
    'Implement issue lifecycle automation rules',
    'Add approval workflow for wiki edits',
    'Fix incorrect sprint assignment on issue creation',
    'Implement document commenting via email reply',
    'Add workspace usage analytics dashboard',
    'Fix stale React Query cache after WebSocket update',
    'Implement issue escalation workflow',
    'Add per-user notification preferences',
    'Fix ContentHistoryPanel not showing all versions',
    'Implement batch issue import from CSV',
    'Add document word count and reading time estimate',
    'Fix program selector not filtering archived programs',
    'Implement sprint retrospective template engine',
    'Add role-based access control for projects',
    'Fix broken file attachment download on Safari',
    'Implement document clone functionality',
    'Add color coding for issue priority levels',
    'Fix z-index conflict between tooltip and modal overlay',
    'Implement auto-assign based on team rotation',
    'Add Markdown paste-to-rich-text conversion',
    'Fix missing error boundary on SprintBoard component',
    'Implement issue comment reactions',
    'Add workspace switcher to navigation',
    'Fix typo in onboarding welcome email template',
    'Implement document pin to sidebar feature',
    'Add multi-select filter for document type',
    'Fix blank state not showing on empty sprint backlog',
    'Implement AI-powered issue title suggestions',
    'Add Zapier integration support',
    'Fix memory usage spike during large document load',
    'Implement document co-authorship tracking',
    'Add program roadmap timeline view',
    'Fix tooltip clipping in collapsed sidebar',
    'Implement lazy loading for document history panel',
    'Add keyboard navigation to CommandPalette results',
    'Fix incorrect created_by attribution on cloned issues',
    'Implement document merge from two sources',
    'Add image alt-text prompt in TipTap editor',
    'Fix missing scroll-to-active-item in document tree',
    'Implement sprint capacity planning view',
    'Add system health status page',
    'Fix truncated title in document search results',
    'Implement per-sprint burn-down chart',
    'Add anonymous user read-only view',
    'Fix duplicate issue creation on double form submit',
    'Implement cross-program issue linking',
    'Add page-level print stylesheet',
    'Fix document tree collapse state not persisting',
    'Implement automated regression test for auth flows',
    'Add user deactivation workflow',
    'Fix autocomplete dropdown clipping off screen',
    'Implement custom dashboard widgets',
    'Add watermark to exported PDFs',
    'Fix avatar initials not updating after name change',
    'Implement issue recurrence scheduling',
    'Add theme color customization per workspace',
    'Fix broken link preview on external URLs',
    'Implement document sign-off workflow',
    'Add sprint planning poker integration',
    'Fix edge case in Yjs merge for list nodes',
    'Implement notification digest emails',
    'Add document table of contents generation',
    'Fix broken back-navigation after modal close',
    'Implement custom emoji support',
    'Add tab-separated value export for reports',
    'Fix missing focus ring on custom checkbox components',
    'Implement document embedding in external sites',
    'Add comment thread resolution tracking',
    'Fix sidebar tree not expanding to active document',
    'Implement sprint review meeting notes template',
    'Add workspace backup and restore functionality',
    'Fix incorrect P95 latency reporting in health endpoint',
    'Implement branch-based document preview',
    'Add real-time cursor tracking across editor instances',
    'Fix stale data after browser tab becomes active again',
    'Implement document subscription notifications',
    'Add issue triage queue view',
    'Fix broken copy-to-clipboard on HTTP context',
    'Implement drag-to-reorder sidebar items',
    'Add color contrast validation to design system',
    'Fix infinite loop in tree node collapse handler',
    'Implement document approval audit trail',
    'Add sprint comparison view across weeks',
    'Fix empty state illustration sizing on mobile',
    'Implement issue sub-task hierarchy',
    'Add configurable session timeout per workspace',
    'Fix missing skeleton loader on profile page',
    'Implement GitHub PR linking on issues',
    'Add Figma embed support in documents',
    'Fix incorrect sort order in document history list',
    'Implement workspace-level issue templates',
    'Add document change stream via Server-Sent Events',
    'Fix broken tooltip on disabled button states',
    'Implement per-project access control lists',
    'Add notification bell with unread count badge',
    'Fix missing cleanup of orphaned yjs_state blobs',
    'Implement document freshness indicator',
    'Add sprint goal progress ring visualization',
    'Fix broken table of contents anchor links in editor',
    'Implement issue time-to-close analytics',
    'Add custom domain support for hosted workspaces',
    'Fix 401 not redirecting to login on API timeout',
    'Implement document content preview in search results',
    'Add optional field grouping in properties panel',
    'Fix missing aria-live region for toast notifications',
    'Implement document checklist completion percentage',
    'Add Mermaid diagram rendering in TipTap',
    'Fix incorrect workspace isolation in multi-tenant query',
    'Implement sprint anomaly detection alerts',
    'Add bulk archive for completed sprints',
    'Fix focus not returning to trigger after dialog close',
    'Implement document revision comparison view',
    'Add real-time issue count badges on sidebar',
    'Fix emoji picker search not filtering by category',
    'Implement automated sprint close workflow',
    'Add WCAG color contrast report to CI pipeline',
    'Fix incorrect program_id after document conversion',
    'Implement priority-weighted issue sorting',
    'Add link unfurl preview cards in editor',
    'Fix missing validation on empty sprint title',
    'Implement document recently-viewed list',
    'Add keyboard shortcut cheat sheet modal',
    'Fix broken WebSocket reconnect after network error',
    'Implement per-user task inbox view',
    'Add document activity stream to properties panel',
    'Fix issue card not reflecting assignee change in real time',
    'Implement data retention policy enforcement',
    'Add sprint effort estimation by story points',
    'Fix broken table cell merge in TipTap',
    'Implement role-based dashboard layouts',
    'Add workspace-level custom terminology support',
    'Fix missing cursor position sync after reconnect',
    'Implement document text search with highlighting',
    'Add external reviewer access via email invite',
    'Fix z-order stacking issue in nested modals',
    'Implement issue blocking relationship visualization',
    'Add export to JIRA compatible format',
    'Fix blank screen on 403 response from API',
    'Implement sprint health traffic light indicator',
    'Add document table row striping for readability',
    'Fix autosave triggering on read-only documents',
    'Implement cross-workspace search',
    'Add server-side rendering for public document previews',
    'Fix incorrect pagination offset on filtered list',
    'Implement document footnote support in TipTap',
    'Add inline code block language selector',
    'Fix missing document_type in OpenAPI schema definition',
    'Implement workspace onboarding checklist',
    'Add user session activity log',
    'Fix broken markdown heading anchor generation',
    'Implement document change approval queue',
    'Add color-coded status dots to sprint board cards',
    'Fix scrollbar appearing over dropdown menus',
    'Implement audit log export to CSV',
    'Add animated progress bar to file upload',
    'Fix broken drag handle in nested list items',
    'Implement document watermark for confidential content',
    'Add per-program capacity limits',
    'Fix flash of unstyled content on initial app load',
    'Implement collaborative whiteboard integration',
    'Add sprint milestone marker on timeline',
    'Fix incorrect count in program dashboard stats',
    'Implement voice memo attachment support',
    'Fix broken undo stack after paste from clipboard',
    'Implement issue dependency gantt visualization',
    'Add workspace announcement banner',
    'Fix missing loading state on team member list fetch',
    'Implement document formatting toolbar auto-hide',
    'Add sprint burnup chart alongside burndown',
    'Fix incorrect ordering of weekly plan items',
    'Implement issue vote and upvote system',
    'Add document versioning policy configuration',
    'Fix missing error state on failed file upload',
    'Implement workspace-level custom roles',
    'Add interactive sprint retrospective board',
    'Fix broken focus management in CommandPalette',
    'Implement document metadata extraction for search',
    'Add per-issue time log entries',
    'Fix incorrect badge count after bulk close operation',
    'Implement cross-document reference graph view',
    'Add automated accessibility regression tests to CI',
    'Fix missing rate limit headers on API responses'
  ];
  num_titles INT := array_length(issue_titles, 1);
  projects_arr UUID[];
  rand_proj UUID;
  u_name TEXT;
  u_email TEXT;
  user_names TEXT[] := ARRAY[
    'Lisa Park', 'Maria Rodriguez', 'Nathan Scott', 'Oliver Brown',
    'Patricia Davis', 'Quinn Taylor', 'Rachel Anderson', 'Samuel Wilson',
    'Tanya Moore', 'Uma Patel'
  ];
  statuses TEXT[] := ARRAY['backlog', 'in_progress', 'in_review', 'done'];
  priorities TEXT[] := ARRAY['low', 'medium', 'high', 'urgent'];
BEGIN
  -- Collect existing project ids
  SELECT ARRAY(SELECT id FROM documents WHERE workspace_id = ws_id AND document_type = 'project' AND deleted_at IS NULL)
    INTO projects_arr;

  -- 1. Add 10 new users + person documents
  FOR i IN 1..10 LOOP
    u_name  := user_names[i];
    u_email := lower(regexp_replace(u_name, ' ', '.', 'g')) || '@ship.local';

    IF NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(u_email)) THEN
      INSERT INTO users (email, name, last_workspace_id)
        VALUES (u_email, u_name, ws_id)
        RETURNING id INTO new_user_id;

      INSERT INTO workspace_memberships (workspace_id, user_id, role)
        VALUES (ws_id, new_user_id, 'member')
        ON CONFLICT DO NOTHING;

      INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
        VALUES (ws_id, 'person', u_name,
                jsonb_build_object('email', u_email, 'user_id', new_user_id, 'reports_to', dev_user_id),
                dev_user_id);
    END IF;
  END LOOP;

  -- 2. Add 280 issues spread across existing projects
  FOR i IN 1..280 LOOP
    rand_proj := projects_arr[1 + ((i - 1) % array_length(projects_arr, 1))];

    INSERT INTO documents (workspace_id, document_type, title, properties, created_by)
      VALUES (
        ws_id,
        'issue',
        issue_titles[1 + ((i - 1) % num_titles)],
        jsonb_build_object(
          'status',   statuses[1 + ((i - 1) % 4)],
          'priority', priorities[1 + ((i - 1) % 4)]
        ),
        dev_user_id
      )
      RETURNING id INTO new_doc_id;

    IF rand_proj IS NOT NULL THEN
      INSERT INTO document_associations (document_id, related_id, relationship_type)
        VALUES (new_doc_id, rand_proj, 'project')
        ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Supplement seed complete.';
END $$;

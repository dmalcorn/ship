# 03 — Implementation Setup

Steps to prepare the project for AI agent-driven development after planning artifacts and the dev environment are complete.

---

## Step 1: Create CLAUDE.md

Create `/workspace/CLAUDE.md` as the central context file for all AI agents entering the project. The goal is for agents to start implementing stories without having to read all planning documents from scratch.

Extract and consolidate from your planning artifacts:

**From the PRD / spec:**
- Project purpose and problem statement
- Hard requirements with their IDs (MVP-1, FEAT-2, etc.)
- Non-functional requirements (performance, security, reliability targets)

**From the architecture doc:**
- Tech stack with pinned versions
- Directory structure (complete file layout)
- API contracts (endpoints, request/response shapes, protocols)
- Data models and schema
- Configuration variables and their defaults
- Error handling patterns

**From the UX/design doc:**
- Key UX patterns, layout conventions, interaction rules

**From the epic/story list:**
- Build sequence — which epics are MVP-critical vs. can be cut
- Any cross-cutting concerns agents must know

**Operational context:**
- Where any external source directories or data are mounted (e.g., `/source`)
- Environment variables agents should assume are set
- How to run the app, run tests, run the linter

**Keep it practical:**
- Target under 200 lines if this file will be auto-loaded into agent memory (it will be truncated beyond that)
- For project-root `CLAUDE.md` files, longer is fine — they are read on demand
- Agents that read this file should be able to start coding immediately

## Step 2: Verify External Sources and Data

If your project processes or analyzes external source material (a codebase, dataset, corpus, etc.):

- Confirm the external source is accessible at the expected path inside the container
- Document the path and the environment variable that points to it in `CLAUDE.md`
- Verify the content looks correct (spot-check a few files or records)
- If agents need access to these files, ensure the path is listed in `additionalDirectories` in `.claude/settings.json`

## Step 3: Configure Agent Permissions

Create `.claude/settings.json` in the repo root to define what AI agents are allowed to do. This prevents agents from being blocked by permission prompts during development, while maintaining guardrails against destructive actions.

**Template:**

```jsonc
{
  "permissions": {
    "allow": [
      // Shell commands agents need for normal development
      "Bash(<runtime> *)",           // e.g., Bash(python *), Bash(node *), Bash(go *)
      "Bash(<package-manager> *)",   // e.g., Bash(pip *), Bash(npm *), Bash(pnpm *)
      "Bash(<test-runner> *)",       // e.g., Bash(pytest *), Bash(vitest *), Bash(go test *)
      "Bash(<dev-server> *)",        // e.g., Bash(uvicorn *), Bash(npm run dev)
      "Bash(<linter> *)",            // e.g., Bash(ruff *), Bash(eslint *)
      "Bash(git status)", "Bash(git add *)", "Bash(git commit *)",
      "Bash(git diff *)", "Bash(git log *)", "Bash(git branch *)",
      "Bash(git checkout *)", "Bash(git stash *)",
      "Bash(ls *)", "Bash(mkdir *)", "Bash(cp *)", "Bash(mv *)",
      "Bash(cat *)", "Bash(wc *)", "Bash(find *)", "Bash(head *)", "Bash(tail *)",

      // File access — list directories agents should be able to edit
      "Edit(<src-dir>/**)",
      "Edit(<tests-dir>/**)",
      "Edit(<scripts-dir>/**)",
      "Edit(.gitignore)",
      "Edit(CLAUDE.md)",
      "Edit(<dependency-manifest>)",

      // External source read access (if applicable)
      "Read(<external-source-path>/**)"
    ],
    "deny": [
      // Safety guardrails — never allow these
      "Read(.env)",
      "Read(.env.dev)",
      "Read(.env.prod)",
      "Bash(rm -rf *)",
      "Bash(git push *)",
      "Bash(git reset --hard *)"
    ]
  },
  // If agents need access to directories outside the workspace root
  "additionalDirectories": [
    "<external-source-path>"
  ]
}
```

**Guiding principles:**
- Allow everything agents need to do their job without friction
- Deny anything that leaks secrets, deletes work, or affects shared state without human review
- `git push` is always denied — human reviews the diff and pushes manually
- `rm -rf` is always denied — use specific targeted deletions instead
- Env files (`.env`, `.env.dev`, `.env.prod`) are always denied — agents should never read live secrets
- `additionalDirectories` is required if any allowed `Read()` path falls outside the workspace root

## Notes

- `CLAUDE.md` at the project root is automatically loaded into agent context at the start of each conversation — keep it concise and high-signal
- A memory file at `~/.claude/projects/<project>/memory/MEMORY.md` can hold cross-session notes; it is also auto-loaded but truncated at 200 lines
- If you add new source directories to the project, update the `Edit()` allowlist in `settings.json`
- The `additionalDirectories` setting is critical — without it, agents cannot read paths outside the workspace root even if they appear in the `allow` list
- Prefer explicit allowlists over broad wildcards; the goal is to allow the expected workflow, not all possible shell commands

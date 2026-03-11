# 01 — Project Setup

Steps to go from zero to ready-to-code on any new project.

---

## Step 1: Set Up Working Directory

- Create a top-level working directory for the project on your local machine
- If the project involves an external codebase or dataset that is not yours (e.g., a library to analyze, a corpus to index), clone or copy it into a sibling directory — keep it separate from the app repo
- The external source stays local — it is NOT part of the app repo (may be too large, may not be our code)

Example layout:
```
MyProject/
  external-source/     <- third-party source (local only, not pushed)
  my-app/              <- app repo (pushed to GitHub)
```

## Step 2: Gather Source Requirements Documents

- Obtain the project spec, brief, or requirements document
- Read through the full spec to understand scope, deadlines, deliverables, and hard-gate requirements
- Note any specific methodology, appendix, or pre-work checklist the spec requires

## Step 3: Complete Pre-Project Research

- Before choosing any technology, do structured research on your options
- Use AI conversation to explore and compare approaches for each major decision area (database, framework, hosting, etc.)
- Lock in all technology choices with explicit rationale
- Output: a completed research/pre-search checklist document

## Step 4: Create Project Plan

- Build a timeline mapping all tasks from start to final delivery
- Organize around an MVP-first approach: the earliest milestone should be a working end-to-end pipeline deployed, even if minimal
- Identify risks and mitigations for each major decision
- Output: `project-plan.md`

## Step 5: Create PRD (Product Requirements Document)

- Extract every requirement from the spec into a single trackable document
- Assign unique IDs to each requirement with checkboxes (e.g., MVP-1, FEAT-2, SEC-3)
- Include any self-imposed quality commitments (error handling, logging, testing, etc.) as a separate section with their own IDs
- Output: `PRD.md`

## Step 6: Create App Repository

- Create the app repo directory (if you haven't already)
- Move all planning documents (PRD, project plan, research checklist, spec, repeatable-process/) into the app repo
- Reasoning: planning docs belong with the code they govern

## Step 7: Create App Directory Structure

- Create the skeleton folder structure for the application based on the architecture you've chosen
- Create any required package/module init files (e.g., `__init__.py` for Python, `index.ts` for TypeScript)
- The goal is an empty but valid structure that reflects the planned architecture

Example (adapt to your stack):
```
src/               # Application source
  api/             # API layer
  services/        # Business logic
  models/          # Data models
tests/             # Test suite
docs/              # Architecture docs, decisions
scripts/           # Utility/automation scripts
```

## Step 8: Create Config Files

- **`.gitignore`** — ignore build artifacts, env files, IDE files, OS files, and any large local-only data
- **`.env.example`** — template with all required environment variable names but no real values; committed to the repo
- **Dependency manifest** — list all required packages (e.g., `requirements.txt`, `package.json`, `go.mod`); use minimum bounds initially, pin exact versions before containerizing

## Step 9: Create README.md

- Project description and purpose
- Tech stack table
- Quick start instructions
- Project structure overview
- Links to planning docs and deployed app (placeholder until deployed)

## Step 10: Set Up Git & GitHub

```bash
# Initialize repo
git init
git branch -m master main

# Create GitHub repo (private initially)
gh repo create <repo-name> --private

# Connect and push
git remote add origin https://github.com/<username>/<repo-name>.git
git push -u origin main

# Set default branch on GitHub
gh repo edit --default-branch main
```

- Commit all initial files and push to `origin/main`
- Make the repo public before any public submission deadline

### GitHub CLI Authentication

Install `gh` (GitHub CLI) and authenticate:

```bash
gh auth login
```

Choose HTTPS, authenticate via browser or paste a Personal Access Token. After setup, `git push` / `git pull` work without credential prompts.

**Fallback (manual PAT):** If pushing without `gh`, Git will prompt for credentials:
- **Username**: your GitHub username
- **Password**: a Personal Access Token (not your GitHub password)

To create a PAT: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token → select the `repo` scope.

### Switch Remote to HTTPS (Dev Container / No SSH)

If the dev container does not have an SSH client, Git pushes over SSH will fail. Switch to HTTPS:

```bash
git remote set-url origin https://github.com/<username>/<repo-name>.git
git remote -v   # verify
```

### Git Configuration

Apply these settings so commits are attributed correctly and line endings are consistent:

| Setting | Recommended Value | Purpose |
|---|---|---|
| `user.name` | Your name | Commit author name |
| `user.email` | Your email | Commit author email |
| `core.autocrlf` | `input` | Convert CRLF→LF on commit, leave working copy as-is |
| `init.defaultBranch` | `main` | New repos default to `main` instead of `master` |

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global core.autocrlf input
git config --global init.defaultBranch main
```

In a dev container, these are re-applied by `postCreateCommand` on every rebuild — do not hardcode one person's identity in shared scripts.

---

## Outputs from this phase

| File | Description |
|---|---|
| `research-checklist.md` | Completed pre-project research with technology decisions |
| `project-plan.md` | Timeline with tasks, milestones, and risk mitigations |
| `PRD.md` | All requirements with unique IDs and checkboxes |
| `.gitignore` | Git ignore rules |
| `.env.example` | Environment variable template (no real values) |
| `<dependency-manifest>` | Package list (requirements.txt, package.json, etc.) |
| `README.md` | Project overview and quick start |

## Key Decision: Separate External Source from App Repo

If your project processes or analyzes an external codebase or dataset, keep it in its own local directory outside the app repo. Reference it via an environment variable rather than a hardcoded path. This keeps the repo clean, the Docker image small, and the deployed app independent of the source material.

## Key Decision: MVP-First Timeline

Structure the project plan so the earliest milestone is a thin but complete working pipeline: ingest → process → serve → deploy. Iterate from there. This surfaces integration problems early and ensures something is always shippable.

## Key Decision: Unique Requirement IDs

Assigning unique IDs to every requirement in the PRD (MVP-1, FEAT-2, etc.) makes them referenceable in commit messages, story files, and agent prompts. It also makes it easy to confirm that every requirement has been addressed before submission.

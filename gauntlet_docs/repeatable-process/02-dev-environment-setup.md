# 02 — Dev Environment Setup

Steps to containerize the development environment using VS Code Dev Containers and Docker Desktop.

---

## Step 1: Verify Prerequisites

- Docker Desktop is installed and running
  ```bash
  docker --version
  docker compose version
  ```
- VS Code is installed with the **Dev Containers** extension (`ms-vscode-remote.remote-containers`)
- If Docker Desktop is not installed: https://www.docker.com/products/docker-desktop/
- If the extension is not installed: VS Code → Extensions → search "Dev Containers" → Install

## Step 2: Research Latest Stable Package Versions

Before pinning any dependency, look up the current stable release for every package your project needs:

- Check the appropriate registry (PyPI, npm, pkg.go.dev, crates.io, etc.)
- Check the release date — prefer releases that have been out for at least a few weeks
- Watch for compatibility constraints between packages (e.g., if Library A only supports Runtime ≤ X.Y, don't use X.Z)
- Document your findings in a table:

  | Package | Version | Released | Registry | Notes |
  |---|---|---|---|---|
  | (runtime) | x.y.z | date | link | |
  | (framework) | x.y.z | date | link | |
  | (key library) | x.y.z | date | link | |

## Step 3: Pin Dependencies

- Update your dependency manifest to use exact version pins (`==`, `@x.y.z`, etc.) instead of minimum bounds
- Exact pins guarantee every developer and every build gets the same package versions
- Output: updated dependency manifest

## Step 4: Choose Container Strategy

**Option A — Custom Dockerfile** (more control):

Create a `Dockerfile` in the repo root:
- Start from an appropriate base image (e.g., `python:3.13-slim`, `node:22-slim`, `golang:1.25`)
- Set working directory to `/workspace`
- Copy the dependency manifest first and install dependencies (leverages Docker layer caching)
- Copy application code
- Expose the app's default port
- Set the default startup command

**Option B — Pre-built devcontainer image + features** (simpler, no Dockerfile needed):

Use a Microsoft-provided devcontainer base image and compose additional tools declaratively:

```jsonc
{
  "name": "my-project-dev",
  "image": "mcr.microsoft.com/devcontainers/python:3.13",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "22" },
    "ghcr.io/devcontainers/features/github-cli:1": {},
    "ghcr.io/devcontainers/features/docker-outside-of-docker:1": { "dockerDashComposeVersion": "v2" }
  },
  "remoteUser": "vscode"
}
```

**When to use which:**
- **Features**: primary language is covered by a pre-built image and you just need to add secondary tools. Simpler, no Dockerfile to maintain.
- **Custom Dockerfile**: need fine-grained OS-level control, custom apt packages, or no suitable pre-built image exists.

Available pre-built images: `mcr.microsoft.com/devcontainers/{python,typescript-node,go,rust,java,dotnet,cpp,universal}`. Browse features at https://containers.dev/features.

## Step 5: Create .dockerignore

Create `.dockerignore` in the repo root to keep image builds clean and fast:

```
.git/
.env
.env.*
!.env.example
.vscode/
.devcontainer/
docs/
data/
*.log
# Add any large or sensitive files/directories
```

This prevents secrets and bloat from leaking into the image.

## Step 6: Create docker-compose.yml

Create `docker-compose.yml` for container orchestration:

```yaml
services:
  app:
    build: .        # or image: <name> if not using a custom Dockerfile
    ports:
      - "<host-port>:<container-port>"
    volumes:
      - .:/workspace                      # live code editing
      # If you have an external source directory:
      # - ${EXTERNAL_SOURCE_PATH}:/source:ro
    env_file: .env.dev
    environment:
      # Override host-specific paths with stable container paths
      # EXTERNAL_SOURCE_PATH: /source
```

**Important (Windows/WSL2 + Dev Container):** Bind mounts from a 9p-mounted workspace into inner Docker containers do not work — see "Key Decision: No Bind Mounts from 9p Workspace" below.

## Step 7: Create .devcontainer/devcontainer.json

Create `.devcontainer/devcontainer.json` to configure VS Code's container integration:

```jsonc
{
  "name": "my-project-dev",
  // If using docker-compose:
  "dockerComposeFile": "../docker-compose.yml",
  "service": "app",
  // If using image + features directly (no docker-compose):
  // "image": "mcr.microsoft.com/devcontainers/python:3.13",
  "workspaceFolder": "/workspace",
  "remoteUser": "vscode",
  "customizations": {
    "vscode": {
      "extensions": [
        // Add language extension, linter, formatter, Claude Code, etc.
        "anthropic.claude-code"
      ],
      "settings": {
        // Set interpreter path, formatter, linter defaults
      }
    }
  },
  "forwardPorts": [<app-port>],
  "portsAttributes": {
    "*": { "onAutoForward": "silent" }   // auto-forward OAuth callback ports
  },
  "mounts": [
    // Named volumes for CLI auth — survive container rebuilds
    "source=<project>-gh-config,target=/home/vscode/.config/gh,type=volume",
    "source=<project>-claude-config,target=/home/vscode/.claude,type=volume"
  ],
  "remoteEnv": {
    // Override Windows host paths with container-local paths
    "CLAUDE_CONFIG_DIR": "/home/vscode/.claude"
  },
  "postCreateCommand": "bash .devcontainer/post-create.sh"
}
```

**Persist VS Code extensions:** Any extension listed in `customizations.vscode.extensions` is auto-installed on every container build — no manual reinstall needed.

**Persist CLI auth:** CLI tools (GitHub CLI, Claude Code) store auth tokens inside the container. Without named volumes, tokens are lost on every rebuild. Prefix volume names with the project name to avoid collisions between projects on the same Docker host.

**Fix volume ownership:** Docker creates named volumes as `root`. If using `remoteUser: "vscode"`, add a `chown` step at the top of the post-create script:
```bash
sudo chown -R vscode:vscode /home/vscode/.claude /home/vscode/.config/gh 2>/dev/null || true
```

**Auto-forward OAuth ports:** CLI tools authenticate via OAuth by opening a temporary HTTP server on a random port. `"onAutoForward": "silent"` ensures VS Code forwards these ports automatically without pop-up notifications.

## Step 8: Create .devcontainer/post-create.sh

Use a shell script for the post-create setup sequence instead of an inline command chain. This is easier to read, maintain, and debug:

```bash
#!/bin/bash
set -euo pipefail

# Clean up rogue directories created by VS Code extensions resolving
# Windows host paths (e.g., C:\Users\...) as literal Linux paths in the container
find . -maxdepth 1 -type d -name 'C:*' -exec rm -rf {} + 2>/dev/null || true

# Fix ownership on named volumes (Docker creates them as root)
sudo chown -R vscode:vscode /home/vscode/.claude /home/vscode/.config/gh 2>/dev/null || true

# Git configuration (non-identity settings — safe to apply on every rebuild)
# Do NOT hardcode user.name/user.email — each developer has their own identity
if [ -z "$(git config --global user.name 2>/dev/null)" ]; then
  echo "No git user.name set — run: git config --global user.name 'Your Name'"
fi
if [ -z "$(git config --global user.email 2>/dev/null)" ]; then
  echo "No git user.email set — run: git config --global user.email 'you@example.com'"
fi
git config --global core.autocrlf input
git config --global init.defaultBranch main

# GitHub CLI credential helper (tolerates unauthenticated state)
gh auth setup-git 2>/dev/null || echo "gh not yet authenticated — run 'gh auth login'"

# Switch remote to HTTPS if currently SSH (SSH won't work without an SSH client)
REMOTE_URL=$(git remote get-url origin 2>/dev/null || true)
if [[ "$REMOTE_URL" == git@* ]]; then
  HTTPS_URL=$(echo "$REMOTE_URL" | sed 's|git@github.com:|https://github.com/|')
  git remote set-url origin "$HTTPS_URL"
  echo "Switched remote from SSH to HTTPS: $HTTPS_URL"
fi

# Install dependencies
# (adapt for your stack: pip, npm, pnpm, go mod download, cargo build, etc.)
# <your install command>

# Install pre-commit hooks
# pre-commit install

echo "NOTE: If first time, run 'gh auth login' and 'claude' to authenticate."
```

Key patterns:
- **`set -euo pipefail`** — fail fast on any error, undefined variable, or pipe failure
- **No hardcoded git identity** — warn if unset rather than overwrite; each developer provides their own
- **Idempotent** — safe to run on every rebuild without side effects
- **`chmod` with fallback** — `chmod +x` on git hooks may fail on Windows bind-mounted `.git/` directories; use `2>/dev/null || true`

## Step 9: Create Environment Files

```bash
cp .env.example .env.dev
```

Fill in real values in `.env.dev`. Convention:

| File | Purpose | Committed? |
|---|---|---|
| `.env.example` | Template with variable names, no real values | Yes |
| `.env.dev` | Local dev secrets | No (gitignored) |
| `.env.prod` | Production secrets, if needed locally | No (gitignored) |

In practice, production env vars are set directly in the hosting platform's dashboard — no `.env.prod` file is deployed.

## Step 10: Open the Project in the Dev Container

- Open VS Code in the repo root
- Press `Ctrl+Shift+P` → "Dev Containers: Reopen in Container"
- VS Code will build the image, start the container, install extensions, and open the workspace
- First build takes longer (downloading base image + installing deps). Subsequent opens reuse the cache.

## Step 11: Verify the Environment

After the container opens, confirm everything works:

```bash
# Runtime version
<runtime> --version    # e.g., python --version, node --version, go version

# Dependencies installed
<list-packages>        # e.g., pip list, npm ls, go list -m all

# Environment variables loaded
env | grep <KEY_PREFIX>

# App starts
<start-command>        # e.g., uvicorn app.main:app, npm run dev
# Open http://localhost:<port> in the host browser
```

Also verify:
- Terminal is inside the container (not the host)
- Language extension provides IntelliSense and go-to-definition
- Any external source directories are mounted and visible

## Step 12: Development Workflow

- **Edit code normally in VS Code** — files live on the host via bind mount; terminal and IntelliSense both use the container's environment
- **Run scripts from the VS Code terminal** — all commands execute inside the container
- **Debugging** — use VS Code's built-in debugger (F5); it runs natively inside the container
- **Rebuild the container** (after changing `Dockerfile`, `devcontainer.json`, or dependency manifest):
  - `Ctrl+Shift+P` → "Dev Containers: Rebuild Container"
- **Stop** — close the VS Code window; the container stops automatically

## Step 13: Set Up Pre-Commit Hooks

Pre-commit hooks enforce code quality before changes reach the repo.

**Universal hooks (any stack):**
- **trailing-whitespace** — strip trailing spaces
- **end-of-file-fixer** — ensure files end with a newline
- **check-yaml** / **check-json** — validate config file syntax
- **check-merge-conflict** — catch leftover conflict markers
- **check-added-large-files** — block files over a size limit (e.g., 500 KB)
- **detect-secrets** — scan staged files for accidentally committed API keys and tokens

**Stack-specific hooks** (add what's appropriate):
- Python: `ruff` (linting + formatting), `mypy` (type checking in CI)
- JavaScript/TypeScript: `eslint`, `prettier`
- Go: `gofmt`, `golangci-lint`
- Any: `shellcheck` for shell scripts

**Setup pattern:**
1. Add hook tooling to your dev-only dependency file (e.g., `requirements-dev.txt`, dev `devDependencies`)
2. Create `.pre-commit-config.yaml` (if using the `pre-commit` framework) or equivalent
3. Generate a secrets baseline: `detect-secrets scan > .secrets.baseline` (commit this file)
4. Install hooks: `pre-commit install` (or equivalent)
5. Verify: `pre-commit run --all-files`
6. Add hook installation to the post-create script so it's automatic on every container rebuild

---

## Outputs from this phase

| File | Description |
|---|---|
| `Dockerfile` | Container image definition (if using custom image) |
| `.dockerignore` | Files excluded from Docker build context |
| `docker-compose.yml` | Service orchestration (ports, volumes, env) |
| `.devcontainer/devcontainer.json` | VS Code Dev Container configuration |
| `.devcontainer/post-create.sh` | Post-create setup script |
| `.env.dev` | Local dev secrets (not committed) |
| `<hook-config>` | Pre-commit hook definitions (e.g., `.pre-commit-config.yaml`) |
| `.secrets.baseline` | detect-secrets baseline (commit this) |

---

## Key Decision: Dev Containers over Plain Docker

VS Code runs inside the container — terminal, debugger, extensions, and IntelliSense all use the container's runtime environment directly. No dependencies need to be installed on the host. The `.devcontainer/` config is checked into the repo, so any developer gets an identical environment with one command.

## Key Decision: Pin Exact Versions

Use exact pins (`==`, `@x.y.z`) rather than minimum bounds. This guarantees reproducible builds — every developer and every deployment gets the same package versions. Research versions at the start of the project; update deliberately, not automatically.

## Key Decision: Separate Dev and Prod Environment Files

`.env.dev` holds local dev secrets. `.env.prod` holds production secrets if needed locally. Both are gitignored. The committed `.env.example` serves as the template. Production platforms (Railway, Elastic Beanstalk, etc.) receive env vars via their dashboards, not deployed files.

## Key Decision: Non-Root Container User

Pre-built devcontainer images ship with a non-root `vscode` user. Use it:

```jsonc
"remoteUser": "vscode"
```

This limits blast radius from malicious packages, prevents accidentally creating root-owned files in bind-mounted host directories, and matches the base image's design. Adjust named volume mount paths to `/home/vscode/...` instead of `/root/...`.

## Key Decision: No Bind Mounts from 9p Workspace (Windows/WSL2)

**Critical for Windows development with nested containers.**

When using a VS Code Dev Container on Windows/WSL2, the workspace is mounted via the 9p protocol. Docker containers launched from inside the dev container (via `docker compose up`) **cannot bind-mount files from this 9p filesystem** — mounts appear as empty directories silently.

**Workarounds:**

| Scenario | Broken | Working |
|---|---|---|
| Static config files | Bind mount from workspace | `COPY` in Dockerfile |
| Runtime-generated files | Bind mount from workspace | `docker cp` into named volume |
| Database migrations | `localhost` connection from dev container | Run via Docker network |
| Docker socket | — | `/var/run/docker.sock` bind mount (native WSL2 path, works) |

For static config, create custom Dockerfiles that `COPY` the config in at build time:
```dockerfile
FROM postgres:18-alpine
COPY initdb.d/ /docker-entrypoint-initdb.d/
```

For runtime-generated files, use `docker cp` to load them into a named volume before `docker compose up`.

**Debugging symptoms:** container logs show "Is a directory" for a file; mounted paths appear as empty directories; healthchecks show "no such file or directory".

## Claude Code CLI Persistence Across Rebuilds

Dev Containers are ephemeral — the container filesystem is wiped on every rebuild. Two things must survive a rebuild for Claude Code to work without manual intervention each time:

1. **The binary** — installed via `npm install -g @anthropic-ai/claude-code`
2. **Auth credentials** — stored at `~/.claude/` inside the container

### Install the CLI in `post-create.sh`

The `postCreateCommand` runs automatically on every container creation and rebuild. Add the install step there:

```bash
echo "Installing Claude Code CLI..."
npm install -g @anthropic-ai/claude-code
```

This reinstalls the CLI on every rebuild (~30 seconds, idempotent).

### Mount a Named Volume for `~/.claude`

A Docker **named volume** lives independently of the container — rebuilding does not delete it. Mount one at the path where Claude Code stores auth:

**`docker-compose.yml`:**
```yaml
services:
  app:
    volumes:
      - ..:/workspace:cached
      - claude_home:/home/node/.claude    # node user; use /home/vscode/.claude for vscode user

volumes:
  claude_home:
```

**Or via `devcontainer.json` `mounts` (if not using docker-compose):**
```jsonc
"mounts": [
  "source=myproject-claude-config,target=/home/vscode/.claude,type=volume"
]
```

Prefix the volume name with the project name to avoid collisions across projects on the same Docker host.

### Fix Volume Ownership

Docker creates named volumes as `root`. Add a `chown` at the top of `post-create.sh` before the install step so the non-root container user can write credentials:

```bash
sudo chown -R node:node /home/node/.claude 2>/dev/null || true
# (use vscode:vscode and /home/vscode/.claude if remoteUser is "vscode")
```

### First-Time Authentication

After the next rebuild, run `claude` once and complete the OAuth flow. Credentials are written to the named volume and persist across all future rebuilds automatically.

### How It Works

```
Container rebuild
      │
      ├── Container filesystem wiped
      ├── post-create.sh runs → npm install -g @anthropic-ai/claude-code
      └── Named volume reattached → ~/.claude credentials still present
```

---

## Key Decision: Windows Host Path Leakage in Dev Containers

VS Code extensions may resolve Windows host paths (e.g., `C:\Users\diane\.claude\...`) as literal Linux paths inside the container, creating directories like `C:Usersdiane.claude...` in the workspace root.

Three-layer defense:
1. **`remoteEnv` in devcontainer.json** — override host-derived paths with container-local paths (e.g., `CLAUDE_CONFIG_DIR: /home/vscode/.claude`)
2. **Cleanup in post-create.sh** — `find . -maxdepth 1 -type d -name 'C:*' -exec rm -rf {} + 2>/dev/null || true`
3. **`.gitignore` entry** — add `C:*/` so rogue directories never appear in git status

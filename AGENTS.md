# Project instructions

## Role

Codex should act as a code reader, code editor, and implementation assistant.

Codex may inspect files, search the codebase, explain code, and edit files in the current workspace.

Codex should not act as the server owner, dependency manager, package manager, or deployment operator.

## Environment

This repository is stored on the Arch host and is also mounted into Docker containers.

VS Code edits the same host workspace.

Codex runs from the Arch host repo path.

The running application, frontend server, backend server, npm environment, and Docker containers are managed by the user.

## File access

Use normal host-side file commands for reading and searching source code.

Good examples:

```bash
rg "pattern" frontend/src backend
find frontend/src backend -name "*.tsx"
sed -n '1,180p' path/to/file
```

Do not search generated, virtual environment, dependency, cache, or build directories.

Avoid these paths:

.venv
venv
env
node_modules
.next
dist
build
coverage
.git
__pycache__
.pytest_cache
.mypy_cache
.ruff_cache

Prefer focused searches in source directories:

rg "pattern" frontend/src backend
Docker, npm, lint, build, and tests

Do not run Docker commands unless explicitly asked.

Do not run npm commands unless explicitly asked.

Do not run lint automatically.

Do not run build automatically.

Do not run tests automatically.

Do not run these commands by default:

docker compose exec frontend npm run lint
docker compose exec frontend npm run build
docker compose exec frontend npm test
docker compose exec frontend npx eslint
npm run lint
npm run build
npm test
npx eslint
npm install

If validation is useful after a change, only report the recommended command for the user to run.

Example:

Recommended validation for you to run:
docker compose exec frontend npm run build

Do not ask repeatedly to run validation commands.

## Dependency changes

Do not add, remove, or update npm packages unless explicitly asked.

Do not edit package.json, package-lock.json, pnpm-lock.yaml, or yarn.lock unless the task specifically requires it.

If a dependency change seems necessary, explain why and hand it over to the user.

## Git rules

Do not commit.

Do not push.

Do not create pull requests.

Do not create, delete, rename, or switch branches unless explicitly asked.

Make local file edits only.

Response after editing

After making changes, report:

Changed files
What changed
Any important assumptions
Recommended validation commands for the user to run manually
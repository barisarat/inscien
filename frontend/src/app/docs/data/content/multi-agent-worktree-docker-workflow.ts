import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "multi-agent-worktree-docker-workflow",
  kind: "codenote",
  name: "Multi Agent Worktree Docker Workflow",
  desc: "Use Git worktree slots, isolated Docker app containers, shared local infra, and normal GitHub PRs for parallel local agent work.",
  intro:
    "This workflow keeps the main project checkout stable while feature work happens in reusable Git worktree folders. Each worktree gets its own frontend and backend ports, its own app containers, and its own coding-agent session. MySQL, Redis, and Qdrant stay shared from the main Docker stack.",
  sections: [
    {
      title: "Operating model",
      blocks: [
        {
          kind: "text",
          text: [
            "The main app stays available on normal ports while feature work gets isolated folders, branches, app containers, and ports. Shared infra avoids duplicate database and vector services, and PRs stay tied to normal Git branches.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "~/projects/your-project is the stable main slot.",
            "~/projects/your-project-wt1 is feature slot 1.",
            "~/projects/your-project-wt2 is feature slot 2.",
            "Each slot has a different Git branch checked out.",
            "Each slot has separate backend and frontend containers.",
            "The main stack owns shared infra such as MySQL, Redis, and Qdrant.",
            "Coding agents are launched from the exact worktree folder they should edit.",
          ],
        },
      ],
    },
    {
      title: "Create worktree slots",
      blocks: [
        {
          kind: "text",
          text: [
            "Create worktrees from the main repo folder. The folder names stay stable, while branch names change per feature.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project

git worktree add ../your-project-wt1 -b feature/first-task
git worktree add ../your-project-wt2 -b feature/second-task`,
        },
        {
          kind: "text",
          bullets: [
            "Do not check out the same branch in two worktrees at the same time.",
            "Commit from the worktree that owns the branch.",
            "Use the main checkout for the stable main branch and normal main stack.",
          ],
        },
      ],
    },
    {
      title: "Port layout",
      blocks: [
        {
          kind: "table",
          headers: ["Slot", "Frontend", "Backend"],
          rows: [
            ["main", "3000", "8000"],
            ["wt1", "3001", "8001"],
            ["wt2", "3002", "8002"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Host ports must be unique across running containers.",
            "Container ports can stay the same because each container has its own network namespace.",
            "A mapping like 8001:8000 means the browser uses localhost:8001 while the backend process still listens on port 8000 inside the container.",
          ],
        },
      ],
    },
    {
      title: "Keep main stack running",
      blocks: [
        {
          kind: "text",
          text: [
            "Start from the main checkout. The main stack is the stable reference app on normal ports, and it owns the shared Docker network and infra containers that wt1 and wt2 reuse.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project
docker compose up -d
docker compose ps

docker network ls | grep your-project`,
        },
        {
          kind: "text",
          bullets: [
            "Main frontend: http://localhost:3000",
            "Main backend: http://localhost:8000",
            "Shared infra services stay in the main stack.",
            "Feature worktrees should attach to the main network instead of creating duplicate infra containers.",
          ],
        },
        {
          kind: "text",
          text: ["The expected shared network is usually:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `your-project_default`,
        },
      ],
    },
    {
      title: "Main Compose reference",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the main compose.yaml as the reference layer. It exposes the stable app ports, creates the shared infra services, and gives the worktree slots a network to join.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `services:
  backend:
    build:
      context: ./backend
    env_file:
      - .env.dev
    container_name: your-project-backend
    working_dir: /workspace
    volumes:
      - ./backend:/workspace
    ports:
      - "8000:8000"
    stdin_open: true
    tty: true
    depends_on:
      - redis
      - mysql
      - qdrant
    environment:
      # Add only the environment variables this service needs.

  frontend:
    build:
      context: ./frontend
    env_file:
      - .env.dev
    container_name: your-project-frontend
    working_dir: /workspace
    volumes:
      - ./frontend:/workspace
    ports:
      - "3000:3000"
    stdin_open: true
    tty: true

  redis:
    image: redis:7-alpine
    container_name: your-project-redis

  mysql:
    image: mysql:8
    container_name: your-project-mysql
    env_file:
      - .env.dev
    volumes:
      - your_project_mysql_data:/var/lib/mysql

  qdrant:
    image: qdrant/qdrant
    container_name: your-project-qdrant
    volumes:
      - your_project_qdrant_data:/qdrant/storage

volumes:
  your_project_mysql_data:
  your_project_qdrant_data:`,
        },
        {
          kind: "text",
          bullets: [
            "Keep real environment keys in .env.dev or in the commented environment block.",
            "Keep the main app on 3000 and 8000 so it remains the stable reference.",
            "Let the main Compose project create the default network that worktree Compose files attach to.",
            "Expose infra ports only when local debugging requires host access.",
          ],
        },
      ],
    },
    {
      title: "Create wt1 Compose file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a standalone Compose file in the wt1 worktree. Standalone files keep old port mappings from the main Compose file out of the worktree slot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project-wt1
nano compose.wt1.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `services:
  backend:
    build:
      context: ./backend
    env_file:
      - .env.dev
    container_name: your-project-wt1-backend
    working_dir: /workspace
    volumes:
      - ./backend:/workspace
    ports:
      - "8001:8000"
    stdin_open: true
    tty: true
    environment:
      # Add only the environment variables this slot needs.

  frontend:
    build:
      context: ./frontend
    env_file:
      - .env.dev
    container_name: your-project-wt1-frontend
    working_dir: /workspace
    volumes:
      - ./frontend:/workspace
    ports:
      - "3001:3000"
    stdin_open: true
    tty: true

networks:
  default:
    external: true
    name: your-project_default`,
        },
        {
          kind: "text",
          bullets: [
            "Keep only the variables your app actually needs in this slot file.",
            "Use the commented environment block above as the location where real app keys would go.",
            "Point shared-service values at the main Compose service names used by your project.",
            "Add any app-specific mounts only when the feature container needs them.",
            "Use the same container ports as the app expects internally and change only the host-side ports for each slot.",
          ],
        },
      ],
    },
    {
      title: "Create wt2 Compose file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the wt2 file with the same structure, changing only the slot names and host ports.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project-wt2
nano compose.wt2.yaml`,
        },
        {
          kind: "table",
          headers: ["wt1 value", "wt2 value"],
          rows: [
            ["compose.wt1.yaml", "compose.wt2.yaml"],
            ["your-project-wt1-backend", "your-project-wt2-backend"],
            ["your-project-wt1-frontend", "your-project-wt2-frontend"],
            ["8001:8000", "8002:8000"],
            ["3001:3000", "3002:3000"],
          ],
        },
      ],
    },
    {
      title: "Run a worktree slot",
      blocks: [
        {
          kind: "text",
          text: [
            "Start only the app containers for the target slot. The backend reaches redis, mysql, and qdrant by service name through the shared your-project_default network.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project-wt1
docker compose -f compose.wt1.yaml up -d --force-recreate backend frontend

docker exec -it your-project-wt1-frontend bash
docker exec -it your-project-wt1-backend bash`,
        },
        {
          kind: "text",
          text: ["Open the wt1 app on the host:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `http://localhost:3001
http://localhost:8001`,
        },
      ],
    },
    {
      title: "Run an agent safely",
      blocks: [
        {
          kind: "text",
          text: [
            "Launch the coding-agent container from the exact worktree folder. The current directory is mounted to /workspace, so this is the main project boundary.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project-wt1

docker run -it --rm \\
  --cap-drop=ALL \\
  --security-opt no-new-privileges \\
  --user "$(id -u):$(id -g)" \\
  -v "$(pwd)":/workspace \\
  -v ~/.config/claude-box/state:/home/claude/.claude \\
  -v ~/.config/claude-box/state/.claude.json:/home/claude/.claude.json \\
  claude-box`,
        },
        {
          kind: "text",
          bullets: [
            "Do not launch from ~/projects because that exposes every project under it.",
            "Claude auth persists in ~/.config/claude-box/state.",
            "Files written by the agent use the host UID and GID.",
            "The agent edits the mounted worktree, while app runtime happens in that worktree's Docker containers.",
          ],
        },
      ],
    },
    {
      title: "GitHub CLI setup",
      blocks: [
        {
          kind: "text",
          text: [
            "Use GitHub CLI for PR creation and status checks. If the repo already uses SSH remotes, choose SSH during gh auth login.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S github-cli
gh auth login

gh auth status
gh repo view`,
        },
        {
          kind: "text",
          bullets: [
            "Use GitHub.com.",
            "Use SSH when Git remotes already use SSH.",
            "Browser login is the simplest auth flow.",
            "Git credential auth can be skipped when SSH already works for Git.",
          ],
        },
      ],
    },
    {
      title: "Commit and open PR",
      blocks: [
        {
          kind: "text",
          text: [
            "Commit from the feature worktree. Push HEAD so the current branch is sent to GitHub and upstream tracking is set in one step.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git status
git add <files>
git commit -m "Add feature UI"

git push -u origin HEAD
gh pr create`,
        },
        {
          kind: "text",
          bullets: [
            "Use main as the base branch.",
            "Use a short title that describes the user-facing change.",
            "Put summary and testing notes in the PR body.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `gh pr view --web
gh pr status
gh pr checks`,
        },
      ],
    },
    {
      title: "Merge and cleanup",
      blocks: [
        {
          kind: "text",
          text: [
            "For this local workflow, squash and merge is the clean default. It puts one feature commit on main while allowing messy feature-branch commits during development.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Open the PR in GitHub.",
            "Choose Squash and merge.",
            "Delete the remote branch when GitHub offers it.",
            "Pull latest main in the stable checkout.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project
git fetch --prune
git pull`,
        },
        {
          kind: "text",
          text: [
            "Do not switch the worktree slot to main if main is already checked out in ~/projects/your-project. Start the next feature branch directly from origin/main instead.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project-wt1
git fetch origin
git switch -c feature/next-thing origin/main

git branch -d feature/first-task
git fetch --prune`,
        },
      ],
    },
    {
      title: "Daily sequence",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project
git pull

cd ~/projects/your-project-wt1
git fetch origin
git switch -c feature/some-feature origin/main
docker compose -f compose.wt1.yaml up -d backend frontend

docker exec -it your-project-wt1-frontend bash
docker exec -it your-project-wt1-backend bash`,
        },
        {
          kind: "text",
          text: [
            "Then launch the agent from ~/projects/your-project-wt1, edit and validate through the wt1 containers, commit on the feature branch, push HEAD, and create a PR.",
          ],
        },
      ],
    },
    {
      title: "Remove old worktrees",
      blocks: [
        {
          kind: "text",
          text: [
            "Remove a disposable worktree through Git when a slot is no longer needed. If a worktree folder was deleted manually, prune stale worktree metadata.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-project
git worktree remove ../your-project-some-old-worktree

git worktree prune`,
        },
      ],
    },
  ],
  resources: [
    {
      label: "GitHub SSH Authentication for Local and EC2",
      href: "/docs/github-ssh-auth",
    },
    {
      label: "Claude Code Docker Setup",
      href: "/docs/claude-code-docker-setup",
    },
  ],
}

export default entry

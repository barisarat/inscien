import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "hermes-docker-local-setup",
  kind: "codenote",
  name: "Hermes Docker Setup on Local Host",
  desc: "Run Hermes inside Docker on the local Arch host with persistent host data and a limited mounted workspace.",
  intro:
    "Run Hermes inside Docker on the local Arch host. This keeps Hermes isolated from the full home directory while preserving Hermes config and state in ~/.hermes. A separate ~/hermes-workspace directory is used as the normal scratch workspace.",
  sections: [
    {
      title: "Create host directories",
      blocks: [
        {
          kind: "text",
          text: [
            "Create one persistent Hermes data directory and one scratch workspace. Do not mount the whole home directory unless Hermes should access all of it.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p "$HOME/.hermes"
mkdir -p "$HOME/hermes-workspace"

chmod 700 "$HOME/.hermes"`,
        },
      ],
    },
    {
      title: "Pull the Docker image",
      blocks: [
        {
          kind: "text",
          text: [
            "Pull the current Hermes image and check the local image metadata.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker pull nousresearch/hermes-agent

docker image inspect nousresearch/hermes-agent:latest \\
  --format 'ID={{.Id}}
Created={{.Created}}'`,
        },
      ],
    },
    {
      title: "Run first-time setup",
      blocks: [
        {
          kind: "text",
          text: [
            "Run the setup wizard once. Hermes saves config into ~/.hermes on the host. Inside the container, the same directory appears as /opt/data.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  -e HERMES_UID="$(id -u)" \\
  -e HERMES_GID="$(id -g)" \\
  -v "$HOME/.hermes:/opt/data" \\
  -v "$HOME/hermes-workspace:/workspace" \\
  -w /workspace \\
  nousresearch/hermes-agent setup`,
        },
      ],
    },
    {
      title: "Run Hermes normally",
      blocks: [
        {
          kind: "text",
          text: [
            "Start Hermes inside Docker with persistent state and the scratch workspace mounted. In this mode, Hermes can read and write files inside ~/hermes-workspace.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  -e HERMES_UID="$(id -u)" \\
  -e HERMES_GID="$(id -g)" \\
  -v "$HOME/.hermes:/opt/data" \\
  -v "$HOME/hermes-workspace:/workspace" \\
  -w /workspace \\
  nousresearch/hermes-agent`,
        },
      ],
    },
    {
      title: "Resume a saved session",
      blocks: [
        {
          kind: "text",
          text: [
            "Resume a specific Hermes session by passing the resume command after the image name. The persistent ~/.hermes mount is what lets the container find saved session state.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  -e HERMES_UID="$(id -u)" \\
  -e HERMES_GID="$(id -g)" \\
  -v "$HOME/.hermes:/opt/data" \\
  -v "$HOME/hermes-workspace:/workspace" \\
  -w /workspace \\
  nousresearch/hermes-agent \\
  hermes --resume 20260528_101851_78ffa1`,
        },
      ],
    },
    {
      title: "Run TUI mode",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  -e HERMES_UID="$(id -u)" \\
  -e HERMES_GID="$(id -g)" \\
  -v "$HOME/.hermes:/opt/data" \\
  -v "$HOME/hermes-workspace:/workspace" \\
  -w /workspace \\
  nousresearch/hermes-agent --tui`,
        },
      ],
    },
    {
      title: "Run against a project",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this only when Hermes should intentionally access the current project folder. Run it from inside the project directory.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /path/to/project

docker run -it --rm \\
  -e HERMES_UID="$(id -u)" \\
  -e HERMES_GID="$(id -g)" \\
  -v "$HOME/.hermes:/opt/data" \\
  -v "$PWD:/workspace" \\
  -w /workspace \\
  nousresearch/hermes-agent`,
        },
      ],
    },
    {
      title: "Create shell aliases",
      blocks: [
        {
          kind: "text",
          text: [
            "Add short aliases for the normal Docker session and TUI mode.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat >> "$HOME/.bashrc" <<'EOF'

# Hermes Agent in Docker
alias hermes-docker='docker run -it --rm -e HERMES_UID="$(id -u)" -e HERMES_GID="$(id -g)" -v "$HOME/.hermes:/opt/data" -v "$HOME/hermes-workspace:/workspace" -w /workspace nousresearch/hermes-agent'

alias hermes-docker-tui='docker run -it --rm -e HERMES_UID="$(id -u)" -e HERMES_GID="$(id -g)" -v "$HOME/.hermes:/opt/data" -v "$HOME/hermes-workspace:/workspace" -w /workspace nousresearch/hermes-agent --tui'
EOF

source "$HOME/.bashrc"`,
        },
      ],
    },
    {
      title: "Use the aliases",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `hermes-docker

hermes-docker-tui`,
        },
      ],
    },
    {
      title: "Update the image",
      blocks: [
        {
          kind: "text",
          text: [
            "Docker-based Hermes is updated by pulling the latest image. The persistent config and state in ~/.hermes remain on the host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker pull nousresearch/hermes-agent

docker image inspect nousresearch/hermes-agent:latest \\
  --format 'ID={{.Id}}
Created={{.Created}}'

hermes-docker`,
        },
      ],
    },
    {
      title: "Run optional gateway mode",
      blocks: [
        {
          kind: "text",
          text: [
            "Use gateway mode only when Hermes should run as a long-lived local service. The port is bound to 127.0.0.1 so it is local-only.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker rm -f hermes 2>/dev/null || true

docker run -d \\
  --name hermes \\
  --restart unless-stopped \\
  -e HERMES_UID="$(id -u)" \\
  -e HERMES_GID="$(id -g)" \\
  -v "$HOME/.hermes:/opt/data" \\
  -v "$HOME/hermes-workspace:/workspace" \\
  -w /workspace \\
  -p 127.0.0.1:8642:8642 \\
  nousresearch/hermes-agent gateway run`,
        },
      ],
    },
    {
      title: "Manage gateway container",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `docker ps

docker logs -f hermes

docker stop hermes

docker start hermes

docker rm -f hermes`,
        },
      ],
    },
    {
      title: "Update gateway later",
      blocks: [
        {
          kind: "text",
          text: [
            "To update the persistent gateway, pull the latest image, remove the old container, and recreate it from the updated image.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker pull nousresearch/hermes-agent

docker rm -f hermes

docker run -d \\
  --name hermes \\
  --restart unless-stopped \\
  -e HERMES_UID="$(id -u)" \\
  -e HERMES_GID="$(id -g)" \\
  -v "$HOME/.hermes:/opt/data" \\
  -v "$HOME/hermes-workspace:/workspace" \\
  -w /workspace \\
  -p 127.0.0.1:8642:8642 \\
  nousresearch/hermes-agent gateway run`,
        },
      ],
    },
    {
      title: "Check host data",
      blocks: [
        {
          kind: "text",
          text: [
            "Check the persistent data directory and scratch workspace on the host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -la "$HOME/.hermes"

ls -la "$HOME/hermes-workspace"`,
        },
      ],
    },
    {
      title: "Clean unused Docker objects",
      blocks: [
        {
          kind: "text",
          text: [
            "This removes unused Docker objects. It does not remove ~/.hermes or ~/hermes-workspace.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker system prune`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Persistent Hermes data on host: ~/.hermes",
            "Normal scratch workspace on host: ~/hermes-workspace",
            "Hermes data inside container: /opt/data",
            "Mounted workspace inside container: /workspace",
            "Optional gateway container name: hermes",
            "Optional gateway port: 127.0.0.1:8642",
          ],
        },
      ],
    },
  ],
}

export default entry

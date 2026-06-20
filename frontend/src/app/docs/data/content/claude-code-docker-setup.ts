import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "claude-code-docker-setup",
  kind: "codenote",
  name: "Claude Code Docker Setup",
  desc: "Run Claude Code inside a reusable Docker container, scoped to one mounted project with persistent subscription auth.",
  intro:
    "Run Claude Code inside Docker on the Arch host with a reusable image and per-project mounts. The container is created fresh for each run, can read and edit only the mounted project directory, and stores Claude subscription auth in ~/.config/claude-box/state.",
  sections: [
    {
      title: "Setup model",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use one generic image named claude-box for every project.",
            "Run ephemeral containers with --rm.",
            "Launch from a specific repo root so only that repo is mounted into /workspace.",
            "Persist Claude Code auth and local CLI state under ~/.config/claude-box/state.",
            "Do not build one image per project.",
          ],
        },
      ],
    },
    {
      title: "Create config directory",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep the Dockerfile and Claude auth state under ~/.config/claude-box. Create both the state directory and .claude.json before the first run so Docker mounts them as the expected directory and file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.config/claude-box/state
touch ~/.config/claude-box/state/.claude.json
nano ~/.config/claude-box/Dockerfile`,
        },
      ],
    },
    {
      title: "Create Dockerfile",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `FROM archlinux:latest

RUN pacman -Syu --noconfirm nodejs npm git ca-certificates && \\
    pacman -Scc --noconfirm

RUN npm install -g @anthropic-ai/claude-code

ARG UID=1000
ARG GID=1000
RUN groupadd -g \${GID} claude && \\
    useradd -m -u \${UID} -g \${GID} claude

USER claude
WORKDIR /workspace

ENTRYPOINT ["claude"]`,
        },
      ],
    },
    {
      title: "Check Docker",
      blocks: [
        {
          kind: "text",
          text: [
            "Confirm the Docker daemon is running before building the image. If Docker group membership was just changed, log out and back in before continuing.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker ps

sudo systemctl enable --now docker
sudo usermod -aG docker $USER`,
        },
      ],
    },
    {
      title: "Build the image",
      blocks: [
        {
          kind: "text",
          text: [
            "Build the image with the host UID and GID so files written inside the mounted repo have clean ownership on the host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker build \\
  --build-arg UID=$(id -u) \\
  --build-arg GID=$(id -g) \\
  -t claude-box \\
  ~/.config/claude-box

docker images | grep claude-box`,
        },
      ],
    },
    {
      title: "Run from a project",
      blocks: [
        {
          kind: "text",
          text: [
            "Start Claude Code from the target repo root. The current directory becomes /workspace inside the container.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/mlnotebooks

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
            "On first run, choose the Claude account with subscription login option.",
            "Open the printed URL in the browser, authorize, then return to the terminal.",
            "Later runs reuse the token and local Claude state from ~/.config/claude-box/state.",
          ],
        },
      ],
    },
    {
      title: "Keep billing on subscription",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use the Claude account subscription login flow for Pro or Max.",
            "Do not set ANTHROPIC_API_KEY for this workflow.",
            "Decline API-credit prompts if the goal is to stay within plan allocation.",
            "Use /status inside Claude Code to inspect current usage mode.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `echo "$ANTHROPIC_API_KEY"`,
        },
      ],
    },
    {
      title: "Security boundary",
      blocks: [
        {
          kind: "text",
          bullets: [
            "The mount is the workspace boundary. Only launch from the repo Claude should access.",
            "Do not launch from ~/projects because that exposes every project under it.",
            "The container runs as the host UID and GID, not as root.",
            "--cap-drop=ALL and --security-opt no-new-privileges reduce container privileges.",
            "Anything mounted is writable by Claude Code, including .env files and development secrets in the repo.",
            "Container isolation is not the same as a VM. Use a VM if the threat model requires a separate kernel.",
          ],
        },
      ],
    },
    {
      title: "Add project context",
      blocks: [
        {
          kind: "text",
          text: [
            "Put project-specific instructions in CLAUDE.md at the repo root. Claude Code reads it automatically, and it can be version-controlled with the project.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/mlnotebooks
nano CLAUDE.md`,
        },
        {
          kind: "text",
          bullets: [
            "Use CLAUDE.md for conventions, project commands, boundaries, and recurring lessons.",
            "A per-project .claude directory may be created by Claude Code and can stay with the repo if the settings are meant to travel with it.",
            "The same claude-box image stays generic. Project focus comes from the mount.",
          ],
        },
      ],
    },
    {
      title: "Know the limits",
      blocks: [
        {
          kind: "text",
          text: [
            "This standalone container is for reading and editing code. It does not control the host Docker daemon, join the project Compose network, or reach services by Compose DNS names.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "It cannot run docker compose unless Docker access is deliberately added.",
            "It cannot reach services such as backend, mysql, redis, or qdrant by Compose service name.",
            "To operate the stack later, add a claude service to the project docker-compose.yml and join the existing network.",
            "Do not mount /var/run/docker.sock into this container unless host-level Docker control is explicitly intended.",
          ],
        },
      ],
    },
    {
      title: "Troubleshoot",
      blocks: [
        {
          kind: "table",
          headers: ["Issue", "Fix"],
          rows: [
            ["Blank screen or silent hang", "Omit --read-only, or add writable tmpfs mounts for /tmp, /home/claude/.cache, and /home/claude/.npm"],
            ["Host files get wrong ownership", "Rebuild with --build-arg UID=$(id -u) and --build-arg GID=$(id -g)"],
            ["Docker permission denied", "Add the user to the docker group, then log out and back in"],
            ["Claude asks about API credits", "Confirm ANTHROPIC_API_KEY is empty and use the subscription login flow"],
            ["Claude asks to log in every run", "Confirm both /home/claude/.claude and /home/claude/.claude.json are mounted from ~/.config/claude-box/state"],
          ],
        },
      ],
    },
    {
      title: "Update later",
      blocks: [
        {
          kind: "text",
          text: [
            "Rebuild the generic image when Claude Code updates or when setting up a new machine.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker build \\
  --build-arg UID=$(id -u) \\
  --build-arg GID=$(id -g) \\
  -t claude-box \\
  ~/.config/claude-box`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Generic Dockerfile: ~/.config/claude-box/Dockerfile",
            "Claude auth and CLI state directory: ~/.config/claude-box/state",
            "Claude local state file: ~/.config/claude-box/state/.claude.json",
            "Mounted project inside container: /workspace",
            "Project context file: CLAUDE.md",
            "Optional project settings: .claude/",
            "Docker image name: claude-box",
          ],
        },
      ],
    },
  ],
}

export default entry

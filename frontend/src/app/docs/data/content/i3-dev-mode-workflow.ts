import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-dev-mode-workflow",
  kind: "codenote",
  name: "i3 Dev Mode with tmuxp",
  desc: "Create a reusable i3 development launcher that starts tmuxp sessions, prepares the screen and power mode, opens the main tmux workspace in Alacritty, and places browser and editor windows on separate workspaces.",
  intro:
    "This workflow creates a manual dev-mode command for an i3 setup. The command loads tmuxp sessions, starts the main Docker Compose stack, starts the two worktree Compose stacks, keeps the screen awake, sets performance mode, opens the main development tmux session in workspace 1, opens the browser in workspace 2, opens VS Code in workspace 3, and keeps the setup reusable through named tmuxp files.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use tmuxp for repeatable terminal sessions, windows, and pane layouts.",
            "Use tmux-run as the central loader for Docker Compose services and tmuxp sessions.",
            "Use dev-mode as the i3 launcher for workspaces and GUI apps.",
            "Use Alacritty for the main tmux workspace so the terminal uses the same font, opacity, and color palette as the base i3 setup.",
            "Use screen-on inside dev-mode so the display does not blank or enter DPMS power saving during development.",
            "Use powerprofilesctl inside dev-mode so the laptop switches to performance mode for development work.",
            "Use home as the local shell session.",
            "Use io_main as the main mlnotebooks development session.",
            "Use io_ec2 as the EC2 or remote shell session.",
            "Use hermes as the Hermes Docker agent session.",
            "Use tree_1 and tree_2 as separate worktree sessions.",
            "Use Docker-managed Python dependencies inside backend containers instead of activating a project .venv manually.",
            "Run dev-mode once after reboot. The loader is intentionally simple and does not protect already-running sessions.",
          ],
        },
      ],
    },
    {
      title: "Install required tools",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the basic tools needed for this workflow. tmux is the terminal multiplexer that runs the sessions, windows, and panes. tmuxp reads YAML files and creates repeatable tmux layouts. pipx is used to install tmuxp as an isolated command-line app.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S tmux python-pipx xorg-xset
pipx install tmuxp`,
        },
        {
          kind: "text",
          text: [
            "Confirm the commands are available before creating the configuration files.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux -V
tmuxp --version
i3-msg -v
xset q
powerprofilesctl get`,
        },
      ],
    },
    {
      title: "Create config folders",
      blocks: [
        {
          kind: "text",
          text: [
            "tmuxp reads YAML session definitions from a normal config folder. This workflow keeps one file for each named tmux session and keeps helper scripts in ~/.local/bin.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.config/tmuxp
mkdir -p ~/.local/bin`,
        },
      ],
    },
    {
      title: "Session layout",
      blocks: [
        {
          kind: "table",
          headers: ["tmux session", "Purpose"],
          rows: [
            ["home", "Local shell session"],
            ["io_main", "Main mlnotebooks development session"],
            ["io_ec2", "EC2 or remote shell session"],
            ["hermes", "Hermes Docker agent session"],
            ["tree_1", "First worktree development session"],
            ["tree_2", "Second worktree development session"],
          ],
        },
        {
          kind: "table",
          headers: ["tmux session", "tmux window", "Purpose"],
          rows: [
            ["home", "home", "Local shell"],
            ["io_main", "main", "Frontend dev server, backend Uvicorn server, and free shell"],
            ["io_main", "celery", "Celery worker and beat logs"],
            ["io_main", "claude", "Claude Code through claude-box"],
            ["io_main", "codex", "Codex with workspace-write sandbox"],
            ["io_ec2", "io_ec2", "EC2 or remote shell"],
            ["hermes", "hermes", "Hermes Docker agent"],
            ["tree_1", "main", "Worktree 1 frontend, backend, and free shell"],
            ["tree_1", "claude", "Claude Code through claude-box for worktree 1"],
            ["tree_2", "main", "Worktree 2 frontend, backend, and free shell"],
            ["tree_2", "claude", "Claude Code through claude-box for worktree 2"],
          ],
        },
      ],
    },
    {
      title: "Create home.yaml",
      blocks: [
        {
          kind: "text",
          text: ["home replaces the old local session name."],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/tmuxp/home.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `session_name: home
start_directory: "\${HOME}"

windows:
  - window_name: home
    panes:
      - shell_command:
          - cd "\${HOME}"
          - bash`,
        },
      ],
    },
    {
      title: "Create io_main.yaml",
      blocks: [
        {
          kind: "text",
          text: [
            "io_main replaces the old dev session name. The main window runs the frontend, backend, and a free shell. The celery window follows worker and beat logs. The claude window starts claude-box inside the main project. The codex window starts Codex in workspace-write mode.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/tmuxp/io_main.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `session_name: io_main
start_directory: "\${HOME}/projects/mlnotebooks"

windows:
  - window_name: main
    layout: tiled
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks"
          - docker compose exec frontend bash -lc "npm run dev"
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks"
          - docker compose exec backend bash -lc "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks"
          - bash

  - window_name: celery
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks"
          - docker compose logs --tail=0 -f celery_worker celery_beat

  - window_name: claude
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks"
          - >
            docker run -it --rm
            --cap-drop=ALL
            --security-opt no-new-privileges
            --user "$(id -u):$(id -g)"
            -v "$(pwd)":/workspace
            -v "\${HOME}/.config/claude-box/state:/home/claude/.claude"
            -v "\${HOME}/.config/claude-box/state/.claude.json:/home/claude/.claude.json"
            claude-box

  - window_name: codex
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks"
          - codex --sandbox workspace-write --ask-for-approval on-request`,
        },
      ],
    },
    {
      title: "Create io_ec2.yaml",
      blocks: [
        {
          kind: "text",
          text: ["io_ec2 replaces the old ec2 session name."],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/tmuxp/io_ec2.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `session_name: io_ec2
start_directory: "\${HOME}"

windows:
  - window_name: io_ec2
    panes:
      - shell_command:
          - cd "\${HOME}"
          - bash`,
        },
      ],
    },
    {
      title: "Create hermes.yaml",
      blocks: [
        {
          kind: "text",
          text: [
            "The hermes session runs a single tmux window and a single pane. The Hermes Docker container mounts persistent Hermes data from ~/.hermes and the working directory from ~/hermes-workspace.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/tmuxp/hermes.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `session_name: hermes
start_directory: "\${HOME}/hermes-workspace"

windows:
  - window_name: hermes
    panes:
      - shell_command:
          - cd "\${HOME}/hermes-workspace"
          - >
            docker run -it --rm
            -e HERMES_UID="$(id -u)"
            -e HERMES_GID="$(id -g)"
            -v "\${HOME}/.hermes:/opt/data"
            -v "\${HOME}/hermes-workspace:/workspace"
            -w /workspace
            nousresearch/hermes-agent`,
        },
      ],
    },
    {
      title: "Create tree_1.yaml",
      blocks: [
        {
          kind: "text",
          text: [
            "tree_1 is the first worktree development session. It uses the mlnotebooks-wt1 project path and the wt1 container names.",
            "The backend command still runs Uvicorn on port 8000 inside the container. The external host binding is handled by compose.wt1.yaml.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/tmuxp/tree_1.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `session_name: tree_1
start_directory: "\${HOME}/projects/mlnotebooks-wt1"

windows:
  - window_name: main
    layout: tiled
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt1"
          - docker exec -it mlnotebooks-wt1-frontend bash -lc "npm run dev"
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt1"
          - docker exec -it mlnotebooks-wt1-backend bash -lc "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt1"
          - bash

  - window_name: claude
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt1"
          - >
            docker run -it --rm
            --cap-drop=ALL
            --security-opt no-new-privileges
            --user "$(id -u):$(id -g)"
            -v "$(pwd)":/workspace
            -v "\${HOME}/.config/claude-box/state:/home/claude/.claude"
            -v "\${HOME}/.config/claude-box/state/.claude.json:/home/claude/.claude.json"
            claude-box`,
        },
      ],
    },
    {
      title: "Create tree_2.yaml",
      blocks: [
        {
          kind: "text",
          text: [
            "tree_2 is the second worktree development session. It uses the mlnotebooks-wt2 project path and the wt2 container names.",
            "The backend command still runs Uvicorn on port 8000 inside the container. The external host binding is handled by compose.wt2.yaml.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/tmuxp/tree_2.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `session_name: tree_2
start_directory: "\${HOME}/projects/mlnotebooks-wt2"

windows:
  - window_name: main
    layout: tiled
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt2"
          - docker exec -it mlnotebooks-wt2-frontend bash -lc "npm run dev"
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt2"
          - docker exec -it mlnotebooks-wt2-backend bash -lc "uvicorn main:app --host 0.0.0.0 --port 8000 --reload"
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt2"
          - bash

  - window_name: claude
    panes:
      - shell_command:
          - cd "\${HOME}/projects/mlnotebooks-wt2"
          - >
            docker run -it --rm
            --cap-drop=ALL
            --security-opt no-new-privileges
            --user "$(id -u):$(id -g)"
            -v "$(pwd)":/workspace
            -v "\${HOME}/.config/claude-box/state:/home/claude/.claude"
            -v "\${HOME}/.config/claude-box/state/.claude.json:/home/claude/.claude.json"
            claude-box`,
        },
      ],
    },
    {
      title: "Create tmux-run",
      blocks: [
        {
          kind: "text",
          text: [
            "tmux-run is the central loader. This version is intentionally simple because dev-mode is run once after reboot. It starts the main Compose stack, recreates the two worktree backend and frontend services, then loads all tmuxp sessions directly.",
            "If this script is run again while the same tmux sessions already exist, tmuxp can fail because the session names are already active. For normal use, run dev-mode once after reboot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.local/bin/tmux-run`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/usr/bin/env bash

set -e

MAIN_DIR="\${HOME}/projects/mlnotebooks"
WT1_DIR="\${HOME}/projects/mlnotebooks-wt1"
WT2_DIR="\${HOME}/projects/mlnotebooks-wt2"

cd "\${MAIN_DIR}" || exit 1
docker compose up -d

cd "\${WT1_DIR}" || exit 1
docker compose -f compose.wt1.yaml up -d --force-recreate backend frontend

cd "\${WT2_DIR}" || exit 1
docker compose -f compose.wt2.yaml up -d --force-recreate backend frontend

tmuxp load -d "\${HOME}/.config/tmuxp/home.yaml"
tmuxp load -d "\${HOME}/.config/tmuxp/io_main.yaml"
tmuxp load -d "\${HOME}/.config/tmuxp/io_ec2.yaml"
tmuxp load -d "\${HOME}/.config/tmuxp/hermes.yaml"
tmuxp load -d "\${HOME}/.config/tmuxp/tree_1.yaml"
tmuxp load -d "\${HOME}/.config/tmuxp/tree_2.yaml"`,
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod +x ~/.local/bin/tmux-run`,
        },
      ],
    },
    {
      title: "Create screen-on",
      blocks: [
        {
          kind: "text",
          text: [
            "screen-on disables the X screensaver timer and disables DPMS monitor power saving so the display stays awake during development work.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.local/bin/screen-on`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/usr/bin/env bash

xset s off
xset -dpms`,
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod +x ~/.local/bin/screen-on`,
        },
        {
          kind: "text",
          text: [
            "Use xset q to confirm the screen saver timeout is 0 and DPMS is disabled.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `screen-on
xset q`,
        },
      ],
    },
    {
      title: "Create dev-mode",
      blocks: [
        {
          kind: "text",
          text: [
            "dev-mode is the i3 launcher. It loads the tmux sessions, keeps the screen awake, sets performance mode, opens the main tmux session in workspace 1, opens Firefox in workspace 2, and opens VS Code in workspace 3.",
            "The tmux terminal uses Alacritty, not Konsole. This is important because the base i3 setup uses Alacritty for the configured font, background, foreground, opacity, and overall terminal styling.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.local/bin/dev-mode`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/usr/bin/env bash

~/.local/bin/tmux-run

screen-on
powerprofilesctl set performance

i3-msg 'workspace "1"'
i3-msg 'exec alacritty -e tmux attach -t io_main'

sleep 1

i3-msg 'workspace "2"'
i3-msg 'exec firefox'

sleep 1

i3-msg 'workspace "3"'
i3-msg 'exec code --new-window ~/projects/mlnotebooks'`,
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod +x ~/.local/bin/dev-mode`,
        },
      ],
    },
    {
      title: "Run dev mode",
      blocks: [
        {
          kind: "text",
          text: ["Run dev-mode once after reboot."],
        },
        {
          kind: "code",
          language: "bash",
          code: `dev-mode`,
        },
        {
          kind: "text",
          text: [
            "If the starter terminal should close after the setup starts, run this command instead.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `dev-mode && exit`,
        },
        {
          kind: "text",
          bullets: [
            "Workspace 1 opens Alacritty attached to the io_main tmux session.",
            "Workspace 2 opens Firefox.",
            "Workspace 3 opens VS Code in ~/projects/mlnotebooks.",
            "The screen stays awake.",
            "The active power profile is set to performance.",
            "The visible workspace at the end is workspace 3.",
          ],
        },
      ],
    },
    {
      title: "Check active sessions",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `tmux ls`,
        },
        {
          kind: "text",
          text: ["Expected sessions:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `home
hermes
io_ec2
io_main
tree_1
tree_2`,
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux attach -t home
tmux attach -t io_main
tmux attach -t io_ec2
tmux attach -t hermes
tmux attach -t tree_1
tmux attach -t tree_2`,
        },
      ],
    },
    {
      title: "tmux navigation",
      blocks: [
        {
          kind: "text",
          text: ["Inside io_main:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b 0    main
Ctrl+b 1    celery
Ctrl+b 2    claude
Ctrl+b 3    codex`,
        },
        {
          kind: "text",
          text: ["Inside tree_1 or tree_2:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b 0    main
Ctrl+b 1    claude`,
        },
        {
          kind: "text",
          text: ["Common tmux shortcuts:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b n    Next window
Ctrl+b p    Previous window
Ctrl+b s    Session switcher
Ctrl+b c    Create a new window
Ctrl+b ,    Rename current window
exit        Close the current pane or shell`,
        },
      ],
    },
    {
      title: "Retest without reboot",
      blocks: [
        {
          kind: "text",
          text: ["Use this only when testing the setup without rebooting first."],
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux kill-session -t home 2>/dev/null || true
tmux kill-session -t hermes 2>/dev/null || true
tmux kill-session -t io_ec2 2>/dev/null || true
tmux kill-session -t io_main 2>/dev/null || true
tmux kill-session -t tree_1 2>/dev/null || true
tmux kill-session -t tree_2 2>/dev/null || true

dev-mode`,
        },
      ],
    },
    {
      title: "Refresh a changed tmuxp layout",
      blocks: [
        {
          kind: "text",
          text: [
            "Because tmux-run is intentionally simple, it does not reload existing sessions. If a tmuxp YAML file changes, kill the related session and run dev-mode again or load that YAML directly.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux kill-session -t io_main
tmuxp load -d ~/.config/tmuxp/io_main.yaml
tmux attach -t io_main`,
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux kill-session -t tree_1
cd ~/projects/mlnotebooks-wt1
docker compose -f compose.wt1.yaml up -d --force-recreate backend frontend
tmuxp load -d ~/.config/tmuxp/tree_1.yaml
tmux attach -t tree_1`,
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux kill-session -t tree_2
cd ~/projects/mlnotebooks-wt2
docker compose -f compose.wt2.yaml up -d --force-recreate backend frontend
tmuxp load -d ~/.config/tmuxp/tree_2.yaml
tmux attach -t tree_2`,
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux kill-session -t hermes
tmuxp load -d ~/.config/tmuxp/hermes.yaml
tmux attach -t hermes`,
        },
      ],
    },
    {
      title: "Check command locations",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands when the shell can run dev-mode but the file location is not clear.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `type dev-mode
command -v dev-mode
which dev-mode

type tmux-run
command -v tmux-run
which tmux-run

type screen-on
command -v screen-on
which screen-on`,
        },
        {
          kind: "text",
          text: ["Inspect the scripts after finding their paths."],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat "$(command -v dev-mode)"
cat "$(command -v tmux-run)"
cat "$(command -v screen-on)"`,
        },
      ],
    },
    {
      title: "Check i3 integration",
      blocks: [
        {
          kind: "text",
          text: [
            "dev-mode does not have to be added to the i3 config. It can stay as a manual command.",
            "If it is added to i3 startup, it will run every time i3 starts, which is usually not ideal for this development layout.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -n "dev-mode\\|dev.*mode\\|\\.sh" ~/.config/i3/config`,
        },
        {
          kind: "text",
          bullets: [
            "No output means i3 is not starting dev-mode automatically.",
            "Manual mode is safer because the development layout opens only when requested.",
          ],
        },
      ],
    },
    {
      title: "Workspace behavior",
      blocks: [
        {
          kind: "text",
          text: [
            "Workspace 1 is used for the main tmux terminal. Workspace 2 is used for the browser. Workspace 3 is used for VS Code. The script finishes on workspace 3 after launching the layout.",
          ],
        },
        {
          kind: "table",
          headers: ["Workspace", "Purpose"],
          rows: [
            ["1", "Alacritty attached to io_main"],
            ["2", "Firefox"],
            ["3", "VS Code editor"],
            ["Other workspaces", "Left untouched by dev-mode"],
          ],
        },
        {
          kind: "text",
          text: [
            "If a GUI app opens on the wrong workspace, keep the short sleep delays in dev-mode. Add delayed move rules only if the simple workspace-first launch flow is not reliable on the machine.",
          ],
        },
      ],
    },
    {
      title: "Optional delayed move rules",
      blocks: [
        {
          kind: "text",
          text: [
            "The current dev-mode script does not use delayed move rules. It first switches to the target workspace, then opens the app there. This matches normal i3 usage and keeps the script simple.",
            "If Firefox or VS Code opens slowly and lands on the wrong workspace, add a short delayed correction at the end of dev-mode.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sleep 4

i3-msg '[class="firefox"] move to workspace number 2'
i3-msg '[class="Code"] move to workspace number 3'`,
        },
      ],
    },
    {
      title: "Find window classes",
      blocks: [
        {
          kind: "text",
          text: [
            "If an optional delayed move rule does not work, check the real window class and update the matching rule inside dev-mode.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xprop | grep WM_CLASS`,
        },
        {
          kind: "text",
          text: [
            "Click the target window after running xprop. Use the second class value in the i3 selector.",
          ],
        },
        {
          kind: "table",
          headers: ["App", "Common class", "dev-mode selector"],
          rows: [
            ["Firefox", "firefox", "[class=\"firefox\"]"],
            ["VS Code", "Code", "[class=\"Code\"]"],
            ["Chromium", "chromium", "[class=\"chromium\"]"],
            ["Alacritty", "Alacritty", "[class=\"Alacritty\"]"],
          ],
        },
      ],
    },
    {
      title: "Debug screen and power setup",
      blocks: [
        {
          kind: "text",
          text: [
            "dev-mode calls screen-on and sets the power profile to performance. Use these commands to confirm both settings after starting dev-mode.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xset q
powerprofilesctl get`,
        },
        {
          kind: "text",
          text: [
            "For screen-on, xset q should show timeout 0 and DPMS disabled. For powerprofilesctl, the active profile should be performance.",
          ],
        },
      ],
    },
    {
      title: "Debug Docker Compose startup",
      blocks: [
        {
          kind: "text",
          text: [
            "If a pane reports that a service is not running, confirm the related Compose stack is up before attaching with docker compose exec or docker exec.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/mlnotebooks
docker compose ps
docker compose up -d
docker compose ps`,
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/mlnotebooks-wt1
docker compose -f compose.wt1.yaml ps
docker compose -f compose.wt1.yaml up -d --force-recreate backend frontend
docker compose -f compose.wt1.yaml ps`,
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/mlnotebooks-wt2
docker compose -f compose.wt2.yaml ps
docker compose -f compose.wt2.yaml up -d --force-recreate backend frontend
docker compose -f compose.wt2.yaml ps`,
        },
        {
          kind: "text",
          text: ["Check container names used by the tree sessions."],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"`,
        },
        {
          kind: "text",
          bullets: [
            "The tree_1 tmuxp file expects mlnotebooks-wt1-frontend and mlnotebooks-wt1-backend.",
            "The tree_2 tmuxp file expects mlnotebooks-wt2-frontend and mlnotebooks-wt2-backend.",
          ],
        },
      ],
    },
    {
      title: "Debug tmuxp YAML files",
      blocks: [
        {
          kind: "text",
          text: [
            "Use tmuxp directly when testing a YAML file without running the full dev-mode flow.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `tmuxp load -d ~/.config/tmuxp/io_main.yaml
tmux attach -t io_main`,
        },
        {
          kind: "text",
          text: ["Validate that the files exist."],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -lh ~/.config/tmuxp/home.yaml
ls -lh ~/.config/tmuxp/io_main.yaml
ls -lh ~/.config/tmuxp/io_ec2.yaml
ls -lh ~/.config/tmuxp/hermes.yaml
ls -lh ~/.config/tmuxp/tree_1.yaml
ls -lh ~/.config/tmuxp/tree_2.yaml`,
        },
      ],
    },
    {
      title: "Debug Alacritty usage",
      blocks: [
        {
          kind: "text",
          text: [
            "dev-mode should use Alacritty for the tmux workspace. This keeps the main development terminal aligned with the base i3 setup.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -n "tmux attach" ~/.local/bin/dev-mode`,
        },
        {
          kind: "text",
          text: ["Expected line:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3-msg 'exec alacritty -e tmux attach -t io_main'`,
        },
        {
          kind: "text",
          text: [
            "If it says konsole, update dev-mode. Konsole can make tmux look visually different because it does not use the same Alacritty font, opacity, and color settings.",
          ],
        },
      ],
    },
    {
      title: "Debug tmux colors",
      blocks: [
        {
          kind: "text",
          text: [
            "tmuxp does not control colors. tmuxp controls sessions, windows, panes, and commands.",
          ],
          bullets: [
            "Alacritty terminal colors",
            "~/.tmux.conf",
            "tmux defaults",
            "Picom opacity if the terminal supports it",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux show-options -g | grep -E 'status-style|status-left|status-right|window-status|pane-border|message-style|mode-style|clock-mode-colour'`,
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -la ~/.tmux.conf
ls -la ~/.config/tmux/tmux.conf

cat ~/.tmux.conf 2>/dev/null
cat ~/.config/tmux/tmux.conf 2>/dev/null`,
        },
        {
          kind: "text",
          text: [
            "A soft tmux palette can be kept in ~/.tmux.conf, while tmuxp YAML files should stay layout-only.",
          ],
        },
      ],
    },
    {
      title: "Optional soft tmux palette",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this only if tmux itself needs a dedicated palette after switching dev-mode to Alacritty.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat > ~/.tmux.conf <<'EOF'
set -g status on
set -g status-position bottom
set -g status-interval 5
set -g status-style "bg=#121216,fg=#d4d4d4"

set -g status-left-length 40
set -g status-right-length 100
set -g status-left "#[fg=#ffffff,bg=#3a3a3a,bold] #S #[default]"
set -g status-right "#[fg=#909090,bg=#121216] %a %d %b %H:%M "

set -g window-status-format "#[fg=#909090,bg=#121216] #I:#W "
set -g window-status-current-format "#[fg=#ffffff,bg=#3a3a3a,bold] #I:#W "
set -g window-status-separator ""

set -g pane-border-style "fg=#2a2a2a"
set -g pane-active-border-style "fg=#3a3a3a"

set -g message-style "bg=#2a2a2a,fg=#ffffff"
set -g mode-style "bg=#3a3a3a,fg=#ffffff"

set -g clock-mode-colour "#d4d4d4"

set -g display-panes-active-colour "#d4d4d4"
set -g display-panes-colour "#909090"
EOF

tmux source-file ~/.tmux.conf`,
        },
      ],
    },
    {
      title: "Updated flow",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `dev-mode
  -> tmux-run
      -> docker compose up -d in ~/projects/mlnotebooks
      -> docker compose -f compose.wt1.yaml up -d --force-recreate backend frontend in ~/projects/mlnotebooks-wt1
      -> docker compose -f compose.wt2.yaml up -d --force-recreate backend frontend in ~/projects/mlnotebooks-wt2
      -> tmuxp load home
      -> tmuxp load io_main
      -> tmuxp load io_ec2
      -> tmuxp load hermes
      -> tmuxp load tree_1
      -> tmuxp load tree_2
  -> screen-on
  -> powerprofilesctl set performance
  -> workspace 1: Alacritty attaches to io_main
  -> workspace 2: Firefox
  -> workspace 3: VS Code`,
        },
        {
          kind: "text",
          bullets: [
            "Run dev-mode once after reboot.",
            "Keep tmuxp files focused on layout and commands.",
            "Keep terminal styling in Alacritty.",
            "Keep tmux status and pane styling in ~/.tmux.conf when needed.",
            "Keep i3 workspace and GUI app behavior in dev-mode.",
            "Use Alacritty in dev-mode, not Konsole, to keep the visual style consistent with the base i3 setup.",
          ],
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Home tmuxp session: ~/.config/tmuxp/home.yaml",
            "Main project tmuxp session: ~/.config/tmuxp/io_main.yaml",
            "EC2 tmuxp session: ~/.config/tmuxp/io_ec2.yaml",
            "Hermes tmuxp session: ~/.config/tmuxp/hermes.yaml",
            "Worktree 1 tmuxp session: ~/.config/tmuxp/tree_1.yaml",
            "Worktree 2 tmuxp session: ~/.config/tmuxp/tree_2.yaml",
            "tmux session loader: ~/.local/bin/tmux-run",
            "Screen wake helper: ~/.local/bin/screen-on",
            "i3 development launcher: ~/.local/bin/dev-mode",
            "Main project path: ~/projects/mlnotebooks",
            "Worktree 1 path: ~/projects/mlnotebooks-wt1",
            "Worktree 2 path: ~/projects/mlnotebooks-wt2",
            "Hermes data path: ~/.hermes",
            "Hermes workspace path: ~/hermes-workspace",
            "Claude Box state path: ~/.config/claude-box/state",
          ],
        },
      ],
    },
  ],
}

export default entry

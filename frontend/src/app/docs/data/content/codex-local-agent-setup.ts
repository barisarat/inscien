import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "codex-local-agent-setup",
  kind: "codenote",
  name: "Local Codex Agent Setup",
  desc: "Install Codex CLI on the Arch host, configure global and repo instructions, and start a local workspace-write coding session.",
  intro:
    "Set up Codex CLI as a local coding agent on the Arch host. This workflow keeps Codex running from the host repo, stores personal defaults in ~/.codex/AGENTS.md, stores project rules in the repo AGENTS.md, and starts Codex with workspace-write sandboxing.",
  sections: [
    {
      title: "Install Codex CLI on the host",
      blocks: [
        {
          kind: "text",
          text: [
            "Install Codex CLI with host-level npm. This is separate from the project frontend npm environment.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `npm i -g @openai/codex`,
        },
        {
          kind: "text",
          text: [
            "Use the latest package command later when upgrading the host CLI.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `npm i -g @openai/codex@latest`,
        },
      ],
    },
    {
      title: "Create global Codex instructions",
      blocks: [
        {
          kind: "text",
          text: [
            "Put personal defaults in the global Codex instructions file. These rules apply across local Codex sessions unless a repo adds more specific instructions.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.codex
nano ~/.codex/AGENTS.md`,
        },
        {
          kind: "text",
          bullets: [
            "Keep global rules broad.",
            "Use this file for personal working preferences.",
            "Put project-specific commands, paths, and restrictions in the repo AGENTS.md instead.",
          ],
        },
      ],
    },
    {
      title: "Create repo instructions",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the target repo on the Arch host and create or edit the repo-level AGENTS.md file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-repo
nano AGENTS.md`,
        },
        {
          kind: "text",
          text: [
            "Use the repo file for rules that are specific to that codebase.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Codex should act as a code reader and editor only.",
            "Do not run npm, lint, build, tests, or Docker unless explicitly asked.",
            "Do not search .venv, node_modules, .next, dist, build, coverage, cache, or generated folders.",
            "Do not commit, push, create pull requests, or change branches unless explicitly asked.",
            "The user owns servers, validation runs, dependency changes, package manager commands, and deployment operations.",
          ],
        },
      ],
    },
    {
      title: "Start Codex from the repo root",
      blocks: [
        {
          kind: "text",
          text: [
            "Start Codex from the repo root with workspace-write sandboxing. Codex can read and edit workspace files, and it asks before actions outside the sandbox or higher-risk commands.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/your-repo
codex --sandbox workspace-write --ask-for-approval on-request`,
        },
      ],
    },
    {
      title: "Use a safe first prompt",
      blocks: [
        {
          kind: "text",
          text: [
            "Use a first prompt that points Codex at AGENTS.md and restates the operating boundary for the session.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Use AGENTS.md. Work as a code reader/editor only.
Do not run npm, lint, build, tests, Docker, commits, pushes, or branch changes.
If validation is needed, tell me the command and I will run it.`,
        },
      ],
    },
    {
      title: "Use common TUI commands",
      blocks: [
        {
          kind: "table",
          headers: ["Command", "Use"],
          rows: [
            ["/clear", "Start a fresh visible chat in the current TUI"],
            ["/diff", "Show changed files"],
            ["/status", "Show current session status"],
            ["/exit", "Exit Codex"],
          ],
        },
      ],
    },
    {
      title: "Restart after instruction changes",
      blocks: [
        {
          kind: "text",
          text: [
            "After many tasks, or after changing AGENTS.md, exit Codex and restart it from the repo root. This gives the next session a clean visible chat and the current instruction files.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `/exit

cd ~/projects/your-repo
codex --sandbox workspace-write --ask-for-approval on-request`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Global Codex instructions: ~/.codex/AGENTS.md",
            "Repo Codex instructions: AGENTS.md",
            "Run Codex from the repo root.",
            "Use host-level npm for Codex CLI install and upgrades.",
          ],
        },
      ],
    },
  ],
}

export default entry

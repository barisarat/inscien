import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "bash-aliases",
  kind: "codenote",
  name: "Bash Aliases",
  desc: "Define persistent command shortcuts directly in ~/.bashrc and source them into your shell session.",
  intro:
    "Aliases are shortcut commands that expand into longer commands when you type them. Adding them to ~/.bashrc ensures they are loaded automatically on every new shell session.",
  sections: [
    {
      title: "Open ~/.bashrc",
      blocks: [
        {
          kind: "text",
          text: [
            "Add your aliases at the end of the file to keep them easy to find.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.bashrc`,
        },
      ],
    },
    {
      title: "Add aliases",
      blocks: [
        {
          kind: "text",
          text: [
            "Scroll to the bottom of the file and add your aliases. The example below defines a shortcut for activating a Python virtual environment in the current directory.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Activate the Python virtual environment in the current directory
alias activate='source .venv/bin/activate'`,
        },
      ],
    },
    {
      title: "Apply to the current session",
      blocks: [
        {
          kind: "text",
          text: [
            "New shell sessions pick up the changes automatically. To use the aliases in your current terminal without opening a new one, source ~/.bashrc manually.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `source ~/.bashrc`,
        },
      ],
    },
    {
      title: "Use the alias",
      blocks: [
        {
          kind: "text",
          text: [
            "Navigate to any project directory that contains a .venv folder and run the alias.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/my-project
activate`,
        },
      ],
    },
    {
      title: "List your defined aliases",
      blocks: [
        {
          kind: "text",
          text: [
            "To see all aliases currently active in your session run:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `alias`,
        },
        {
          kind: "text",
          text: [
            "To filter only the custom aliases you added to ~/.bashrc:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep '^alias ' ~/.bashrc`,
        },
      ],
    },
  ],
}

export default entry
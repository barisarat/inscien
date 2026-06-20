import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "linux-shell-line-editing-shortcuts",
  kind: "codenote",
  name: "Linux Shell Line Editing Shortcuts",
  desc: "Common Bash and readline shortcuts for deleting, undoing, and moving through command-line text.",
  intro:
    "Common terminal line editing shortcuts for Bash and other readline-style shells. These shortcuts help edit long commands without reaching for the mouse or repeatedly pressing Backspace.",
  sections: [
    {
      title: "Delete text while editing a command",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these shortcuts while typing or editing a command in the terminal.",
          ],
        },
        {
          kind: "table",
          headers: ["Action", "Shortcut"],
          rows: [
            ["Delete previous word", "Ctrl + W"],
            ["Delete next word", "Alt + D"],
            ["Delete from cursor to start of line", "Ctrl + U"],
            ["Delete from cursor to end of line", "Ctrl + K"],
            ["Undo last edit", "Ctrl + _ or Ctrl + X then Ctrl + U"],
          ],
        },
      ],
    },
    {
      title: "Example",
      blocks: [
        {
          kind: "text",
          text: [
            "Given this command:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python manage.py runserver --settings config.local`,
        },
        {
          kind: "text",
          bullets: [
            "If the cursor is after local, pressing Ctrl + W deletes config.local.",
            "Pressing Ctrl + W again deletes --settings.",
          ],
        },
      ],
    },
    {
      title: "Word boundary behavior",
      blocks: [
        {
          kind: "text",
          text: [
            "Ctrl + W deletes based on shell/readline word boundaries. Paths and punctuation can behave differently depending on terminal and readline settings.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/user/projects/myapp`,
        },
        {
          kind: "text",
          text: [
            "In a path like this, Ctrl + W may delete the whole path or delete chunks of it depending on the active shell/readline behavior.",
          ],
        },
      ],
    },
    {
      title: "Move word by word",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these shortcuts to move through long commands quickly.",
          ],
        },
        {
          kind: "table",
          headers: ["Action", "Shortcut"],
          rows: [
            ["Move back one word", "Alt + B"],
            ["Move forward one word", "Alt + F"],
            ["Delete previous word", "Ctrl + W"],
            ["Delete next word", "Alt + D"],
          ],
        },
      ],
    },
    {
      title: "Compact keyboard note",
      blocks: [
        {
          kind: "text",
          bullets: [
            "On compact keyboards, Alt may also be treated as Meta.",
            "In most terminals, normal Alt + B, Alt + F, and Alt + D work directly.",
          ],
        },
      ],
    },
  ],
}

export default entry
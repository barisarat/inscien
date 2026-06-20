import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "nano-usage",
  kind: "codenote",
  name: "Nano Usage",
  desc: "Keyboard shortcuts for multiline selection, cut and paste, and fast movement in long files in nano.",
  intro:
    "Nano handles selection, cut, paste, and navigation entirely through keyboard shortcuts. This page is a quick reference for the shortcuts used most often during edits in long files.",
  sections: [
    {
      title: "Shortcuts",
      blocks: [
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Ctrl+^", "Start selecting from cursor (same as Ctrl+Shift+6)"],
            ["Ctrl+K", "Cut selection, or delete the whole current line if nothing selected"],
            ["Alt+6", "Copy selection without deleting"],
            ["Ctrl+U", "Paste most recently cut or copied text"],
            ["Ctrl+V", "Page down"],
            ["Ctrl+Y", "Page up"],
            ["Alt+/", "Jump to end of file"],
            ["Alt+\\", "Jump to start of file"],
            ["Ctrl+_", "Jump to specific line number"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "After Ctrl+^ (start selection), expand the selection using arrow keys.",
            "After Ctrl+_, type the target line number and press Enter.",
            "Ctrl+K cuts the selection when one is active; otherwise it deletes the entire current line.",
          ],
        },
      ],
    },
  ],
}

export default entry
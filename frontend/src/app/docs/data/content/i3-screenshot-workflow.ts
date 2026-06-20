import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-screenshot-workflow",
  kind: "codenote",
  name: "i3 Screenshot Workflow with maim and xclip",
  desc: "Configure a simple selected-region screenshot shortcut in i3 using maim, slop, and xclip.",
  intro:
    "Configure screenshots in i3 with maim and xclip. This workflow captures a selected region and copies the image directly to the clipboard, which keeps screenshot handling fast and simple inside a minimal i3 setup.",
  sections: [
    {
      title: "Install screenshot tools",
      blocks: [
        {
          kind: "text",
          text: [
            "Install maim for screenshots, slop for region selection support, and xclip for copying the image to the clipboard.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S maim xclip slop`,
        },
      ],
    },
    {
      title: "Add the i3 screenshot shortcut",
      blocks: [
        {
          kind: "text",
          text: [
            "Add a keybinding to ~/.config/i3/config. The F8 shortcut captures a selected region and copies it to the clipboard as PNG data.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/i3/config`,
        },
        {
          kind: "code",
          language: "bash",
          code: `# Screenshots
bindsym F8 exec maim -s | xclip -selection clipboard -t image/png`,
        },
      ],
    },
    {
      title: "Reload i3",
      blocks: [
        {
          kind: "text",
          text: [
            "Reload i3 after adding or changing the keybinding.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3-msg reload`,
        },
      ],
    },
    {
      title: "Use the shortcut",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Press F8.",
            "Select the region with the mouse.",
            "Paste the copied image into a chat, document, note, or image-capable app.",
          ],
        },
      ],
    },
    {
      title: "Manual screenshot command",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this command to test the workflow manually without the i3 keybinding.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `maim -s | xclip -selection clipboard -t image/png`,
        },
      ],
    },
    {
      title: "Debug commands",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Confirm tools are installed
command -v maim
command -v xclip
command -v slop

# Check screenshot binding
grep -n 'maim\\|xclip\\|F8' ~/.config/i3/config

# Reload i3 after changes
i3-msg reload`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "i3 window manager config: ~/.config/i3/config",
            "Screenshot command: maim -s | xclip -selection clipboard -t image/png",
          ],
        },
      ],
    },
  ],
}

export default entry
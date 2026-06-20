import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "browser-setup-linux",
  kind: "codenote",
  name: "Browser Setup and Shortcuts",
  desc: "Install Firefox, Chromium, and Google Chrome on Linux, understand when to use each one, and keep a practical set of Firefox shortcuts for keyboard-first usage.",
  intro:
    "Firefox, Chromium, and Google Chrome each serve a slightly different role on a development machine. Firefox is useful for daily browsing and cross checks, Chromium is a clean Blink based test browser, and Google Chrome is helpful when you need the official Chrome build or Chrome specific sync and integrations.",
  sections: [
    {
      title: "Installation",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the package manager that matches your distribution. Firefox and Chromium are typically available from standard repositories. Google Chrome may require a separate package source depending on the distro.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Arch Linux: Firefox and Chromium from official repositories, Google Chrome from the AUR",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S firefox
sudo pacman -S chromium
yay -S google-chrome`,
        },
        {
          kind: "text",
          bullets: [
            "Ubuntu and Debian: Firefox and Chromium packages depend on release and packaging policy, while Google Chrome is usually installed from Google's .deb package",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt update
sudo apt install firefox chromium`,
        },
      ],
    },
    {
      title: "When to use each browser",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Firefox: good default browser for daily work, reading, and non-Chromium compatibility checks",
            "Chromium: useful for testing Blink based behavior without Chrome account sync or extra proprietary integration",
            "Google Chrome: useful when a site behaves differently in the official Chrome build or when Chrome sync, profiles, or proprietary features matter",
          ],
        },
      ],
    },
    {
      title: "Firefox shortcuts — Tabs",
      blocks: [
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Ctrl+T", "New tab"],
            ["Ctrl+W", "Close tab"],
            ["Ctrl+Shift+T", "Reopen closed tab or window"],
            ["Ctrl+Shift+P", "New private window"],
            ["Ctrl+Tab", "Next tab"],
            ["Ctrl+Shift+Tab", "Previous tab"],
          ],
        },
      ],
    },
    {
      title: "Firefox shortcuts — Navigation",
      blocks: [
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Ctrl+L", "Focus address bar"],
            ["Ctrl+R", "Reload page"],
            ["Ctrl+Shift+R", "Hard reload (bypass cache)"],
            ["Ctrl+F", "Find in page"],
            ["Alt+Left", "Back"],
            ["Alt+Right", "Forward"],
          ],
        },
      ],
    },
    {
      title: "Firefox shortcuts — Bookmarks and History",
      blocks: [
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Ctrl+D", "Bookmark current page"],
            ["Ctrl+J", "Open downloads"],
            ["Ctrl+H", "Open history"],
            ["Ctrl+Shift+B", "Toggle bookmarks toolbar"],
          ],
        },
      ],
    },
    {
      title: "Firefox shortcuts — Zoom and DevTools",
      blocks: [
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Ctrl++", "Zoom in"],
            ["Ctrl+-", "Zoom out"],
            ["Ctrl+0", "Reset zoom"],
            ["F12", "Toggle developer tools"],
            ["Ctrl+Shift+I", "Toggle developer tools (alt)"],
            ["Ctrl+Shift+K", "Open web console"],
          ],
        },
      ],
    },
  ],
}

export default entry
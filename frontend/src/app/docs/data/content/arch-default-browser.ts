import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-default-browser",
  kind: "codenote",
  name: "Arch Default Browser on KDE",
  desc: "Fix xdg-settings failing with 'qtpaths: command not found' and set Firefox as the system default browser on Arch Linux with KDE Plasma.",
  intro:
    "On Arch with KDE Plasma, apps that use the system default browser may open Chromium or Chrome instead of Firefox, and xdg-settings fails with 'qtpaths: command not found'. The cause is that qt6-base ships qtpaths6 but xdg-mime expects a command named qtpaths on PATH. The fix is a symlink plus setting the default explicitly.",
  sections: [
    {
      title: "Typical error",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `/usr/bin/xdg-mime: line 885: qtpaths: command not found`,
        },
      ],
    },
    {
      title: "Check the current default browser",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `xdg-settings get default-web-browser`,
        },
      ],
    },
    {
      title: "Check whether qtpaths exists",
      blocks: [
        {
          kind: "text",
          text: [
            "Confirm that qtpaths is missing from PATH while qtpaths6 is present.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `which qtpaths
which qtpaths6`,
        },
        {
          kind: "text",
          text: ["Confirm which package provides qtpaths6. Expected result: extra/qt6-base ... usr/lib/qt6/bin/qtpaths6."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -Fy
pacman -F qtpaths6`,
        },
      ],
    },
    {
      title: "Symlink qtpaths6 as qtpaths",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a symlink so xdg-mime can find qtpaths on PATH.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo ln -s /usr/lib/qt6/bin/qtpaths6 /usr/local/bin/qtpaths`,
        },
        {
          kind: "text",
          text: ["If the symlink already exists or needs to be replaced, use -f to overwrite."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo ln -sf /usr/lib/qt6/bin/qtpaths6 /usr/local/bin/qtpaths`,
        },
        {
          kind: "text",
          text: ["Verify qtpaths is now available."],
        },
        {
          kind: "code",
          language: "bash",
          code: `which qtpaths
qtpaths --version`,
        },
      ],
    },
    {
      title: "Set Firefox as default",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `xdg-settings set default-web-browser firefox.desktop
xdg-settings get default-web-browser`,
        },
      ],
    },
    {
      title: "Set MIME handlers explicitly",
      blocks: [
        {
          kind: "text",
          text: [
            "xdg-settings alone does not always cover every link type. Set the http, https, and html handlers directly.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xdg-mime default firefox.desktop x-scheme-handler/http
xdg-mime default firefox.desktop x-scheme-handler/https
xdg-mime default firefox.desktop text/html`,
        },
        {
          kind: "text",
          text: ["Verify the handlers."],
        },
        {
          kind: "code",
          language: "bash",
          code: `xdg-mime query default x-scheme-handler/http
xdg-mime query default x-scheme-handler/https
xdg-mime query default text/html`,
        },
      ],
    },
    {
      title: "Test",
      blocks: [
        {
          kind: "text",
          text: ["Open a link through xdg-open. It should launch in Firefox. No reboot or shell refresh is required."],
        },
        {
          kind: "code",
          language: "bash",
          code: `xdg-open https://example.com`,
        },
      ],
    },
  ],
}

export default entry
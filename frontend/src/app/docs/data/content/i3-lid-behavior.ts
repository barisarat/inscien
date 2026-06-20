import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-lid-behavior",
  kind: "codenote",
  name: "i3 Laptop Lid Behavior on Arch",
  desc: "Configure systemd-logind lid behavior for laptop, plugged-in, docked, and external-display i3 workflows.",
  intro:
    "Configure laptop lid behavior on Arch for an i3 setup. This workflow keeps lid behavior separate from the main i3 configuration because it is controlled by systemd-logind, not by i3 itself. It covers strict suspend behavior, docked external-display behavior, applying changes, and verifying the active configuration.",
  sections: [
    {
      title: "Understand where lid behavior is configured",
      blocks: [
        {
          kind: "text",
          text: [
            "Lid behavior is controlled by systemd-logind, not by i3. The i3 window manager controls windows, workspaces, keybindings, and status bar behavior, while logind handles hardware events such as closing the laptop lid.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/logind.conf`,
        },
      ],
    },
    {
      title: "Option A: strict laptop suspend behavior",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this option when the laptop should suspend whenever the lid is closed, regardless of battery, external power, or docked state.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `[Login]
HandleLidSwitch=suspend
HandleLidSwitchExternalPower=suspend
HandleLidSwitchDocked=suspend`,
        },
        {
          kind: "text",
          bullets: [
            "HandleLidSwitch controls lid close behavior on battery.",
            "HandleLidSwitchExternalPower controls lid close behavior while plugged in.",
            "HandleLidSwitchDocked controls lid close behavior when systemd considers the machine docked.",
          ],
        },
      ],
    },
    {
      title: "Option B: docked external-screen behavior",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this option when the laptop is often used with a single external screen and the lid may be closed while plugged in. The laptop still suspends on battery lid close, but ignores lid close while plugged in or docked.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `[Login]
HandleLidSwitch=suspend
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore`,
        },
        {
          kind: "text",
          bullets: [
            "This is useful for an external-only i3 desk setup.",
            "The laptop still suspends when the lid is closed on battery.",
            "The laptop stays running when the lid is closed while plugged in or docked.",
          ],
        },
      ],
    },
    {
      title: "Apply the change",
      blocks: [
        {
          kind: "text",
          text: [
            "Restart systemd-logind after editing the file. Restarting logind can log out the current graphical session, so save work first.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl restart systemd-logind`,
        },
      ],
    },
    {
      title: "Verify active lid settings",
      blocks: [
        {
          kind: "text",
          text: [
            "Use systemd-analyze to see the final merged configuration that systemd is actually using.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemd-analyze cat-config systemd/logind.conf | grep -i HandleLid`,
        },
        {
          kind: "text",
          text: [
            "For the docked external-screen setup, the expected values are:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `HandleLidSwitch=suspend
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore`,
        },
      ],
    },
    {
      title: "Check logind status",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands when lid behavior does not match the edited configuration.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl status systemd-logind --no-pager
journalctl -u systemd-logind -b --no-pager -n 100`,
        },
      ],
    },
    {
      title: "Debug related display state",
      blocks: [
        {
          kind: "text",
          text: [
            "When using external-only i3 display profiles, confirm the current xrandr state before testing lid behavior.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xrandr | grep " connected"
xrandr`,
        },
        {
          kind: "text",
          bullets: [
            "If the external monitor is active and the laptop panel is off, Option B is usually the better lid behavior.",
            "If the laptop panel is the only active display, Option A is usually safer.",
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
            "logind config: /etc/systemd/logind.conf",
            "systemd-logind service: systemd-logind.service",
            "i3 config is not responsible for lid behavior.",
          ],
        },
      ],
    },
  ],
}

export default entry
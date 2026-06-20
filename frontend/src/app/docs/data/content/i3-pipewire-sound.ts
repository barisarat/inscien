import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-pipewire-sound",
  kind: "codenote",
  name: "i3 PipeWire Sound Checks on Arch",
  desc: "Check and fix common PipeWire sound issues in a minimal i3 session on Arch.",
  intro:
    "Check and fix sound in a minimal i3 session on Arch using PipeWire, WirePlumber, pipewire-pulse, and wpctl. This workflow focuses on the common case where sound appears broken because the default sink volume is muted or set to 0.00.",
  sections: [
    {
      title: "Check PipeWire status",
      blocks: [
        {
          kind: "text",
          text: [
            "On a fresh Arch install with PipeWire and WirePlumber running, sound can still appear broken when the default sink volume is simply at 0.00. Check status first before assuming anything is actually wrong.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `wpctl status
wpctl get-volume @DEFAULT_AUDIO_SINK@`,
        },
      ],
    },
    {
      title: "Set default output volume",
      blocks: [
        {
          kind: "text",
          text: [
            "Set, raise, lower, or mute the default output device with wpctl.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `wpctl set-volume @DEFAULT_AUDIO_SINK@ 0.5
wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%+
wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-
wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle`,
        },
        {
          kind: "text",
          bullets: [
            "0.5 means 50 percent volume.",
            "5%+ raises volume by 5 percent.",
            "5%- lowers volume by 5 percent.",
            "set-mute toggle toggles mute on the default output sink.",
          ],
        },
      ],
    },
    {
      title: "Start and enable audio services",
      blocks: [
        {
          kind: "text",
          text: [
            "If audio services are not running, start and enable PipeWire, WirePlumber, and pipewire-pulse for the user session.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl --user status pipewire
systemctl --user status wireplumber
systemctl --user status pipewire-pulse

systemctl --user enable --now pipewire wireplumber pipewire-pulse`,
        },
      ],
    },
    {
      title: "Optional GUI mixer",
      blocks: [
        {
          kind: "text",
          text: [
            "Install pavucontrol when a GUI mixer is useful for per-app volume, output device switching, and quick inspection.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S pavucontrol
pavucontrol`,
        },
      ],
    },
    {
      title: "Daily notes",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Laptop Fn volume keys usually work out of the box with PipeWire.",
            "No extra i3 keybinding is needed if the hardware keys already work.",
            "If sound seems gone after login, check the sink volume first with wpctl get-volume.",
            "A reset to 0.00 is a common cause of silent audio.",
          ],
        },
      ],
    },
    {
      title: "Debug commands",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Check audio graph and default devices
wpctl status

# Check default sink volume
wpctl get-volume @DEFAULT_AUDIO_SINK@

# Check user services
systemctl --user status pipewire
systemctl --user status wireplumber
systemctl --user status pipewire-pulse

# Check recent user service logs
journalctl --user -u pipewire -b --no-pager -n 100
journalctl --user -u wireplumber -b --no-pager -n 100
journalctl --user -u pipewire-pulse -b --no-pager -n 100`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "PipeWire user service: pipewire.service",
            "WirePlumber user service: wireplumber.service",
            "Pulse compatibility user service: pipewire-pulse.service",
            "Main command-line tool: wpctl",
            "Optional GUI mixer: pavucontrol",
          ],
        },
      ],
    },
  ],
}

export default entry
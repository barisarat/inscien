import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-screen-layout-profiles",
  kind: "codenote",
  name: "i3 Screen Layout Profiles with xrandr Refresh Rates",
  desc: "Create reusable xrandr screen layout profiles with explicit refresh rates for laptop-only, external-only, and mirror modes in an i3 setup.",
  intro:
    "Create reusable screen layout profiles for an i3 setup on Arch. This workflow keeps display switching separate from the main i3 setup by using xrandr scripts for laptop-only, external 1K, external 2K, and mirror modes. Each profile sets the expected refresh rate and can be checked with xrandr --current after switching.",
  sections: [
    {
      title: "Install required tools",
      blocks: [
        {
          kind: "text",
          text: [
            "Install xrandr for display detection and layout changes. Install xsetroot only if the main i3 setup has not already installed it for root background color.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S xorg-xrandr xorg-xsetroot`,
        },
      ],
    },
    {
      title: "Identify display outputs",
      blocks: [
        {
          kind: "text",
          text: [
            "Run xrandr from the current i3 session and note the connected output names. These names are used directly in the screen layout scripts.",
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
          text: [
            "On this setup, the laptop panel appears as DP-2 when only the laptop screen is active. External outputs can appear as HDMI-0, DP-0, DP-1, or another driver-specific name depending on the cable, dock, GPU path, and monitor.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Example laptop-only result
DP-2 connected primary 1920x1080+0+0`,
        },
        {
          kind: "text",
          bullets: [
            "connected means the output is detected by xrandr.",
            "primary means the output is the main screen for panels, bars, and workspace placement.",
            "The laptop panel name is not universal. On this machine it is DP-2, but other laptops may use eDP-1, eDP-1-1, or LVDS-1.",
            "Always confirm the external output name after connecting a new monitor or projector.",
          ],
        },
      ],
    },
    {
      title: "Create screen layout directory",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep display profile scripts in ~/.screenlayout so they are easy to find, test, and bind from i3.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.screenlayout`,
        },
      ],
    },
    {
      title: "Create the laptop-only profile",
      blocks: [
        {
          kind: "text",
          text: [
            "The laptop-only profile is the safe default and recovery mode. It makes the DP-2 laptop panel primary at 1920x1080 and 144 Hz, then turns off known external outputs.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.screenlayout/laptop-only.sh`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/bin/bash

xrandr \\
  --output DP-2 --primary --mode 1920x1080 --rate 144 \\
  --output HDMI-0 --off \\
  --output DP-0 --off \\
  --output DP-1 --off`,
        },
      ],
    },
    {
      title: "Create the external 1K profile",
      blocks: [
        {
          kind: "text",
          text: [
            "The external 1K profile is for normal 1920x1080 external monitors on HDMI-0 at 60 Hz. If HDMI-0 is not connected, it falls back to laptop-only.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.screenlayout/external-1k-only.sh`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/bin/bash

if xrandr | grep -q "^HDMI-0 connected"
then
    xrandr \\
      --output HDMI-0 --primary --mode 1920x1080 --rate 60 \\
      --output DP-2 --off
else
    ~/.screenlayout/laptop-only.sh
fi`,
        },
      ],
    },
    {
      title: "Create the external 2K profile",
      blocks: [
        {
          kind: "text",
          text: [
            "The external 2K profile is for the office desk monitor on HDMI-0 at 2560x1440 and 74.93 Hz. If HDMI-0 is not connected, it falls back to laptop-only.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.screenlayout/external-2k-only.sh`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/bin/bash

if xrandr | grep -q "^HDMI-0 connected"
then
    xrandr \\
      --output HDMI-0 --primary --mode 2560x1440 --rate 74.93 \\
      --output DP-2 --off
else
    ~/.screenlayout/laptop-only.sh
fi`,
        },
      ],
    },
    {
      title: "Create the mirror profile",
      blocks: [
        {
          kind: "text",
          text: [
            "The mirror profile is for presentations. Mirroring uses 1920x1080 at 60 Hz on both screens because projectors, TVs, meeting-room screens, and capture devices are more likely to support it.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.screenlayout/mirror-1k.sh`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/bin/bash

if xrandr | grep -q "^HDMI-0 connected"
then
    xrandr \\
      --output DP-2 --primary --mode 1920x1080 --rate 60 \\
      --output HDMI-0 --mode 1920x1080 --rate 60 --same-as DP-2
else
    ~/.screenlayout/laptop-only.sh
fi`,
        },
      ],
    },
    {
      title: "Make profiles executable and test",
      blocks: [
        {
          kind: "text",
          text: [
            "Make all profile scripts executable. Run a profile, then use xrandr --current to verify the active mode and refresh rate. The active refresh rate is marked with *.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod +x ~/.screenlayout/laptop-only.sh
chmod +x ~/.screenlayout/external-1k-only.sh
chmod +x ~/.screenlayout/external-2k-only.sh
chmod +x ~/.screenlayout/mirror-1k.sh

~/.screenlayout/laptop-only.sh
xrandr --current

~/.screenlayout/external-1k-only.sh
xrandr --current

~/.screenlayout/external-2k-only.sh
xrandr --current

~/.screenlayout/mirror-1k.sh
xrandr --current`,
        },
        {
          kind: "text",
          bullets: [
            "If the external monitor is not connected, the external scripts fall back to laptop-only.",
            "If the external monitor appears under a different output name, replace HDMI-0 in the scripts with the detected output.",
            "Keep laptop-only as the default because it is the safest recovery mode after hibernate or monitor disconnects.",
          ],
        },
      ],
    },
    {
      title: "Check active refresh rates",
      blocks: [
        {
          kind: "text",
          text: [
            "Use focused checks when confirming a known profile. These commands show the connected output and the mode line where xrandr marks the active refresh rate.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Laptop-only expected active marker:
# 1920x1080     60.00 + 144.00*
~/.screenlayout/laptop-only.sh
xrandr --current | grep -A1 "DP-2 connected"

# External 2K expected active marker:
# 2560x1440     59.95 +  74.93*
~/.screenlayout/external-2k-only.sh
xrandr --current | grep -A1 "HDMI-0 connected"

# External 1K expected active marker:
# 1920x1080     60.00*
~/.screenlayout/external-1k-only.sh
xrandr --current | grep -A1 "HDMI-0 connected"

# Mirror mode check
~/.screenlayout/mirror-1k.sh
xrandr --current | grep -E "DP-2 connected|HDMI-0 connected|1920x1080"`,
        },
      ],
    },
    {
      title: "Add i3 startup and screen shortcuts",
      blocks: [
        {
          kind: "text",
          text: [
            "Add the laptop-only startup profile and screen profile shortcuts to ~/.config/i3/config. This keeps i3 startup safe while allowing manual switching to external-only or mirror mode.",
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
          code: `# Safe default display profile
exec --no-startup-id ~/.screenlayout/laptop-only.sh

# Recommended single-screen workspace mapping
workspace 1 output primary
workspace 2 output primary
workspace 3 output primary
workspace 4 output primary
workspace 5 output primary
workspace 6 output primary

# Screen profile shortcuts
bindsym $mod+Control+1 exec --no-startup-id ~/.screenlayout/laptop-only.sh
bindsym $mod+Control+2 exec --no-startup-id ~/.screenlayout/external-1k-only.sh
bindsym $mod+Control+3 exec --no-startup-id ~/.screenlayout/external-2k-only.sh
bindsym $mod+Control+4 exec --no-startup-id ~/.screenlayout/mirror-1k.sh`,
        },
        {
          kind: "text",
          bullets: [
            "No shortcut change is required if these bindings already exist.",
            "Mod+Control+1 forces laptop-only mode and is useful as a recovery shortcut after a bad resume or disconnected monitor.",
            "Mod+Control+2 switches to a 1920x1080 external-only profile at 60 Hz.",
            "Mod+Control+3 switches to a 2560x1440 external-only profile at 74.93 Hz.",
            "Mod+Control+4 switches to 1920x1080 mirror mode at 60 Hz for presentations.",
            "Avoid Mod+Shift+J, Mod+Shift+K, and Mod+Shift+L for screen modes because default i3 uses them for moving windows.",
          ],
        },
      ],
    },
    {
      title: "Reload i3 and verify keybindings",
      blocks: [
        {
          kind: "text",
          text: [
            "Reload i3 after editing the config. If i3 reports duplicate keybindings, search for the conflicting bindsym line and keep only one binding for that key combination.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3-msg reload

grep -nE 'screenlayout|Control\\+[1234]' ~/.config/i3/config`,
        },
      ],
    },
    {
      title: "Daily screen profile shortcuts",
      blocks: [
        {
          kind: "table",
          headers: ["Shortcut", "Profile"],
          rows: [
            ["Mod+Control+1", "Laptop-only, DP-2, 1920x1080 at 144 Hz"],
            ["Mod+Control+2", "External 1K-only, HDMI-0, 1920x1080 at 60 Hz"],
            ["Mod+Control+3", "External 2K-only, HDMI-0, 2560x1440 at 74.93 Hz"],
            ["Mod+Control+4", "Mirror 1K, DP-2 and HDMI-0, 1920x1080 at 60 Hz"],
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
          code: `# Monitor names, positions, modes, and refresh rates
xrandr --current
xrandr --current | grep " connected"

# Confirm screen layout scripts exist
ls -l ~/.screenlayout

# Test the safe laptop profile
~/.screenlayout/laptop-only.sh
xrandr --current | grep -A1 "DP-2 connected"

# Test an external profile after connecting the monitor
~/.screenlayout/external-1k-only.sh
xrandr --current | grep -A1 "HDMI-0 connected"

~/.screenlayout/external-2k-only.sh
xrandr --current | grep -A1 "HDMI-0 connected"

# Test mirror mode after connecting the monitor
~/.screenlayout/mirror-1k.sh
xrandr --current | grep -E "DP-2 connected|HDMI-0 connected|1920x1080"

# Check screen profile keybindings
grep -nE 'screenlayout|Control\\+[1234]' ~/.config/i3/config

# Find duplicate keybindings manually if i3 reports a conflict
grep -n '^bindsym' ~/.config/i3/config`,
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
            "Screen layout directory: ~/.screenlayout",
            "Laptop-only profile: ~/.screenlayout/laptop-only.sh",
            "External 1K profile: ~/.screenlayout/external-1k-only.sh",
            "External 2K profile: ~/.screenlayout/external-2k-only.sh",
            "Mirror presentation profile: ~/.screenlayout/mirror-1k.sh",
          ],
        },
      ],
    },
  ],
}

export default entry

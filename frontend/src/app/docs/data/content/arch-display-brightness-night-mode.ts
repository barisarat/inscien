import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-display-brightness-night-mode",
  kind: "codenote",
  name: "Arch Display Brightness and Night Mode",
  desc: "Manual brightness and blue light control for an Arch Linux i3 multi-monitor setup.",
  intro:
    "This setup controls laptop brightness with brightnessctl, external monitor hardware brightness with ddcutil, and blue light reduction with redshift. It is useful for an Arch Linux i3 workstation with one laptop screen and one or more external monitors.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use brightnessctl for the laptop screen exposed under /sys/class/backlight.",
            "Use ddcutil for external monitors that support DDC/CI brightness control.",
            "Use redshift -O for manual blue light reduction across active X11 displays.",
            "Use redshift -x to reset the screen color temperature back to normal.",
            "Create one all-bright command to set laptop and external monitor brightness together.",
            "Keep brightness and night mode separate so they can be adjusted independently.",
          ],
        },
      ],
    },
    {
      title: "Install required tools",
      blocks: [
        {
          kind: "text",
          text: [
            "Install brightnessctl for the laptop backlight, ddcutil and i2c-tools for external monitor brightness, and redshift for manual night mode.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S brightnessctl ddcutil i2c-tools redshift`,
        },
      ],
    },
    {
      title: "Check laptop backlight device",
      blocks: [
        {
          kind: "text",
          text: [
            "The laptop screen is controlled through a backlight device. The device name depends on the machine and GPU. Common examples include nvidia_0, intel_backlight, and amdgpu_bl0.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls /sys/class/backlight
brightnessctl`,
        },
        {
          kind: "text",
          text: [
            "Use the detected device name when setting brightness explicitly. Replace nvidia_0 with the device name shown on your system.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `brightnessctl -d nvidia_0 set 40%`,
        },
      ],
    },
    {
      title: "Enable external monitor DDC access",
      blocks: [
        {
          kind: "text",
          text: [
            "External monitors are controlled through DDC/CI over i2c. Load the i2c-dev module before using ddcutil.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo modprobe i2c-dev
ddcutil detect`,
        },
      ],
    },
    {
      title: "Map detected displays",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use ddcutil detect to find the external monitor display numbers.",
            "External monitor 1 is usually controlled with ddcutil --display 1.",
            "External monitor 2 is usually controlled with ddcutil --display 2.",
            "The laptop display may appear as an invalid DDC display because laptop panels usually do not support DDC/CI.",
            "Use brightnessctl for the laptop display.",
            "Use ddcutil for each detected external monitor.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ddcutil detect`,
        },
      ],
    },
    {
      title: "Check external monitor brightness",
      blocks: [
        {
          kind: "text",
          text: [
            "VCP code 10 is the standard DDC/CI brightness control. Use getvcp before changing brightness to confirm monitor support.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ddcutil --display 1 getvcp 10
ddcutil --display 2 getvcp 10`,
        },
      ],
    },
    {
      title: "Set external monitor brightness manually",
      blocks: [
        {
          kind: "text",
          text: [
            "Set each external monitor brightness with ddcutil. The value is usually between 0 and 100. Add or remove display lines depending on how many external monitors are detected.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ddcutil --display 1 setvcp 10 40
ddcutil --display 2 setvcp 10 40`,
        },
      ],
    },
    {
      title: "Create all-bright command",
      blocks: [
        {
          kind: "text",
          text: [
            "Create one command that sets the laptop screen and external monitors to the same brightness value. Replace nvidia_0 with the laptop backlight device detected on your system. Add or remove ddcutil display lines depending on the number of external monitors.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.local/bin/all-bright`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/usr/bin/env bash

VALUE="$1"

if [ -z "$VALUE" ]; then
    echo "Usage: all-bright 40"
    exit 1
fi

brightnessctl -d nvidia_0 set "$VALUE%"

ddcutil --display 1 setvcp 10 "$VALUE"
ddcutil --display 2 setvcp 10 "$VALUE"`,
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod +x ~/.local/bin/all-bright`,
        },
      ],
    },
    {
      title: "Make local scripts available in shell",
      blocks: [
        {
          kind: "text",
          text: [
            "The ~/.local/bin folder must be in PATH so all-bright can be called from any terminal.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -q 'HOME/.local/bin' ~/.bashrc || echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
command -v all-bright`,
        },
      ],
    },
    {
      title: "Manual night mode with redshift",
      blocks: [
        {
          kind: "text",
          text: [
            "Use redshift in one-shot mode for manual blue light reduction. This changes color temperature across active X11 displays and can be reset manually.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `redshift -O 3500
redshift -x`,
        },
      ],
    },
    {
      title: "Redshift temperature reference",
      blocks: [
        {
          kind: "text",
          bullets: [
            "redshift -O 4500 gives a mild warm screen.",
            "redshift -O 4000 gives a moderate warm screen.",
            "redshift -O 3500 gives a clear night mode look.",
            "redshift -O 3000 gives a stronger orange night mode look.",
            "redshift -x resets the color temperature back to normal.",
          ],
        },
      ],
    },
    {
      title: "Daily usage",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands manually depending on the time of day and room lighting.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Set all screens to a comfortable daytime brightness
all-bright 70

# Set all screens to a lower evening brightness
all-bright 40

# Enable manual night mode with reduced blue light
redshift -O 3500

# Disable night mode and return colors to normal
redshift -x

# Evening setup with lower brightness and warmer color temperature
all-bright 40
redshift -O 3500

# Daytime setup with higher brightness and normal color temperature
all-bright 70
redshift -x`,
        },
      ],
    },
    {
      title: "Troubleshooting",
      blocks: [
        {
          kind: "text",
          bullets: [
            "If brightnessctl only changes the laptop screen, this is expected.",
            "If the explicit brightnessctl device does not exist, check the available device with ls /sys/class/backlight.",
            "If ddcutil detect does not show external monitors, load i2c-dev with sudo modprobe i2c-dev.",
            "If ddcutil works with sudo but not as normal user, add the user to the i2c group and log out and back in.",
            "If redshift changes color but not brightness, this is expected because redshift controls color temperature, not hardware brightness.",
            "If redshift does not affect all monitors, confirm the session is running on X11 and not Wayland.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls /sys/class/backlight
sudo modprobe i2c-dev
sudo usermod -aG i2c "$USER"
echo "$XDG_SESSION_TYPE"`,
        },
      ],
    },
  ],
}

export default entry
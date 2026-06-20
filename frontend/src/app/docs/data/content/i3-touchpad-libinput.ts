import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-touchpad-libinput",
  kind: "codenote",
  name: "i3 Touchpad Scrolling on Arch",
  desc: "Configure natural scrolling, tap-to-click, and slower touchpad scrolling on Arch with i3, X11, and libinput.",
  intro:
    "Configure touchpad behavior on Arch in an i3/X11 session with libinput. This setup enables natural scrolling, enables tap-to-click, slows two-finger scrolling with ScrollPixelDistance, and persists the settings across reboot and future i3 logins.",
  sections: [
    {
      title: "Install the X11 input tools",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the libinput Xorg driver and xinput command-line tool if they are not already present.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S xf86-input-libinput xorg-xinput`,
        },
      ],
    },
    {
      title: "Find the touchpad name",
      blocks: [
        {
          kind: "text",
          text: [
            "List input devices and copy the full touchpad device name. Do not rely on the numeric device id because it can change after reboot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xinput list

# Example touchpad name from this ASUS setup:
# ASUF1204:00 2808:0202 Touchpad`,
        },
      ],
    },
    {
      title: "Inspect current properties",
      blocks: [
        {
          kind: "text",
          text: [
            "Inspect the current libinput properties for the touchpad. The exact property ids can change, so use the property names in commands.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xinput list-props "ASUF1204:00 2808:0202 Touchpad"`,
        },
        {
          kind: "table",
          headers: ["Property", "Useful value"],
          rows: [
            ["libinput Natural Scrolling Enabled", "0 is traditional scrolling, 1 is natural scrolling"],
            ["libinput Tapping Enabled", "0 disables tap-to-click, 1 enables tap-to-click"],
            ["libinput Scroll Method Enabled", "1, 0, 0 means two-finger scrolling is active"],
            ["libinput Scrolling Pixel Distance", "Higher values feel slower, lower values feel faster"],
          ],
        },
      ],
    },
    {
      title: "Live-test the settings",
      blocks: [
        {
          kind: "text",
          text: [
            "Set the properties live first. These commands affect the current X11 session only and are useful for choosing a comfortable scroll distance before making the setup permanent.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xinput set-prop "ASUF1204:00 2808:0202 Touchpad" "libinput Natural Scrolling Enabled" 1
xinput set-prop "ASUF1204:00 2808:0202 Touchpad" "libinput Tapping Enabled" 1
xinput set-prop "ASUF1204:00 2808:0202 Touchpad" "libinput Scrolling Pixel Distance" 40`,
        },
        {
          kind: "text",
          bullets: [
            "Natural scrolling reverses the touchpad scroll direction to the mac-style direction.",
            "Tapping enables tap-to-click.",
            "A ScrollPixelDistance value of 40 worked well on this setup.",
            "Increase ScrollPixelDistance for slower scrolling.",
            "Decrease ScrollPixelDistance for faster scrolling.",
          ],
        },
      ],
    },
    {
      title: "Verify live values",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `xinput list-props "ASUF1204:00 2808:0202 Touchpad" | grep -E "Natural Scrolling|Tapping Enabled|Scrolling Pixel Distance"

# Expected result:
# libinput Natural Scrolling Enabled: 1
# libinput Tapping Enabled: 1
# libinput Scrolling Pixel Distance: 40`,
        },
      ],
    },
    {
      title: "Make the setup permanent",
      blocks: [
        {
          kind: "text",
          text: [
            "Persist the touchpad settings with an Xorg input class. This is an Xorg/libinput configuration, not an i3 configuration.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo mkdir -p /etc/X11/xorg.conf.d
sudo nano /etc/X11/xorg.conf.d/30-touchpad.conf`,
        },
        {
          kind: "code",
          language: "bash",
          code: `Section "InputClass"
    Identifier "ASUS touchpad libinput"
    MatchIsTouchpad "on"
    Driver "libinput"

    Option "NaturalScrolling" "true"
    Option "Tapping" "true"
    Option "ScrollMethod" "twofinger"
    Option "DisableWhileTyping" "true"
    Option "ScrollPixelDistance" "40"
EndSection`,
        },
      ],
    },
    {
      title: "Restart the X11 session",
      blocks: [
        {
          kind: "text",
          text: [
            "Restart the i3/X11 session after changing the Xorg input file. Reloading i3 is not enough because Xorg reads this input configuration when the graphical session starts.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3-msg exit`,
        },
        {
          kind: "text",
          text: [
            "Log back into i3, then verify the permanent values.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xinput list-props "ASUF1204:00 2808:0202 Touchpad" | grep -E "Natural Scrolling|Tapping Enabled|Scrolling Pixel Distance"`,
        },
      ],
    },
    {
      title: "Optional app-level tuning",
      blocks: [
        {
          kind: "text",
          text: [
            "Browser and terminal scroll feel can still be tuned separately. Picom does not control touchpad scrolling or smoothness, and true global smooth or inertia scrolling is not normally handled by X11/libinput.",
          ],
        },
        {
          kind: "text",
          text: [
            "For Alacritty, edit the terminal scrolling multiplier if terminal scrolling feels too fast or jumpy.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/alacritty/alacritty.toml`,
        },
        {
          kind: "code",
          language: "toml",
          code: `[scrolling]
history = 10000
multiplier = 2`,
        },
        {
          kind: "text",
          bullets: [
            "Use multiplier = 1 for slower terminal scrolling.",
            "Use multiplier = 2 or 3 for faster terminal scrolling.",
            "In Firefox, check general.smoothScroll and apz.gtk.kinetic_scroll.enabled in about:config.",
            "Firefox settings are app-level browser settings, not system-wide touchpad settings.",
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
            "Persistent Xorg touchpad config: /etc/X11/xorg.conf.d/30-touchpad.conf",
            "Alacritty config: ~/.config/alacritty/alacritty.toml",
            "Touchpad inspection tool: xinput",
            "Xorg libinput driver package: xf86-input-libinput",
          ],
        },
      ],
    },
  ],
}

export default entry

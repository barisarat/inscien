import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "x11-dpms-control",
  kind: "codenote",
  name: "X11 Screen Blanking and DPMS Control",
  desc: "Disable X11 screen blanking and DPMS display sleep to test idle display wake freezes.",
  intro:
    "Disable X11 screen blanking and DPMS display sleep to test whether idle display power management triggers wake-related freezes on an Nvidia display path. This controls X11 screen blanking and monitor power signaling for the current graphical session. It does not control system suspend, hibernate, lid-close behavior, power button behavior, kernel GPU driver behavior, or monitor hardware settings directly.",
  sections: [
    {
      title: "What DPMS means",
      blocks: [
        {
          kind: "text",
          text: [
            "DPMS means Display Power Management Signaling. It is an X11 display power feature where the computer tells the monitor to enter standby, suspend, off, or wake states after idle time.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Example DPMS state from xset q:
# DPMS (Display Power Management Signaling):
#   Standby: 600    Suspend: 600    Off: 600
#   DPMS is Enabled
#
# Meaning:
# After 600 seconds, or 10 minutes, X11 can put the display into a low-power/off state.`,
        },
      ],
    },
    {
      title: "Install xset on Arch",
      blocks: [
        {
          kind: "text",
          text: [
            "The xset command is provided by the xorg-xset package. Install it first if the command is missing.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xset q

# Expected error when xset is missing:
# bash: xset: command not found

sudo pacman -S xorg-xset`,
        },
      ],
    },
    {
      title: "Check current X11 display power state",
      blocks: [
        {
          kind: "text",
          text: [
            "Use xset q from the active X11 session to inspect screen saver blanking and DPMS state.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xset q

# Check these sections in the output:
# Screen Saver:
#   timeout:  <seconds>
#   cycle:    <seconds>
#
# DPMS (Display Power Management Signaling):
#   Standby: <seconds>    Suspend: <seconds>    Off: <seconds>
#   DPMS is Enabled`,
        },
      ],
    },
    {
      title: "Disable screen blanking and DPMS",
      blocks: [
        {
          kind: "text",
          text: [
            "Disable X11 screen saver blanking and DPMS display sleep for the current graphical session.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xset s off
xset -dpms
xset s noblank

# Meaning:
# xset s off disables the X11 screen saver timeout.
# xset -dpms disables DPMS display power management.
# xset s noblank prevents X11 from blanking the screen.`,
        },
      ],
    },
    {
      title: "Verify the disabled state",
      blocks: [
        {
          kind: "text",
          text: [
            "Run xset q again and confirm that DPMS is disabled and screen blanking is not active.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xset q

# Expected DPMS result:
# DPMS (Display Power Management Signaling):
#   DPMS is Disabled
#
# Expected screen saver result:
# Screen Saver:
#   prefer blanking:  no
#   timeout:  0`,
        },
      ],
    },
    {
      title: "Make it persistent in i3",
      blocks: [
        {
          kind: "text",
          text: [
            "The xset commands only affect the current X11 session. Add them to the i3 config if the same display blanking and DPMS settings should apply automatically after login.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.config/i3/config`,
        },
        {
          kind: "text",
          text: [
            "Add these lines near the other startup commands.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `exec --no-startup-id xset s off
exec --no-startup-id xset -dpms
exec --no-startup-id xset s noblank

# Meaning:
# These commands run automatically when i3 starts.
# They disable X11 screen saver timeout.
# They disable DPMS display sleep.
# They prevent X11 screen blanking.`,
        },
        {
          kind: "text",
          text: [
            "Reload i3 and verify the active state.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3-msg reload
i3-msg restart
xset q

# Expected DPMS result:
# DPMS (Display Power Management Signaling):
#   DPMS is Disabled
#
# Expected screen saver result:
# Screen Saver:
#   prefer blanking:  no
#   timeout:  0`,
        },
      ],
    },
    {
      title: "Re-enable DPMS if needed",
      blocks: [
        {
          kind: "text",
          text: [
            "Re-enable DPMS and set normal idle timings if you want X11 to control display sleep again.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xset +dpms
xset dpms 600 600 600
xset s 600 600

# Meaning:
# Re-enable DPMS.
# Set standby, suspend, and off timers to 600 seconds.
# Set X11 screen saver timeout and cycle to 600 seconds.`,
        },
      ],
    },
    {
      title: "Reusable command set",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this compact set when xset is already installed and the goal is to disable X11 display blanking and DPMS for the current session. For persistent i3 setup, use the i3 config section above.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xset q
xset s off
xset -dpms
xset s noblank
xset q`,
        },
      ],
    },
  ],
}

export default entry
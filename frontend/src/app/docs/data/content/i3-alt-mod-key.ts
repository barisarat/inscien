import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-alt-mod-key",
  kind: "codenote",
  name: "i3 Alt Mod Key on Arch",
  desc: "Switch i3 from the Super key to the Alt key on Arch by changing the i3 mod setting, fixing the X modifier map, loading Xmodmap from i3, and verifying the setup after reboot.",
  intro:
    "Switch i3 from Super to Alt on Arch. This workflow changes i3 from Mod4 to Mod1, fixes the X modifier map so Alt_L belongs to mod1, keeps Super_L under mod4, loads the mapping automatically when i3 starts, and verifies the setup after reboot.",
  resources: [
    {
      label: "i3 base setup",
      href: "/docs/i3-arch-setup",
    },
  ],
  sections: [
    {
      title: "Target state",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Alt as the i3 modifier key instead of Super. In i3, Mod1 maps to Alt and Mod4 maps to Super. The final setup should keep Alt_L under mod1 and Super_L under mod4.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `set $mod Mod1`,
        },
        {
          kind: "text",
          bullets: [
            "Mod1 is the Alt modifier group.",
            "Mod4 is the Super or Windows key modifier group.",
            "i3 reads $mod from ~/.config/i3/config.",
            "X11 decides which physical keys belong to mod1 and mod4.",
            "Changing only the i3 config is not enough if Alt_L is still mapped under mod4.",
          ],
        },
      ],
    },
    {
      title: "Check the current i3 mod setting",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the i3 config and check the active mod line.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -n "set \\$mod" ~/.config/i3/config`,
        },
        {
          kind: "text",
          text: [
            "A Super based setup usually shows Mod4.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `set $mod Mod4`,
        },
        {
          kind: "text",
          text: [
            "An Alt based setup should use Mod1.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `set $mod Mod1`,
        },
      ],
    },
    {
      title: "Change i3 from Super to Alt",
      blocks: [
        {
          kind: "text",
          text: [
            "Edit the i3 config and change the mod line from Mod4 to Mod1.",
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
            "Use this line:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `set $mod Mod1`,
        },
        {
          kind: "text",
          bullets: [
            "Do not replace all keybindings manually if they already use $mod.",
            "Bindings such as $mod+Return, $mod+d, and $mod+Shift+r will automatically move from Super to Alt.",
            "Only hardcoded Mod4 bindings need to be changed manually.",
          ],
        },
      ],
    },
    {
      title: "Check for hardcoded Super bindings",
      blocks: [
        {
          kind: "text",
          text: [
            "Search for direct Mod4, Super_L, Mod1, or Alt_L references. A clean config should mostly use $mod instead of hardcoded Mod4.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -n "Mod4\\|Super_L\\|Mod1\\|Alt_L" ~/.config/i3/config`,
        },
        {
          kind: "text",
          bullets: [
            "The expected required line is set $mod Mod1.",
            "Replace hardcoded Mod4 keybindings with $mod unless there is a specific reason to keep Super for that shortcut.",
            "Do not remove normal $mod bindings.",
          ],
        },
      ],
    },
    {
      title: "Check the X modifier map",
      blocks: [
        {
          kind: "text",
          text: [
            "Check which physical keys X11 currently assigns to each modifier group.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xmodmap -pm`,
        },
        {
          kind: "text",
          text: [
            "A broken mixed state can look like this. In this state, i3 listens to Mod1, but the physical left Alt key is still under mod4.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mod1        Alt_R, Meta_L
mod4        Alt_L, Super_L, Super_R`,
        },
        {
          kind: "text",
          text: [
            "The correct state should look like this.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mod1        Alt_L, Alt_R, Meta_L
mod4        Super_L, Super_R`,
        },
        {
          kind: "text",
          bullets: [
            "Alt_L must be under mod1.",
            "Super_L should stay under mod4.",
            "If Alt_L is under mod4, Alt based i3 shortcuts will not work correctly.",
          ],
        },
      ],
    },
    {
      title: "Create the Xmodmap fix",
      blocks: [
        {
          kind: "text",
          text: [
            "Create ~/.Xmodmap to move Alt_L and Alt_R to mod1 and keep Super_L and Super_R under mod4.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat > ~/.Xmodmap <<'EOF'
clear mod1
clear mod4

add mod1 = Alt_L Alt_R Meta_L
add mod4 = Super_L Super_R
EOF`,
        },
        {
          kind: "text",
          text: [
            "Apply the mapping immediately.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xmodmap ~/.Xmodmap`,
        },
        {
          kind: "text",
          text: [
            "Verify the result.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xmodmap -pm`,
        },
        {
          kind: "text",
          bullets: [
            "Alt_L should now appear under mod1.",
            "Super_L should now appear under mod4.",
            "Seeing Alt_L twice is usually harmless if the key works and Alt_L is under mod1.",
          ],
        },
      ],
    },
    {
      title: "Load Xmodmap from i3",
      blocks: [
        {
          kind: "text",
          text: [
            "Add the Xmodmap load command to the i3 config so the mapping is applied automatically when i3 starts.",
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
            "Add this line near the other startup commands.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `exec --no-startup-id xmodmap ~/.Xmodmap`,
        },
        {
          kind: "text",
          bullets: [
            "This applies the Alt and Super modifier mapping when i3 starts.",
            "The mapping is applied after login, not on the display manager login screen.",
            "This is enough for i3 keyboard shortcuts after login.",
          ],
        },
      ],
    },
    {
      title: "Reload and restart i3",
      blocks: [
        {
          kind: "text",
          text: [
            "Reload the config first. If the shortcut is not working yet, run the command from an existing terminal.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3-msg reload
i3-msg restart`,
        },
        {
          kind: "text",
          text: [
            "Test the common i3 shortcuts with Alt.",
          ],
        },
        {
          kind: "table",
          headers: ["Shortcut", "Expected action"],
          rows: [
            ["Alt+Enter", "Open terminal"],
            ["Alt+d", "Open the configured launcher if bound"],
            ["Alt+Space", "Open Rofi app launcher if this setup uses Mod+Space"],
            ["Alt+Tab", "Open Rofi window switcher if this setup uses Mod+Tab"],
            ["Alt+Shift+r", "Reload i3 config"],
          ],
        },
      ],
    },
        {
      title: "Disable Firefox Alt menu focus",
      blocks: [
        {
          kind: "text",
          text: [
            "When i3 uses Left Alt as the Mod1 key, Firefox can still capture a plain Alt press and show or focus the top menu bar. Disable this inside Firefox so Alt based i3 shortcuts do not visually trigger the Firefox menu.",
          ],
        },
        {
          kind: "text",
          text: [
            "Open Firefox and go to about:config. Search for this preference and set it to false.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ui.key.menuAccessKeyFocuses = false`,
        },
        {
          kind: "text",
          text: [
            "If Alt combinations still interfere with Firefox menu access, also search for this preference and set it to 0.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ui.key.menuAccessKey = 0`,
        },
        {
          kind: "text",
          bullets: [
            "This is a Firefox specific setting.",
            "It does not change the i3 config.",
            "It prevents Firefox from showing or focusing the top menu when Left Alt is used as the i3 modifier key.",
            "Restart Firefox after changing the preferences.",
          ],
        },
      ],
    },
    {
      title: "Verify after reboot",
      blocks: [
        {
          kind: "text",
          text: [
            "Reboot and verify that the modifier map survives a fresh login.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xmodmap -pm`,
        },
        {
          kind: "text",
          text: [
            "The important lines should show Alt under mod1 and Super under mod4.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mod1        Alt_L, Alt_R, Meta_L
mod4        Super_L, Super_R`,
        },
        {
          kind: "text",
          bullets: [
            "If Alt_L is under mod1 after reboot, the setup is persistent.",
            "If Alt_L returns to mod4 after reboot, check that the xmodmap startup line exists in ~/.config/i3/config.",
            "If the i3 shortcuts still do not work, check whether the keybindings use $mod or hardcoded Mod4.",
          ],
        },
      ],
    },
    {
      title: "Final config summary",
      blocks: [
        {
          kind: "text",
          text: [
            "The final setup has one i3 config change and one Xmodmap file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -n "set \\$mod\\|xmodmap\\|Xmodmap" ~/.config/i3/config`,
        },
        {
          kind: "text",
          text: [
            "Expected i3 config lines:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `set $mod Mod1
exec --no-startup-id xmodmap ~/.Xmodmap`,
        },
        {
          kind: "text",
          text: [
            "Expected ~/.Xmodmap content:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `clear mod1
clear mod4

add mod1 = Alt_L Alt_R Meta_L
add mod4 = Super_L Super_R`,
        },
      ],
    },
    {
      title: "Debug commands",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `grep -n "set \\$mod" ~/.config/i3/config

grep -n "Mod4\\|Super_L\\|Mod1\\|Alt_L" ~/.config/i3/config

grep -n "xmodmap\\|Xmodmap" ~/.config/i3/config

cat ~/.Xmodmap

xmodmap -pm

xev`,
        },
        {
          kind: "text",
          bullets: [
            "Use grep on set $mod to confirm i3 is using Mod1.",
            "Use the Mod4 and Alt search to find hardcoded keybindings.",
            "Use the xmodmap search to confirm i3 loads ~/.Xmodmap.",
            "Use cat ~/.Xmodmap to confirm the saved mapping file.",
            "Use xmodmap -pm to confirm the live modifier state.",
            "Use xev if the physical key does not report as Alt_L.",
          ],
        },
      ],
    },
    {
      title: "Config file locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "i3 window manager config: ~/.config/i3/config",
            "X modifier mapping file: ~/.Xmodmap",
            "The i3 mod line controls which modifier group i3 uses.",
            "The Xmodmap file controls which physical keys belong to mod1 and mod4.",
            "Use Mod1 for Alt based i3 shortcuts.",
            "Use Mod4 for Super based i3 shortcuts.",
          ],
        },
      ],
    },
  ],
}

export default entry
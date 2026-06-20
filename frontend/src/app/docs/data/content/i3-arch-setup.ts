import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-arch-setup",
  kind: "codenote",
  name: "i3 Base Setup and Styling on Arch",
  desc: "Configure the core i3 desktop on Arch with Alacritty, Starship, Fastfetch, Picom, image wallpaper, screen layout shortcuts, clean i3status bar, and base shortcuts.",
  intro:
    "Configure the core i3 desktop on Arch. This base workflow covers the i3 package install, first i3 login, Alacritty as the default Mod+Enter terminal, Starship prompt, Fastfetch terminal banner, OS age command, image wallpaper, Picom compositor support, subtle tiled window gaps, thin borders, calm focused window colors, the top i3status bar, screen layout shortcuts, base keybindings, and config checks. Login manager setup, lid behavior, sound, ASUS controls, dev mode, display power helpers, screenshots, and the actual screen layout profile script definitions are kept in separate focused notes.",
  resources: [
    {
      label: "i3 screen layout profiles",
      href: "/docs/i3-screen-layout-profiles",
    },
  ],
  sections: [
{
  title: "Install base packages",
  blocks: [
    {
      kind: "text",
      text: [
        "Install the base packages for i3, Alacritty, Starship, Fastfetch, Rofi, Picom, i3status, image wallpaper, basic display sleep control, and Meslo Nerd Font.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `sudo pacman -S i3-wm alacritty starship fastfetch rofi picom i3status feh xorg-xset ttf-meslo-nerd`,
    },
    {
      kind: "text",
      bullets: [
        "i3-wm provides the window manager.",
        "Alacritty provides the default terminal emulator used by Mod+Enter.",
        "Starship provides the shell prompt.",
        "Fastfetch provides the terminal startup banner.",
        "Rofi provides the app launcher and open-window switcher.",
        "Picom provides Alacritty transparency and rounded window corners through the X11 compositor layer.",
        "i3status provides the status bar content.",
        "feh sets the image wallpaper on the X11 root window.",
        "xorg-xset is useful for display sleep and DPMS checks.",
        "ttf-meslo-nerd provides the MesloLGS Nerd Font used by i3, Alacritty, Rofi, and VS Code.",
      ],
    },
  ],
},
    {
      title: "Place the wallpaper image",
      blocks: [
        {
          kind: "text",
          text: [
            "Place the wallpaper image at ~/.config/wallpaper.jpg before reloading i3. feh supports JPG, PNG, and most common image formats, but the i3 config below expects this exact path.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.config
ls -lh ~/.config/wallpaper.jpg`,
        },
      ],
    },
    {
      title: "First login to i3",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Log in to the i3 session from the selected display manager.",
            "On first i3 login, accept the prompt to generate a default config if one does not already exist.",
            "When asked, choose Super as the Mod key.",
            "Use the separate ly login setup note when configuring ly as the display manager.",
          ],
        },
      ],
    },
    {
  title: "Core i3 config",
  blocks: [
    {
      kind: "text",
      text: [
        "Add the main i3 visual and workspace configuration. This block sets the laptop-only layout at startup, starts Picom for transparency and rounded corners, sets the wallpaper with feh, pins the first three workspaces to the primary output, forces selected apps to tile, configures screen layout shortcuts, sets Alacritty as the terminal, uses Rofi for app launching and open-window switching, and applies subtle gaps, thin borders, calm window colors, and Meslo font styling.",
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
      code: `font pango:MesloLGS Nerd Font 10
focus_follows_mouse no
mouse_warping none

exec --no-startup-id ~/.screenlayout/laptop-only.sh
# exec_always --no-startup-id xsetroot -solid "#0b0f14"
exec_always --no-startup-id feh --bg-fill ~/.config/wallpaper.jpg
exec_always --no-startup-id picom --config ~/.config/picom/picom.conf

workspace 1 output primary
workspace 2 output primary
workspace 3 output primary

for_window [class="Upwork"] floating disable

bindsym $mod+Control+1 exec --no-startup-id ~/.screenlayout/laptop-only.sh
bindsym $mod+Control+2 exec --no-startup-id ~/.screenlayout/external-1k-only.sh
bindsym $mod+Control+3 exec --no-startup-id ~/.screenlayout/external-2k-only.sh
bindsym $mod+Control+4 exec --no-startup-id ~/.screenlayout/mirror-1k.sh

set $term alacritty
bindsym $mod+Return exec $term

bindsym $mod+space exec rofi -show drun
bindsym $mod+Tab exec rofi -show window

# Window gaps
gaps inner 6
gaps outer 2

# Remove outer gaps when only one window is visible
smart_gaps on

# Window borders
default_border pixel 1
default_floating_border pixel 1

# Window colors
client.focused          #3a3a3a #3a3a3a #ffffff #3a3a3a #3a3a3a
client.focused_inactive #2a2a2a #2a2a2a #d4d4d4 #2a2a2a #2a2a2a
client.unfocused        #1e1e1e #1e1e1e #a0a0a0 #1e1e1e #1e1e1e
client.urgent           #c75c5c #c75c5c #ffffff #c75c5c #c75c5c`,
    },
    {
      kind: "text",
      bullets: [
        "The font line applies MesloLGS Nerd Font to i3 workspace labels, title text, binding mode text, and i3bar text.",
        "focus_follows_mouse no keeps pointer hover from changing the focused window.",
        "mouse_warping none stops i3 from moving the pointer when focus changes.",
        "The laptop-only script applies the default laptop display layout when i3 starts.",
        "The old xsetroot line is commented out because feh now controls the root window wallpaper.",
        "The feh line sets ~/.config/wallpaper.jpg as a filled wallpaper on every i3 start or reload.",
        "Do not keep both xsetroot and feh active for the background because both write to the root window.",
        "The Picom startup line enables Alacritty transparency and rounded corners after each i3 start.",
        "Workspace 1, 2, and 3 are assigned to the primary output.",
        "The Upwork rule disables floating behavior for the Upwork window.",
        "Mod+Control+1 through Mod+Control+4 switch between saved screen layout scripts.",
        "The actual screen layout script contents are documented in the linked i3 screen layout profiles note.",
        "set $term alacritty defines the terminal used by Mod+Enter.",
        "Mod+Space opens the Rofi desktop app launcher with drun mode.",
        "Mod+Tab opens the Rofi open-window switcher.",
        "gaps inner 6 adds a small space between tiled windows.",
        "gaps outer 2 adds a small space around the workspace edge.",
        "smart_gaps on removes the outer gap when only one window is visible.",
        "default_border pixel 1 keeps tiled window borders thin.",
        "default_floating_border pixel 1 keeps floating window borders thin.",
        "client.focused replaces the default bright focused window color with a calmer gray.",
      ],
    },
    {
      kind: "text",
      text: [
        "After editing the config, reload i3. If i3 reports duplicate keybindings, search for the conflicting bindsym line and keep only one binding for that key combination.",
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
      title: "Use Alacritty for Mod+Enter",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Alacritty as the default i3 terminal. The generated i3 config may already include a Mod+Enter binding that calls i3-sensible-terminal. Comment that generated line before adding the Alacritty binding, otherwise i3 can report a duplicate keybinding.",
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
            "Comment the generated default terminal binding if it exists.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# start a terminal
# bindsym $mod+Return exec i3-sensible-terminal`,
        },
        {
          kind: "text",
          text: [
            "Add the Alacritty terminal variable and binding. Keeping it at the end of the config is fine as long as there is no other active Mod+Return binding.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `set $term alacritty
bindsym $mod+Return exec $term`,
        },
        {
          kind: "text",
          text: [
            "Reload i3, open a new terminal with Mod+Enter, then check the parent process from inside that terminal.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3-msg reload

ps -p $PPID -o comm=`,
        },
        {
          kind: "text",
          bullets: [
            "Expected output is alacritty.",
            "If the output is konsole or another terminal, another binding or launcher is still opening that terminal.",
            "This Mod+Enter change does not automatically update separate scripts such as dev-mode if those scripts hardcode a terminal command.",
          ],
        },
      ],
    },
    {
      title: "Create the OS age command",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a small command that estimates the age of the Arch install from the first pacman log entry. Fastfetch uses this command for the OS Age line.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.local/bin
nano ~/.local/bin/os-age`,
        },
        {
          kind: "code",
          language: "bash",
          code: `#!/bin/bash

first="$(head -n 1 /var/log/pacman.log | sed -E 's/^\\[([^]]+)\\].*/\\1/')"
first_epoch="$(date -d "$first" +%s)"
now_epoch="$(date +%s)"
days="$(( (now_epoch - first_epoch) / 86400 ))"

echo "$days days"`,
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod +x ~/.local/bin/os-age
~/.local/bin/os-age`,
        },
      ],
    },
    {
      title: "Configure Fastfetch",
      blocks: [
        {
          kind: "text",
          text: [
            "Fastfetch shows the system banner when the terminal opens. The OS Age module uses the full script path so it works reliably at shell startup.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.config/fastfetch
nano ~/.config/fastfetch/config.jsonc`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "$schema": "https://github.com/fastfetch-cli/fastfetch/raw/dev/doc/json_schema.json",

  "logo": {
    "type": "builtin",
    "source": "arch",
    "padding": {
      "right": 2
    }
  },

  "display": {
    "separator": "  "
  },

  "modules": [
    "title",
    "separator",
    "os",
    {
      "type": "command",
      "key": "OS Age",
      "text": "/home/baris/.local/bin/os-age"
    },
    "uptime",
    "kernel",
    "shell",
    "wm",
    "terminal",
    "cpu",
    "gpu",
    "memory",
    {
      "type": "disk",
      "folders": [
        "/"
      ]
    }
  ]
}`,
        },
        {
          kind: "code",
          language: "bash",
          code: `fastfetch`,
        },
      ],
    },
    {
      title: "Configure Starship",
      blocks: [
        {
          kind: "text",
          text: [
            "Starship is the shell prompt. The gcloud module is disabled so saved Google Cloud accounts do not appear in the prompt.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.config
nano ~/.config/starship.toml`,
        },
        {
          kind: "code",
          language: "toml",
          code: `add_newline = true

[gcloud]
disabled = true

[character]
success_symbol = "[❯](bold green)"
error_symbol = "[❯](bold red)"

[directory]
truncation_length = 3
truncate_to_repo = true`,
        },
        {
          kind: "text",
          text: [
            "Enable Starship in Bash only if it is not already enabled.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -q 'starship init bash' ~/.bashrc || cat >> ~/.bashrc <<'EOF'

eval "$(starship init bash)"
EOF`,
        },
      ],
    },
    {
      title: "Run Fastfetch when Bash opens",
      blocks: [
        {
          kind: "text",
          text: [
            "Add ~/.local/bin to PATH before running Fastfetch so local commands are available. Fastfetch should run before Starship draws the prompt.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -q 'export PATH="$HOME/.local/bin:$PATH"' ~/.bashrc || cat >> ~/.bashrc <<'EOF'

export PATH="$HOME/.local/bin:$PATH"
EOF

grep -q 'command -v fastfetch' ~/.bashrc || cat >> ~/.bashrc <<'EOF'

if [[ $- == *i* ]]
then
  command -v fastfetch >/dev/null && fastfetch
fi
EOF`,
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -n 'starship init bash' ~/.bashrc
grep -n 'fastfetch' ~/.bashrc
grep -n '.local/bin' ~/.bashrc`,
        },
      ],
    },
    {
      title: "Check final Bash order",
      blocks: [
        {
          kind: "text",
          text: [
            "If needed, manually edit ~/.bashrc and keep this order near the bottom.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.bashrc`,
        },
        {
          kind: "code",
          language: "bash",
          code: `export PATH="$HOME/.local/bin:$PATH"

if [[ $- == *i* ]]
then
  command -v fastfetch >/dev/null && fastfetch
fi

eval "$(starship init bash)"`,
        },
      ],
    },
    {
  title: "Configure Alacritty",
  blocks: [
    {
      kind: "text",
      text: [
        "Alacritty uses a file-based config. This setup uses MesloLGS Nerd Font, a dark background color, and slight transparency. Opacity requires Picom or another compositor, and existing Alacritty windows may need to be closed and reopened.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `mkdir -p ~/.config/alacritty
nano ~/.config/alacritty/alacritty.toml`,
    },
    {
      kind: "text",
      text: ["Paste the following:"],
    },
    {
      kind: "code",
      language: "toml",
      code: `[window]
padding = { x = 8, y = 8 }
dynamic_padding = false
opacity = 0.80

[font]
size = 11.5

[font.normal]
family = "MesloLGS Nerd Font"
style = "Regular"

[font.bold]
family = "MesloLGS Nerd Font"
style = "Bold"

[font.italic]
family = "MesloLGS Nerd Font"
style = "Italic"

[font.bold_italic]
family = "MesloLGS Nerd Font"
style = "Bold Italic"

[colors.primary]
background = "#0b0f14"
foreground = "#d8dee9"

[scrolling]
history = 10000
multiplier = 3

[selection]
save_to_clipboard = true

[cursor]
style = { shape = "Block", blinking = "Off" }
unfocused_hollow = true

[mouse]
hide_when_typing = true`,
    },
    {
      kind: "text",
      bullets: [
        "Window padding gives terminal text a small margin so it does not touch the edge.",
        "MesloLGS Nerd Font gives the terminal a consistent developer font with Nerd Font glyph support.",
        "opacity = 0.80 makes Alacritty more transparent when Picom is running.",
        "The primary background color remains dark behind the transparent terminal.",
        "Scrollback history is set to 10000 lines for logs and command output.",
        "save_to_clipboard copies selected text to the clipboard automatically.",
        "The block cursor keeps the terminal visually clear in a keyboard-driven i3 setup.",
        "hide_when_typing removes mouse cursor distraction while typing.",
      ],
    },
    {
      kind: "text",
      text: [
        "Check font resolution, then restart Alacritty windows after changing the config. Existing Alacritty windows may not reflect every setting until reopened.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `fc-match "MesloLGS Nerd Font"`,
    },
  ],
},
    {
      title: "Replace the default bar block",
      blocks: [
        {
          kind: "text",
          text: [
            "The generated config includes a minimal bar { status_command i3status } block. Replace it with the thin native i3bar version below. There must be only one bar block. Do not nest it. Bar transparency is handled by Picom, so the i3bar background color uses plain hex without an alpha byte.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `bar {
    status_command i3status --config ~/.config/i3status/config
    position top
    tray_output none
    tray_padding 0
    font pango:MesloLGS Nerd Font 8

    separator_symbol " "
    workspace_min_width 20
    strip_workspace_numbers no
    binding_mode_indicator yes

    colors {
        background #121216
        statusline #d4d4d4
        separator  #121216

        focused_workspace  #3a3a3a #3a3a3a #ffffff
        active_workspace   #242428 #242428 #d4d4d4
        inactive_workspace #121216 #121216 #909090
        urgent_workspace   #c75c5c #c75c5c #ffffff
        binding_mode       #4a4a4a #4a4a4a #ffffff
    }
}`,
        },
        {
          kind: "text",
          bullets: [
            "status_command points i3bar at the explicit i3status config file.",
            "position top keeps the bar at the top of the screen.",
            "tray_output none hides the tray for a thinner status bar.",
            "font pango:MesloLGS Nerd Font 8 keeps the bar compact.",
            "workspace_min_width 20 keeps workspace labels narrow.",
            "The workspace colors use a darker native i3bar palette.",
            "Picom controls bar opacity with an opacity rule, not the i3bar background color.",
            "The urgent workspace color is muted red instead of the default bright warning style.",
          ],
        },
      ],
    },
    {
      title: "Configure i3status",
      blocks: [
        {
          kind: "text",
          text: [
            "i3status has its own config file, separate from the i3 window manager config. Put tztime, battery, memory, and similar blocks here, not in ~/.config/i3/config.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.config/i3status
nano ~/.config/i3status/config`,
        },
        {
          kind: "text",
          text: ["Paste the following:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `general {
    colors = false
    interval = 5
}

order += "wireless _first_"
order += "battery all"
order += "memory"
order += "tztime local"

wireless _first_ {
    format_up = "WiFi"
    format_down = "WiFi down"
}

battery all {
    format = "BAT %percentage"
    integer_battery_capacity = true
    format_down = ""
    status_chr = "CHR"
    status_bat = "BAT"
    status_full = "FULL"
    status_unk = "BAT"
}

memory {
    format = "RAM %used"
}

tztime local {
    format = "%a %d %b  %H:%M"
}`,
        },
        {
          kind: "text",
          bullets: [
            "colors = false removes the default green WiFi text for a calmer look.",
            "integer_battery_capacity = true makes the battery display show a whole-number percentage.",
            "The battery labels are shortened so the top bar stays compact.",
            "RAM uses %used because plain i3status does not provide a simple integer GiB option for memory.",
            "The date uses abbreviated weekday and month text to keep the bar readable.",
            "Local IP and disk blocks are intentionally omitted; add back if needed.",
          ],
        },
      ],
    },
    {
  title: "Configure Picom rounded corners",
  blocks: [
    {
      kind: "text",
      text: [
        "Picom is the compositor layer used for Alacritty transparency, i3bar transparency, and rounded corners on X11/i3. i3 handles layout, gaps, borders, and focus colors. Picom handles opacity, visual corner rounding, and compositor timing. This setup uses the GLX backend, enables vsync, makes the whole i3bar 60% opaque, keeps shadows disabled, and disables fading so transitions stay immediate.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `mkdir -p ~/.config/picom
nano ~/.config/picom/picom.conf`,
    },
    {
      kind: "text",
      text: ["Paste the following:"],
    },
    {
      kind: "code",
      language: "bash",
      code: `backend = "glx";
vsync = true;

corner-radius = 10;

rounded-corners-exclude = [
  "window_type = 'dock'",
  "window_type = 'desktop'"
];

opacity-rule = [
  "60:class_g = 'i3bar'"
];

shadow = false;
fading = false;`,
    },
    {
      kind: "text",
      bullets: [
        "backend = glx enables the GLX rendering backend.",
        "vsync = true keeps the compositor synchronized with display refresh.",
        "corner-radius = 10 gives visible but still restrained rounded corners.",
        "Dock and desktop windows are excluded from corner rounding.",
        "opacity-rule makes the whole i3bar 60% opaque, including the background and text.",
        "The alpha byte in the i3bar background color is intentionally not used because Picom controls bar transparency.",
        "Picom must be running for Alacritty opacity to appear.",
        "shadow = false keeps the setup clean and avoids extra visual effects.",
        "fading = false avoids slow open and close transitions.",
      ],
    },
    {
      kind: "text",
      text: ["Test Picom manually before relying on the i3 startup line."],
    },
    {
      kind: "code",
      language: "bash",
      code: `pkill picom
picom --config ~/.config/picom/picom.conf &`,
    },
    {
      kind: "text",
      text: [
        "After the manual test works, keep the Picom startup line in ~/.config/i3/config so rounded corners load after login.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `exec_always --no-startup-id picom --config ~/.config/picom/picom.conf`,
    },
  ],
},
    {
      title: "Keep i3 startup lines",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep these lines in ~/.config/i3/config. They set the wallpaper, start Picom automatically, and keep Alacritty as the default terminal.",
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
          code: `# exec_always --no-startup-id xsetroot -solid "#0b0f14"
exec_always --no-startup-id feh --bg-fill ~/.config/wallpaper.jpg
exec_always --no-startup-id picom --config ~/.config/picom/picom.conf

set $term alacritty
bindsym $mod+Return exec $term`,
        },
      ],
    },
    {
      title: "Reload and test",
      blocks: [
        {
          kind: "text",
          text: [
            "Reload the shell and i3 after editing the terminal, compositor, and i3 config files. Stop Picom before the i3 reload so the exec_always line starts it again with the updated config. Close and reopen Alacritty after changing Alacritty window settings.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `source ~/.bashrc
pkill picom
i3-msg reload

fastfetch
starship explain`,
        },
        {
          kind: "text",
          bullets: [
            "A new Alacritty window should show the Fastfetch banner.",
            "Fastfetch should include the OS Age line.",
            "The prompt should use Starship.",
            "The wallpaper should fill the desktop background.",
            "The Alacritty background should be more transparent when Picom is running.",
            "The i3bar should be translucent as a whole when Picom restarts.",
          ],
        },
      ],
    },
    {
      title: "Screen layout shortcuts",
      blocks: [
        {
          kind: "text",
          text: [
            "The screen layout shortcuts call saved scripts under ~/.screenlayout. Keep the actual xrandr commands inside those scripts and keep this base i3 config limited to launching them.",
            "Use the linked i3 screen layout profiles note for the script definitions and display profile details.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `exec --no-startup-id ~/.screenlayout/laptop-only.sh

workspace 1 output primary
workspace 2 output primary
workspace 3 output primary

bindsym $mod+Control+1 exec --no-startup-id ~/.screenlayout/laptop-only.sh
bindsym $mod+Control+2 exec --no-startup-id ~/.screenlayout/external-1k-only.sh
bindsym $mod+Control+3 exec --no-startup-id ~/.screenlayout/external-2k-only.sh
bindsym $mod+Control+4 exec --no-startup-id ~/.screenlayout/mirror-1k.sh`,
        },
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Mod+Control+1", "Use laptop display only"],
            ["Mod+Control+2", "Use external 1K display only"],
            ["Mod+Control+3", "Use external 2K display only"],
            ["Mod+Control+4", "Mirror to external 1K layout"],
          ],
        },
      ],
    },
    {
      title: "Force a specific app to tile",
      blocks: [
        {
          kind: "text",
          text: [
            "Some apps default to floating windows. Identify the window class with xprop and add a for_window rule. Upwork is configured here as a real rule, and Example is kept as a template for future app rules.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `for_window [class="Upwork"] floating disable`,
        },
        {
          kind: "code",
          language: "bash",
          code: `xprop | grep WM_CLASS
# Click the target window. Output looks like: WM_CLASS(STRING) = "example", "Example"`,
        },
        {
          kind: "text",
          text: ["Add a new app rule to ~/.config/i3/config and reload:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `for_window [class="Example"] floating disable`,
        },
      ],
    },
    {
  title: "Configure Rofi launcher",
  blocks: [
    {
      kind: "text",
      text: [
        "Rofi replaces the old dmenu launcher flow with a themed app launcher and open-window switcher. Mod+Space opens drun mode for desktop applications, and Mod+Tab opens window mode for switching between already-open windows.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `mkdir -p ~/.config/rofi
nano ~/.config/rofi/config.rasi`,
    },
    {
      kind: "text",
      text: ["Paste the following:"],
    },
    {
      kind: "code",
      language: "bash",
      code: `configuration {
    modi: "drun,run,window";
    show-icons: true;
    icon-theme: "Papirus";
    font: "MesloLGS Nerd Font 10";
    terminal: "alacritty";
    drun-display-format: "{name}";
    location: 0;
    disable-history: false;
    hide-scrollbar: true;
    display-drun: "Apps";
    display-run: "Run";
    display-window: "Windows";
}

@theme "~/.config/rofi/i3-dark.rasi"`,
    },
    {
      kind: "code",
      language: "bash",
      code: `nano ~/.config/rofi/i3-dark.rasi`,
    },
    {
      kind: "text",
      text: ["Paste the following:"],
    },
    {
      kind: "code",
      language: "bash",
      code: `* {
    font: "MesloLGS Nerd Font 10";

    background: #1e1e1e;
    background-alt: #2a2a2a;
    foreground: #d4d4d4;
    foreground-strong: #ffffff;
    muted: #a0a0a0;
    selected: #3a3a3a;
    urgent: #c75c5c;
    border: #3a3a3a;
}

window {
    width: 36%;
    background-color: @background;
    border: 1px;
    border-color: @border;
    border-radius: 10px;
    padding: 12px;
}

mainbox {
    background-color: @background;
    spacing: 10px;
    padding: 0;
}

inputbar {
    background-color: @background-alt;
    text-color: @foreground-strong;
    border-radius: 8px;
    padding: 10px 12px;
    spacing: 8px;
    children: [ prompt, entry ];
}

prompt {
    background-color: @background-alt;
    text-color: @muted;
}

entry {
    background-color: @background-alt;
    text-color: @foreground-strong;
    placeholder: "Search";
    placeholder-color: @muted;
}

case-indicator {
    background-color: @background-alt;
    text-color: @muted;
}

listview {
    background-color: @background;
    columns: 1;
    lines: 8;
    spacing: 6px;
    fixed-height: false;
    scrollbar: false;
}

element {
    background-color: transparent;
    text-color: @foreground;
    border-radius: 8px;
    padding: 8px 10px;
    spacing: 10px;
}

element normal.normal {
    background-color: transparent;
    text-color: @foreground;
}

element selected.normal {
    background-color: @selected;
    text-color: @foreground-strong;
}

element alternate.normal {
    background-color: transparent;
    text-color: @foreground;
}

element urgent.normal {
    background-color: @urgent;
    text-color: @foreground-strong;
}

element active.normal {
    background-color: @background-alt;
    text-color: @foreground-strong;
}

element-icon {
    background-color: transparent;
    size: 22px;
}

element-text {
    background-color: transparent;
    text-color: inherit;
    vertical-align: 0.5;
}

message {
    background-color: @background-alt;
    border-radius: 8px;
    padding: 8px;
}

textbox {
    background-color: @background-alt;
    text-color: @foreground;
}

mode-switcher {
    background-color: @background;
    spacing: 6px;
}

button {
    background-color: @background-alt;
    text-color: @foreground;
    border-radius: 8px;
    padding: 6px 10px;
}

button selected {
    background-color: @selected;
    text-color: @foreground-strong;
}`,
    },
    {
      kind: "text",
      bullets: [
        "The Rofi theme uses the same dark gray palette as the i3 bar and window colors.",
        "MesloLGS Nerd Font keeps launcher text consistent with i3 and Alacritty.",
        "drun mode opens desktop applications such as Firefox, VS Code, Okular, and Alacritty.",
        "window mode searches already-open windows and jumps to the selected one.",
        "run mode remains available from Rofi internally, but no i3 shortcut is assigned to it in this setup.",
      ],
    },
    {
      kind: "text",
      text: ["Test Rofi manually."],
    },
    {
      kind: "code",
      language: "bash",
      code: `rofi -show drun
rofi -show window`,
    },
  ],
},
    {
  title: "Daily shortcuts",
  blocks: [
    {
      kind: "text",
      text: ["Mod is the configured i3 modifier key."],
    },
    {
      kind: "table",
      headers: ["Shortcut", "Action"],
      rows: [
        ["Mod+Enter", "Open Alacritty terminal"],
        ["Mod+Space", "Open Rofi app launcher in drun mode"],
        ["Mod+Tab", "Open Rofi window switcher"],
        ["Mod+1 ... Mod+6", "Switch to workspace 1-6"],
        ["Mod+Shift+1 ... Mod+Shift+6", "Move focused window to workspace 1-6"],
        ["Mod+Shift+Q", "Close focused window"],
        ["Mod+F", "Fullscreen focused window"],
        ["Mod+H", "Split horizontal for the next window"],
        ["Mod+V", "Split vertical for the next window"],
        ["Mod+E", "Toggle split layout"],
        ["Mod+R", "Enter resize mode, then use arrows, Enter, or Escape"],
        ["Mod+Left / Right / Up / Down", "Focus neighbor window"],
        ["Mod+Shift+Left / Right / Up / Down", "Move focused window"],
        ["Mod+Shift+Space", "Toggle floating on focused window"],
        ["Mod+Control+1", "Apply laptop-only screen layout"],
        ["Mod+Control+2", "Apply external 1K-only screen layout"],
        ["Mod+Control+3", "Apply external 2K-only screen layout"],
        ["Mod+Control+4", "Apply mirror 1K screen layout"],
        ["Mod+Shift+R", "Reload i3 config"],
        ["Mod+Shift+E", "Exit i3 session"],
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
      code: `# Find duplicate keybindings manually if i3 reports a conflict
grep -n '^bindsym' ~/.config/i3/config

# Check the i3 modifier and font
grep -nE '^set \\$mod|^font ' ~/.config/i3/config

# Check the active terminal binding
grep -n 'Return.*terminal\\|Return.*alacritty\\|i3-sensible-terminal\\|set \\$term' ~/.config/i3/config

# Check Rofi bindings
grep -nE 'rofi|dmenu|space|Tab' ~/.config/i3/config

# Check Picom startup
grep -n 'picom' ~/.config/i3/config

# Check wallpaper command
grep -nE 'feh|xsetroot|wallpaper' ~/.config/i3/config
ls -lh ~/.config/wallpaper.jpg

# Check screen layout startup and shortcuts
grep -nE 'screenlayout|workspace [123] output primary' ~/.config/i3/config

# Check window gaps
grep -nE '^gaps |^smart_gaps' ~/.config/i3/config

# Check border and window color rules
grep -nE 'default_border|default_floating_border|client\\.focused|client\\.focused_inactive|client\\.unfocused|client\\.urgent|new_window|new_float|for_window.*border|hide_edge_borders' ~/.config/i3/config

# Check app window rules
grep -nE 'for_window|Upwork' ~/.config/i3/config

# Check window class of a running app
xprop | grep WM_CLASS

# Check i3status config
cat ~/.config/i3status/config

# Check Alacritty config
cat ~/.config/alacritty/alacritty.toml

# Check OS age command
~/.local/bin/os-age

# Check Fastfetch config and output
cat ~/.config/fastfetch/config.jsonc
fastfetch

# Check Starship config and prompt modules
cat ~/.config/starship.toml
starship explain

# Check Bash startup order
grep -n 'starship init bash' ~/.bashrc
grep -n 'fastfetch' ~/.bashrc
grep -n '.local/bin' ~/.bashrc

# Check Rofi config
cat ~/.config/rofi/config.rasi
cat ~/.config/rofi/i3-dark.rasi

# Check Picom config
cat ~/.config/picom/picom.conf
grep -n 'i3bar' ~/.config/picom/picom.conf

# Check Meslo font resolution
fc-match "MesloLGS Nerd Font"

# Check which terminal opened the current shell
ps -p $PPID -o comm=

# Check the process tree for the current shell
pstree -s $$

# Exit i3 from terminal
i3-msg exit`,
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
            "Wallpaper image: ~/.config/wallpaper.jpg",
            "Alacritty terminal config: ~/.config/alacritty/alacritty.toml",
            "Fastfetch config: ~/.config/fastfetch/config.jsonc",
            "Starship config: ~/.config/starship.toml",
            "OS age command: ~/.local/bin/os-age",
            "Bash startup config: ~/.bashrc",
            "Picom compositor config: ~/.config/picom/picom.conf",
            "i3status modules: ~/.config/i3status/config",
            "Screen layout scripts: ~/.screenlayout/",
            "Screen layout script definitions are documented in the linked i3 screen layout profiles note.",
            "Do not put i3status blocks such as tztime, battery, or memory in ~/.config/i3/config. They belong only in ~/.config/i3status/config.",
            "Do not rely on Mod+Enter to update separate launcher scripts. If a script hardcodes konsole, update that script directly.",
          ],
        },
      ],
    },
  ],
}

export default entry

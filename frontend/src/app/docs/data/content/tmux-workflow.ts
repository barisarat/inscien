import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "tmux-workflow",
  kind: "codenote",
  name: "tmux Sessions, Windows, and Panes",
  desc: "Keyboard driven terminal tool for managing multiple contexts in parallel. Daily routine for sessions, windows, and panes.",
  intro:
    "tmux organizes terminal work in three levels: sessions (top-level workspaces), windows (tabs inside a session), and panes (splits inside a window).",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Prefix: Ctrl+b

# Sessions from the shell
tmux ls         # list sessions
tmux attach     # attach to session

# Sessions from inside tmux
Ctrl+b d                      # detach (session keeps running)
Ctrl+b s                      # list and choose session
Ctrl+b : new-session -s x     # create session without detaching
Ctrl+b : switch-client -t x   # switch to session x

# Windows
Ctrl+b c        # new window
Ctrl+b n        # next window
Ctrl+b p        # previous window
Ctrl+b w        # list windows
Ctrl+b &        # kill window

# Panes
Ctrl+b %        # split left/right
Ctrl+b "        # split top/bottom
Ctrl+b arrows   # move between panes
Ctrl+b x        # kill pane
Ctrl+b z        # zoom pane
Ctrl+b !        # pane to new window
Ctrl+b Space    # cycle layouts

# Copy / scroll
Ctrl+b [        # copy mode
Ctrl+b ]        # paste
`,
        },
      ],
    },
    {
      title: "Config (~/.tmux.conf)",
      blocks: [
        {
          kind: "text",
          text: [
            "In addition to the default cases, these two lines provide useful customization. Open the tmux.conf to set these:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `set -g mouse on
set -g history-limit 100000`,
        },
      ],
    },
    {
      title: "Default prefix",
      blocks: [
        {
          kind: "text",
          text: [
            "All tmux shortcuts start with the prefix key. Press it, release, then press the next key.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b`,
        },
      ],
    },
    {
      title: "Sessions",
      blocks: [
        {
          kind: "text",
          text: [
            "Sessions are top-level workspaces. They keep running even if you close the terminal, until you kill them or reboot.",
            "From the shell (outside tmux):",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux                      # new unnamed session, named 0 by default
tmux new -s ml            # new named session
# -s: session name
tmux ls                   # list sessions
tmux attach -t ml         # attach to session
# -t: target
tmux kill-session -t ml   # kill a session
tmux kill-server          # kill the whole tmux server`,
        },
        {
          kind: "text",
          text: [
            "If you started with just tmux the session is called 0. To rename it afterwards:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `tmux rename-session mysession   # from the shell while attached
Ctrl+b $                        # from inside tmux`,
        },
        {
          kind: "text",
          text: ["From inside a running tmux session:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b d   # detach and returns you to the shell, session keeps running`,
        },
      ],
    },
    {
      title: "Session navigation from inside tmux",
      blocks: [
        {
          kind: "text",
          text: [
            "These are all used from inside a running tmux session.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b s                    # open interactive session list, choose with arrows + Enter
Ctrl+b : new-session -s x   # create a new named session without detaching
# -s: session name
Ctrl+b : switch-client -t x # jump to an existing session by name`,
        },
        {
          kind: "text",
          text: [
            "Ctrl+b : opens the tmux command prompt at the bottom of the screen. Type the command after the colon and press Enter.",
          ],
        },
      ],
    },
    {
      title: "Windows",
      blocks: [
        {
          kind: "text",
          text: ["Windows are tabs inside a session."],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b c   # new window
Ctrl+b n   # next window
Ctrl+b p   # previous window
Ctrl+b 0   # go to window 0 (1, 2, ... also work)
Ctrl+b w   # list windows and choose one
Ctrl+b ,   # rename current window
Ctrl+b &   # kill current window`,
        },
      ],
    },
    {
      title: "Panes",
      blocks: [
        {
          kind: "text",
          text: ["Panes are splits inside a window."],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b %          # split left/right
Ctrl+b "          # split top/bottom
Ctrl+b Left/Right/Up/Down   # move between panes
Ctrl+b o          # move to next pane
Ctrl+b ;          # jump back to previous pane
Ctrl+b q          # show pane numbers briefly
Ctrl+b x          # kill current pane
Ctrl+b !          # turn pane into its own window
Ctrl+b z          # zoom pane full-screen (toggle)
Ctrl+b Space      # cycle pane layouts
Ctrl+b Ctrl+Left/Right/Up/Down  # resize pane
exit              # close pane from shell
Ctrl+d            # close pane from shell`,
        },
      ],
    },
    {
      title: "Copy mode and scrollback",
      blocks: [
        {
          kind: "text",
          text: [
            "Scroll with arrow keys, PageUp, PageDown.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b [   # enter copy mode
Ctrl+b ]   # paste copied text`,
        },
      ],
    },
    {
      title: "Mouse",
      blocks: [
        {
          kind: "text",
          text: ["Mouse support is enabled via set -g mouse on."],
          bullets: [
            "Click a pane to select it",
            "Click a window in the status bar to switch to it",
            "Scroll with the mouse wheel or touchpad",
            "Drag pane borders to resize panes",
          ],
        },
      ],
    },
    {
      title: "Help and command prompt",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+b ?      # show all key bindings
Ctrl+b :      # open tmux command prompt
Ctrl+b Ctrl+b # send literal Ctrl+b to program inside tmux`,
        },
      ],
    },
  ],
}

export default entry
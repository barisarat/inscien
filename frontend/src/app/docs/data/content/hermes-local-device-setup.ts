import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "hermes-local-device-setup",
  kind: "codenote",
  name: "Hermes Local Device Setup",
  desc: "Set up Hermes on a separate local Ubuntu device, connect over SSH, manage sessions, and optionally expose a local dev site through a reverse tunnel.",
  intro:
    "Run Hermes on a separate local device instead of the daily machine. This workflow assumes the main machine and target Ubuntu or homelab device are on the same network. The main machine connects over SSH, while Hermes runs on the controlled target device.",
  sections: [
    {
      title: "Set connection variables",
      blocks: [
        {
          kind: "text",
          text: [
            "Set these variables on the main machine. Use the remote username and the local IP address or hostname of the device where Hermes will run.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `export LAB_USER="your_remote_user"
export LAB_HOST="your_lab_ip_or_hostname"
export LAB_SSH="$LAB_USER@$LAB_HOST"`,
        },
      ],
    },
    {
      title: "Update the target device",
      blocks: [
        {
          kind: "text",
          text: [
            "SSH into the target device and update the base system before installing Hermes.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh $LAB_SSH

sudo apt update
sudo apt upgrade`,
        },
        {
          kind: "text",
          text: [
            "Reboot if kernel, systemd, libc, GPU, or browser-related packages changed. SSH back in after the reboot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo reboot

ssh $LAB_SSH`,
        },
      ],
    },
    {
      title: "Install base dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the basic tools Hermes needs on the target device.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt update
sudo apt install -y curl git ca-certificates tmux nodejs npm`,
        },
      ],
    },
    {
      title: "Install browser automation dependencies",
      blocks: [
        {
          kind: "text",
          text: [
            "Install Chromium dependencies for browser automation on the target device.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo npx playwright install-deps chromium`,
        },
      ],
    },
    {
      title: "Install Hermes",
      blocks: [
        {
          kind: "text",
          text: [
            "Run the Hermes installer on the target device.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`,
        },
        {
          kind: "text",
          text: [
            "Add ~/.local/bin to PATH, reload the shell, then check the Hermes install.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

hermes doctor`,
        },
      ],
    },
    {
      title: "Start Hermes",
      blocks: [
        {
          kind: "table",
          headers: ["Command", "Use"],
          rows: [
            ["hermes", "Start classic CLI mode"],
            ["hermes --tui", "Start TUI mode"],
            ["hermes -c", "Resume the latest session"],
            ["hermes --tui -c", "Resume the latest session in TUI mode"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Classic CLI mode is usually better for copy and paste.",
            "TUI mode is useful if classic CLI has terminal display issues.",
          ],
        },
      ],
    },
    {
      title: "Stop a frozen Hermes process",
      blocks: [
        {
          kind: "text",
          text: [
            "First try Ctrl+C in the active SSH terminal. If Hermes does not respond, open another SSH terminal to the target device and kill the process.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pkill -f hermes

hermes`,
        },
      ],
    },
    {
      title: "Manage Hermes sessions",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# List sessions
hermes sessions list

# List more sessions
hermes sessions list --limit 50

# Resume a session by title or ID
hermes --resume "SESSION_TITLE_OR_ID"

# Short form
hermes -r "SESSION_TITLE_OR_ID"

# Rename a session
hermes sessions rename SESSION_ID "new-session-title"

# Delete a session
hermes sessions delete SESSION_ID

# Delete without confirmation
hermes sessions delete SESSION_ID --yes`,
        },
      ],
    },
    {
      title: "Expose a local dev site to Hermes",
      blocks: [
        {
          kind: "text",
          text: [
            "Use an SSH reverse tunnel when a local app is running on the main machine and Hermes needs to inspect it from the target device.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh -N -R 3000:localhost:3000 $LAB_SSH`,
        },
        {
          kind: "text",
          text: [
            "Hermes running on the target device can then inspect the local app through this address.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `http://127.0.0.1:3000`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Hermes runs on the target Ubuntu or homelab device.",
            "The main machine connects to the target device over SSH.",
            "Use the target device terminal for Hermes sessions.",
          ],
        },
      ],
    },
  ],
}

export default entry

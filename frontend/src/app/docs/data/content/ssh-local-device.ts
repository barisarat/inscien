import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "ssh-local-device",
  kind: "codenote",
  name: "SSH into a Local Network Device",
  desc: "Connect from a Linux host to another device on the same local network over SSH, using a named host alias in ~/.ssh/config.",
  intro:
    "Connect from a Linux machine to another device on the same local network. In this case we will use a headless Ubuntu box whose IP is already known as the device to connect. Simply using an alias registry in ~/.ssh/config lets you connect with a short command instead of the full user and IP.",
  sections: [
    {
      title: "Check existing SSH hosts",
      blocks: [
        {
          kind: "text",
          text: ["If the file does not exist, create it and set permissions. SSH ignores config and key files that are too open."],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.ssh
touch ~/.ssh/config
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config`,
        },
      ],
    },
    {
      title: "Add the host to ~/.ssh/config",
      blocks: [
        {
          kind: "text",
          text: [
            "Open ~/.ssh/config and append the block below. Replace 192.168.1.5 with the target device IP and your user with the Linux username on that device. No extra file is needed for password login or the default SSH key.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.ssh/config`,
        },
        {
          kind: "code",
          language: "bash",
          code: `Host local-ubuntu
    HostName 192.168.1.6
    User your-user`,
        },
      ],
    },
    {
      title: "Connect",
      blocks: [
        {
          kind: "text",
          text: ["Once saved, connect using the alias."],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh local-ubuntu`,
        },
        {
          kind: "text",
          text: ["The equivalent direct command without an alias:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh myuser@192.168.1.5`,
        },
        {
          kind: "text",
          text: [
            "On the first connection, SSH asks whether to trust the host fingerprint. Type yes if the IP and device are correct. If the target is configured for password login, the password prompt will show up.",
          ],
        },
      ],
    },
    {
      title: "Copy",
      blocks: [
        {
          kind: "text",
          text: ["After connection, move files when needed with scp command. Copy all files in a driectory with * or copy a specific file by filename."],
        },
        {
          kind: "code",
          language: "bash",
          code: `scp -r $USER@192.168.1.5:/home/$USER/myproject/* ~/projects/myproject/`,
        },

      ],
    },
        {
      title: "File Sizes",
      blocks: [
        {
          kind: "text",
          text: ["Check file/folder sizes whenever needed in this process with du command."],
        },
        {
          kind: "code",
          language: "bash",
          code: `du -sh /path/to/folder`,
        },

      ],
    },
    
    {
      title: "Debug failed connections",
      blocks: [
        {
          kind: "text",
          text: ["Run SSH with verbose output to see where a failed connection breaks down."],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh -v local-ubuntu`,
        },
        {
          kind: "text",
          text: [
            "If ssh reports 'No route to host', confirm basic reachability from the host machine and verify the target IP from the target machine itself.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# From the host
ping 192.168.1.5

# From the target device
ip addr`,
        },
        {
          kind: "text",
          text: ["If the target device is reachable on the network but SSH fails to connect, confirm the SSH server is installed and running on the target."],
        },
        {
          kind: "code",
          language: "bash",
          code: `# On the target Ubuntu device
sudo systemctl status ssh

# If not installed
sudo apt update
sudo apt install openssh-server
sudo systemctl enable --now ssh`,
        },
      ],
    },
  ],
}

export default entry
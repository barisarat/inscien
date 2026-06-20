import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "ssh-ec2-connect",
  kind: "codenote",
  name: "SSH into EC2 from Linux Host",
  desc: "Configure and connect to an AWS EC2 instance over SSH from a Linux host using a named host alias in ~/.ssh/config.",
  intro: "A minimal SSH setup for connecting to an EC2 instance from Linux or WSL. The pattern defines a named host alias in ~/.ssh/config so you connect with a short command instead of specifying the key, user, and IP every time.",  sections: [
  { 
      title: "Check or create SSH config",
      blocks: [
        {
          kind: "text",
          text: [
            "First check whether ~/.ssh/config already exists. If it does not, create the file and set its permissions.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# check if config exists
ls -la ~/.ssh/config

# if it does not exist, create it
touch ~/.ssh/config
chmod 600 ~/.ssh/config`,
        },
        {
          kind: "text",
          text: [
            "If the file already exists, list the host aliases defined in it to avoid naming conflicts.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -E '^Host ' ~/.ssh/config`,
        },
      ],
    },
    {
      title: "Place your key file",
      blocks: [
        {
          kind: "text",
          text: [
            "Copy your EC2 .pem key file into ~/.ssh/ and restrict its permissions. SSH will refuse to use a key file that is readable by others.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cp my_ec2_ssh_key.pem ~/.ssh/my_ec2_ssh_key.pem
chmod 400 ~/.ssh/my_ec2_ssh_key.pem`,
        },
      ],
    },
    {
      title: "Add the host to ~/.ssh/config",
      blocks: [
        {
          kind: "text",
          text: [
            "Open ~/.ssh/config in any editor and append the block below. Replace my_ec2_public_ip with the public IPv4 address of your instance. Find IPv4 in the EC2 console under Instance summary.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Host my-ec2
    HostName my_ec2_public_ip
    User ubuntu
    IdentityFile ~/.ssh/my_ec2_ssh_key.pem`,
        },
        {
          kind: "text",
          text: [
            "The default username for Ubuntu based instances is ubuntu. Amazon Linux instances use ec2-user instead.",
          ],
        },
      ],
    },
    {
      title: "Connect",
      blocks: [
        {
          kind: "text",
          text: [
            "Once the config entry is saved, connect using just the host alias.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh my-ec2`,
        },
      ],
    },
  ],
}

export default entry
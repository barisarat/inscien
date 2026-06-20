import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "ec2-add-ssh-key",
  kind: "codenote",
  name: "Adding a New SSH Key to EC2",
  desc: "Add a new key pair to a running EC2 instance without losing existing access: key creation in AWS, local setup, public key extraction, and authorized_keys update.",
  intro:
    "Use this when you need a new SSH key on an existing EC2 instance. For example, when setting up access from a new machine or in a missing key case. You will need existing access to the instance (via EC2 Instance Connect or another active key) to add the new one. This worflow assumes both the local environment and ec2 are running on linux",
  sections: [
    {
      title: "1. Create a key pair in AWS",
      blocks: [
        {
          kind: "text",
          bullets: [
            "AWS Console → EC2 → Key Pairs → Create key pair",
            "Choose a clear name and PEM format",
            "Download the .pem file (AWS only provides this once)",
          ],
        },
      ],
    },
    {
      title: "2. Move the .pem to ~/.ssh on your machine",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.ssh
chmod 700 ~/.ssh
mv ~/Downloads/your-new-key.pem ~/.ssh/
chmod 400 ~/.ssh/your-new-key.pem`,
        },
      ],
    },
    {
      title: "3. Extract the public key from the .pem",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `ssh-keygen -y -f ~/.ssh/your-new-key.pem`,
        },
        {
          kind: "text",
          text: [
            "This prints a single public key line starting with ssh-rsa or ssh-ed25519. Copy the entire line including the prefix.",
          ],
        },
      ],
    },
    {
      title: "4. Add the public key to the EC2 instance",
      blocks: [
        {
          kind: "text",
          text: [
            "Connect to the instance via EC2 Instance Connect or any existing key, then edit authorized_keys:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys`,
        },
        {
          kind: "text",
          bullets: [
            "Keep existing key lines",
            "Paste the new public key as a new line",
            "Each key must be on its own single line",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod 600 ~/.ssh/authorized_keys`,
        },
      ],
    },
    {
      title: "5. Test the connection",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Ubuntu AMI
ssh -i ~/.ssh/your-new-key.pem ubuntu@YOUR_EC2_PUBLIC_IP

# Amazon Linux AMI
ssh -i ~/.ssh/your-new-key.pem ec2-user@YOUR_EC2_PUBLIC_IP`,
        },
      ],
    },
  ],
}

export default entry
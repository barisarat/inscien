import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "github-ssh-auth",
  kind: "codenote",
  name: "GitHub SSH Authentication for Local and EC2",
  desc: "Set up GitHub SSH authentication without repeated username and token prompts, using separate keys for local development and EC2.",
  intro:
    "This workflow replaces HTTPS username and token prompts with SSH authentication. It covers Git identity, local machine setup, EC2 setup, GitHub key placement, SSH remote URLs, and daily verification commands.",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# check Git
git --version

# configure Git commit identity
git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"

# verify Git config
git config --global --list

# local machine key
ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/github_ed25519

# remove passphrase if needed
ssh-keygen -p -f ~/.ssh/github_ed25519

# print public key
cat ~/.ssh/github_ed25519.pub

# test GitHub SSH
ssh -T git@github.com

# check current repo remote
git remote -v

# convert HTTPS remote to SSH
git remote set-url origin git@github.com:USERNAME/REPO.git

# test Git operation
git pull`,
        },
      ],
    },
    {
      title: "Purpose of this setup",
      blocks: [
        {
          kind: "text",
          text: [
            "GitHub no longer accepts normal account passwords for Git over HTTPS. If a repository uses an HTTPS remote, Git may ask for a username and token during pull, push, or clone.",
            "SSH authentication avoids repeated username and token prompts. After the public key is added to GitHub and the repository remote uses the SSH URL, Git operations work through the SSH key.",
          ],
        },
      ],
    },
    {
      title: "Recommended key layout",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep separate keys for separate purposes. Do not reuse the EC2 login key as a GitHub key, and do not copy the local GitHub private key to EC2.",
          ],
        },
        {
          kind: "table",
          headers: ["Location", "Key", "Purpose"],
          rows: [
            ["Local machine", "~/.ssh/github_ed25519", "Local machine to GitHub"],
            ["Local machine", "~/.ssh/server-login.pem", "Local machine to EC2"],
            ["EC2 server", "~/.ssh/github_ec2_ed25519", "EC2 server to GitHub"],
          ],
        },
      ],
    },
    {
      title: "Check existing SSH files",
      blocks: [
        {
          kind: "text",
          text: [
            "Before creating a new key, inspect the SSH directory. Existing .pem files are often server login keys and should not be uploaded to GitHub.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -la ~/.ssh`,
        },
        {
          kind: "text",
          bullets: [
            "A .pem file is usually for logging in to a server.",
            "A GitHub SSH key usually has a private key and a matching .pub file.",
            "Only the .pub file is copied to GitHub.",
            "Never paste a private key into GitHub or any web form.",
          ],
        },
      ],
    },
    {
      title: "Configure Git identity",
      blocks: [
        {
          kind: "text",
          text: [
            "Set the Git author name and email on the machine before making commits. This controls the identity stored in commit metadata. It is separate from SSH authentication.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git config --global user.name "Your Name"
git config --global user.email "your_email@example.com"`,
        },
        {
          kind: "text",
          text: [
            "Verify the global Git configuration.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git config --global --list`,
        },
        {
          kind: "text",
          bullets: [
            "Use the same email as the GitHub account when possible.",
            "This does not authenticate GitHub access.",
            "SSH keys control pull, push, and clone access.",
            "Git identity controls the author information written into commits.",
          ],
        },
      ],
    },
    {
      title: "Create local GitHub SSH key",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a dedicated GitHub key on the local machine. The -f value gives the key a clear filename instead of using the default id_ed25519.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh-keygen -t ed25519 -C "your_email@example.com" -f ~/.ssh/github_ed25519`,
        },
        {
          kind: "text",
          text: [
            "For a no-passphrase setup, press Enter when asked for the passphrase and press Enter again to confirm the empty passphrase.",
          ],
        },
      ],
    },
    {
      title: "Remove passphrase from an existing local key",
      blocks: [
        {
          kind: "text",
          text: [
            "If the key already has a passphrase and Git asks for it on each operation, remove it with ssh-keygen -p. Enter the old passphrase first, then press Enter twice for an empty new passphrase.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh-keygen -p -f ~/.ssh/github_ed25519`,
        },
      ],
    },
    {
      title: "Configure SSH for GitHub locally",
      blocks: [
        {
          kind: "text",
          text: [
            "Add a GitHub host block so SSH always uses the intended key for github.com.",
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
          code: `Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_ed25519
    IdentitiesOnly yes`,
        },
        {
          kind: "text",
          text: ["Apply safe permissions."],
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod 700 ~/.ssh
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/github_ed25519
chmod 644 ~/.ssh/github_ed25519.pub`,
        },
      ],
    },
    {
      title: "Add local public key to GitHub",
      blocks: [
        {
          kind: "text",
          text: [
            "Print the public key and copy the full output. It starts with ssh-ed25519 and ends with the comment used during key creation.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat ~/.ssh/github_ed25519.pub`,
        },
        {
          kind: "text",
          bullets: [
            "Open GitHub account settings.",
            "Go to SSH and GPG keys.",
            "Choose New SSH key.",
            "Use a clear title such as Local laptop GitHub key.",
            "Paste the public key.",
            "Save the key.",
          ],
        },
      ],
    },
    {
      title: "Test local GitHub SSH authentication",
      blocks: [
        {
          kind: "text",
          text: [
            "Test the connection before changing repository remotes. GitHub should confirm that authentication worked.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh -T git@github.com`,
        },
        {
          kind: "text",
          text: [
            "A successful response means the key works. GitHub does not provide shell access, so the message may also mention that shell access is not available.",
          ],
        },
      ],
    },
    {
      title: "Convert an existing repository from HTTPS to SSH",
      blocks: [
        {
          kind: "text",
          text: [
            "SSH keys only help if the repository remote uses an SSH URL. If the remote still uses HTTPS, Git can continue asking for username and token.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git remote -v`,
        },
        {
          kind: "text",
          text: ["If the output uses HTTPS, change origin to the SSH form."],
        },
        {
          kind: "code",
          language: "bash",
          code: `git remote set-url origin git@github.com:USERNAME/REPO.git
git remote -v`,
        },
        {
          kind: "text",
          text: ["Test with a normal Git operation."],
        },
        {
          kind: "code",
          language: "bash",
          code: `git pull`,
        },
      ],
    },
    {
      title: "Create EC2 GitHub SSH key",
      blocks: [
        {
          kind: "text",
          text: [
            "For EC2, create a separate key on the EC2 server. Do not copy the local private key to the server.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh-keygen -t ed25519 -C "ec2-github-access" -f ~/.ssh/github_ec2_ed25519`,
        },
        {
          kind: "text",
          text: [
            "For a production pull workflow, an empty passphrase is practical because deploy and pull commands may need to run without interactive input.",
          ],
        },
      ],
    },
    {
      title: "Configure SSH for GitHub on EC2",
      blocks: [
        {
          kind: "text",
          text: ["On the EC2 server, add a GitHub host block for the EC2 GitHub key."],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.ssh/config`,
        },
        {
          kind: "code",
          language: "bash",
          code: `Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/github_ec2_ed25519
    IdentitiesOnly yes`,
        },
        {
          kind: "text",
          text: ["Apply safe permissions on EC2."],
        },
        {
          kind: "code",
          language: "bash",
          code: `chmod 700 ~/.ssh
chmod 600 ~/.ssh/config
chmod 600 ~/.ssh/github_ec2_ed25519
chmod 644 ~/.ssh/github_ec2_ed25519.pub`,
        },
      ],
    },
    {
      title: "Add EC2 public key to GitHub",
      blocks: [
        {
          kind: "text",
          text: [
            "Print the EC2 public key and add it to GitHub. Prefer a repository deploy key when the server only needs access to one repository.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat ~/.ssh/github_ec2_ed25519.pub`,
        },
        {
          kind: "table",
          headers: ["GitHub location", "Use case", "Access scope"],
          rows: [
            ["Repository Settings > Deploy keys", "Best for production pull access to one repo", "Single repository"],
            ["Account Settings > SSH and GPG keys", "Simpler when deploy keys are unavailable", "All repos the account can access"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "For a production server, prefer a deploy key if available.",
            "Leave write access disabled when EC2 only needs to pull code.",
            "Use account SSH keys only when deploy keys are unavailable or the server needs access to multiple repositories.",
          ],
        },
      ],
    },
    {
      title: "Test GitHub SSH on EC2",
      blocks: [
        {
          kind: "text",
          text: [
            "Run the SSH test from inside the EC2 server. A deploy key may produce a different success message from a normal account key, but authentication should still succeed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh -T git@github.com`,
        },
      ],
    },
    {
      title: "Convert EC2 repository remote to SSH",
      blocks: [
        {
          kind: "text",
          text: [
            "Inside the project directory on EC2, inspect the current remote. If it uses HTTPS, change it to SSH.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /path/to/project
git remote -v

git remote set-url origin git@github.com:USERNAME/REPO.git
git remote -v

git pull`,
        },
      ],
    },
    {
      title: "Clone new repositories with SSH",
      blocks: [
        {
          kind: "text",
          text: [
            "For new clones, use the SSH URL from the beginning. This avoids HTTPS credential prompts entirely.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/Projects
cd ~/Projects

git clone git@github.com:USERNAME/REPO.git`,
        },
      ],
    },
    {
      title: "Daily verification commands",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands when Git unexpectedly asks for a username, token, or passphrase.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# check Git identity
git config --global --list

# check remote URL
git remote -v

# test GitHub SSH auth
ssh -T git@github.com

# check which key SSH tries
ssh -vT git@github.com

# check SSH config file
cat ~/.ssh/config

# check key files
ls -la ~/.ssh`,
        },
      ],
    },
    {
      title: "Expected final state",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Git global identity is configured on the machine.",
            "Local Git operations use git@github.com:USERNAME/REPO.git.",
            "EC2 Git operations use git@github.com:USERNAME/REPO.git.",
            "Git no longer asks for GitHub username and token.",
            "No passphrase prompt appears if the key was created or updated with an empty passphrase.",
            "Local and EC2 use different private keys.",
          ],
        },
      ],
    },
    {
      title: "Common mistakes",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Skipping Git identity setup before making commits.",
            "Confusing Git identity with GitHub authentication.",
            "Adding the private key instead of the .pub key to GitHub.",
            "Keeping the repository remote as HTTPS after setting up SSH.",
            "Using the EC2 login .pem key as the GitHub key.",
            "Copying the local private key to EC2.",
            "Adding the EC2 key to account settings when a repo-specific deploy key would be safer.",
            "Expecting Deploy keys under account settings. Deploy keys are under repository settings.",
          ],
        },
      ],
    },
  ],
}

export default entry
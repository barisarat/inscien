import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "n8n-ec2-arxiv-radar",
  kind: "codenote",
  name: "n8n EC2 arXiv Radar",
  desc: "Deploy private n8n on EC2 with Docker Compose and build a daily arXiv research digest workflow delivered by email.",
  intro:
    "Run n8n on an AWS EC2 instance as a private automation server. This setup keeps n8n bound to EC2 localhost, accesses the editor through an SSH tunnel, persists state on the server, and uses the first workflow to send a daily arXiv AI research digest by email.",
  sections: [
    {
      title: "Architecture",
      blocks: [
        {
          kind: "text",
          text: [
            "n8n runs in Docker Compose on EC2 and is not exposed publicly. The local browser reaches it through an SSH tunnel from local port 5679 to EC2 localhost port 5678.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Local browser
  |
  | SSH tunnel
  | localhost:5679 -> EC2 localhost:5678
  v
EC2 instance
  |
  | Docker Compose
  v
n8n container
  |
  | bind mount
  v
/home/ubuntu/n8n-lab/local/n8n_data`,
        },
        {
          kind: "text",
          bullets: [
            "The EC2 security group should allow SSH from the operator IP only.",
            "Do not open ports 5678, 80, or 443 for the initial private setup.",
            "Use n8n for scheduling, API calls, lightweight transformation, AI calls, email delivery, and execution history.",
          ],
        },
      ],
    },
    {
      title: "Create the EC2 instance",
      blocks: [
        {
          kind: "table",
          headers: ["Setting", "Value"],
          rows: [
            ["AMI", "Ubuntu Server LTS"],
            ["Instance type", "t3.small"],
            ["Storage", "20 GB gp3"],
            ["Inbound security group", "SSH TCP 22 from operator IP only"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Keep the n8n editor private for the baseline setup.",
            "Use a public domain, reverse proxy, TLS, and database hardening only if the private workflow later needs them.",
          ],
        },
      ],
    },
    {
      title: "Install Docker",
      blocks: [
        {
          kind: "text",
          text: [
            "Install Docker and the Compose plugin on the EC2 instance, then reconnect so the Docker group membership applies.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt update
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu

exit`,
        },
        {
          kind: "code",
          language: "bash",
          code: `docker --version
docker compose version`,
        },
      ],
    },
    {
      title: "Create server files",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the project directory and persistent n8n data folder on the EC2 instance.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/n8n-lab/local/n8n_data
cd ~/n8n-lab`,
        },
        {
          kind: "code",
          language: "bash",
          code: `/home/ubuntu/n8n-lab/
  docker-compose.yml
  .env
  local/
    n8n_data/`,
        },
        {
          kind: "text",
          bullets: [
            "The runtime state lives in /home/ubuntu/n8n-lab/local/n8n_data.",
            "That folder contains the n8n database, workflows, credential metadata, execution history, and local settings.",
            "Do not commit local/n8n_data or .env to a public repository.",
          ],
        },
      ],
    },
    {
      title: "Create Docker Compose file",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `nano ~/n8n-lab/docker-compose.yml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `services:
  n8n:
    image: n8nio/n8n:latest
    container_name: n8n-lab
    restart: unless-stopped

    ports:
      - "127.0.0.1:\${N8N_PORT:-5678}:5678"

    environment:
      - TZ=\${TZ}
      - GENERIC_TIMEZONE=\${TZ}
      - N8N_ENCRYPTION_KEY=\${N8N_ENCRYPTION_KEY}
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http

    volumes:
      - ./local/n8n_data:/home/node/.n8n`,
        },
        {
          kind: "text",
          text: [
            "The port binding is intentionally local-only on the EC2 host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `127.0.0.1:5678:5678`,
        },
      ],
    },
    {
      title: "Create environment file",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `openssl rand -hex 32`,
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/n8n-lab/.env`,
        },
        {
          kind: "code",
          language: "bash",
          code: `TZ=Etc/UTC
N8N_PORT=5678
N8N_ENCRYPTION_KEY=replace-with-random-secret`,
        },
        {
          kind: "text",
          bullets: [
            "Preserve N8N_ENCRYPTION_KEY. If it changes later, existing saved credentials may become unreadable.",
            "Treat .env as a secret file.",
          ],
        },
      ],
    },
    {
      title: "Start n8n",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `cd ~/n8n-lab
docker compose up -d
docker compose ps
docker compose logs --tail=50 n8n`,
        },
        {
          kind: "text",
          text: [
            "The logs should show that the editor is accessible at http://localhost:5678.",
          ],
        },
      ],
    },
    {
      title: "Open the editor",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the SSH tunnel from the local machine and keep that SSH session running.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ssh -i /path/to/key.pem -L 5679:localhost:5678 ubuntu@EC2_PUBLIC_IP`,
        },
        {
          kind: "text",
          text: [
            "Then open the local browser at:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `http://localhost:5679`,
        },
      ],
    },
    {
      title: "Reboot behavior",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl is-enabled docker`,
        },
        {
          kind: "text",
          bullets: [
            "Expected output is enabled.",
            "Docker starts after EC2 reboot.",
            "The n8n container restarts because Compose sets restart: unless-stopped.",
            "No custom systemd service is required for this baseline setup.",
          ],
        },
        {
          kind: "text",
          text: [
            "If the stack is stopped with docker compose down, start it manually again.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/n8n-lab
docker compose up -d`,
        },
      ],
    },
    {
      title: "Workflow shape",
      blocks: [
        {
          kind: "text",
          text: [
            "The first workflow sends a daily email digest of recent arXiv papers relevant to LLM agents, code agents, RAG, information retrieval, AI evaluation, software engineering with AI, and developer tools.",
            "The MVP uses paper metadata and abstracts only. It does not download or summarize full PDFs.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Manual Trigger
Schedule Trigger
  |
  v
HTTP Request to arXiv
  |
  v
XML parser
  |
  v
Code node: normalize paper metadata
  |
  v
Code node: prepare AI prompt
  |
  v
AI model node
  |
  v
Code node: extract plain-text digest
  |
  v
Send Email node`,
        },
        {
          kind: "text",
          bullets: [
            "Keep Manual Trigger for testing.",
            "Use Schedule Trigger for daily automation.",
          ],
        },
      ],
    },
    {
      title: "Fetch arXiv papers",
      blocks: [
        {
          kind: "text",
          text: [
            "Use an HTTP Request node to fetch recent papers from selected arXiv categories.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `https://export.arxiv.org/api/query?search_query=cat:cs.AI+OR+cat:cs.CL+OR+cat:cs.LG+OR+cat:cs.IR+OR+cat:cs.SE&sortBy=submittedDate&sortOrder=descending&max_results=5`,
        },
        {
          kind: "table",
          headers: ["Category", "Use"],
          rows: [
            ["cs.AI", "Artificial intelligence"],
            ["cs.CL", "Computational linguistics and language models"],
            ["cs.LG", "Machine learning"],
            ["cs.IR", "Information retrieval"],
            ["cs.SE", "Software engineering"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Potential future additions include stat.ML and selected q-fin categories.",
            "Keep max_results small until the digest quality and email formatting are stable.",
          ],
        },
      ],
    },
    {
      title: "Normalize metadata",
      blocks: [
        {
          kind: "text",
          text: [
            "After parsing the arXiv XML response, normalize each paper into the compact fields the AI node needs.",
          ],
        },
        {
          kind: "table",
          headers: ["Field", "Purpose"],
          rows: [
            ["arxiv_id", "Stable paper identifier"],
            ["title", "Paper title"],
            ["authors", "Author list"],
            ["abstract", "Primary summary input"],
            ["arxiv_url", "Abstract page link"],
            ["pdf_url", "PDF link for manual follow-up"],
            ["categories", "arXiv category labels"],
            ["published", "Submission date"],
          ],
        },
      ],
    },
    {
      title: "Prepare AI digest",
      blocks: [
        {
          kind: "text",
          text: [
            "Send a compact list of normalized papers to the AI model. Ask it to select the top relevant papers for the target interests and return plain text for cleaner email rendering.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Daily arXiv Digest - YYYY-MM-DD

1. Paper title
Why relevant: one sentence
Summary: two sentences
Link: URL

2. Paper title
Why relevant: one sentence
Summary: two sentences
Link: URL

3. Paper title
Why relevant: one sentence
Summary: two sentences
Link: URL`,
        },
      ],
    },
    {
      title: "Send email",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the n8n Send Email node with SMTP credentials. For Gmail, use an app password instead of the normal account password.",
          ],
        },
        {
          kind: "table",
          headers: ["Gmail SMTP setting", "Value"],
          rows: [
            ["Host", "smtp.gmail.com"],
            ["Port", "465"],
            ["Secure/SSL", "true"],
            ["User", "<gmail-address>"],
            ["Password", "<16-character-app-password>"],
          ],
        },
        {
          kind: "table",
          headers: ["Email field", "Value"],
          rows: [
            ["From", "<sender-email>"],
            ["To", "<recipient-email>"],
            ["Subject", "Daily arXiv Radar"],
            ["Body", "AI-generated plain-text digest"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Do not commit or share SMTP credentials.",
            "Use the full Gmail address as the SMTP username.",
            "Use the app password without spaces.",
          ],
        },
      ],
    },
    {
      title: "Create Gmail app password",
      blocks: [
        {
          kind: "text",
          text: [
            "Gmail SMTP requires 2-Step Verification and an app password.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `https://myaccount.google.com/
https://myaccount.google.com/apppasswords`,
        },
        {
          kind: "text",
          bullets: [
            "Open Google Account settings.",
            "Go to Security.",
            "Enable or confirm 2-Step Verification.",
            "Open App passwords.",
            "Create a new app password with a label such as n8n SMTP.",
            "Use the displayed 16-character value in n8n SMTP credentials.",
            "If the app password is exposed, delete it in Google Account settings and create a new one.",
          ],
        },
      ],
    },
    {
      title: "Operate n8n",
      blocks: [
        {
          kind: "table",
          headers: ["Task", "Command"],
          rows: [
            ["Start", "cd ~/n8n-lab && docker compose up -d"],
            ["Stop", "cd ~/n8n-lab && docker compose down"],
            ["Follow logs", "cd ~/n8n-lab && docker compose logs -f n8n"],
            ["Check container", "docker ps"],
            ["Open tunnel", "ssh -i /path/to/key.pem -L 5679:localhost:5678 ubuntu@EC2_PUBLIC_IP"],
          ],
        },
        {
          kind: "text",
          text: [
            "The expected Docker port binding is 127.0.0.1:5678->5678/tcp.",
          ],
        },
      ],
    },
    {
      title: "Back up n8n",
      blocks: [
        {
          kind: "text",
          text: [
            "Back up the Compose file, env file, and persistent data directory. The encryption key is the most important value because saved n8n credentials may not be recoverable without it.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `/home/ubuntu/n8n-lab/.env
/home/ubuntu/n8n-lab/docker-compose.yml
/home/ubuntu/n8n-lab/local/n8n_data/`,
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~
tar -czf n8n-lab-backup-$(date +%Y%m%d).tar.gz n8n-lab`,
        },
        {
          kind: "code",
          language: "bash",
          code: `scp -i /path/to/key.pem ubuntu@EC2_PUBLIC_IP:/home/ubuntu/n8n-lab-backup-YYYYMMDD.tar.gz .`,
        },
      ],
    },
    {
      title: "Keep the MVP simple",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Keep n8n private and use SSH tunneling for editor access.",
            "Avoid a public domain, reverse proxy, TLS setup, PostgreSQL, full PDF parsing, deduplication database, and external workflow repository until the radar proves useful.",
            "Later additions can include PostgreSQL, paper deduplication, sent digest history, manual feedback, saved paper archive, Notion or Markdown export, Telegram delivery, and full-PDF processing for selected papers.",
          ],
        },
      ],
    },
  ],
}

export default entry

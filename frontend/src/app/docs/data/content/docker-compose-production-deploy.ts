import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "docker-compose-production-deploy",
  kind: "codenote",
  name: "Docker Compose Production Deploy on Ubuntu",
  desc: "End-to-end Docker Compose production deployment on an Ubuntu server: install Docker, run the stack, keep after reboots with systemd, and day-to-day rebuild flows.",
  intro:
    "This workflow shows a production setup which uses a Docker Compose stack on an Ubuntu server such as EC2. We cover here steps for Docker install, env file managemtent, first build and startup, logs, rebuild flows, and keeping the stack running across reboots via systemd. Assumes nginx on the host is already configured to proxy to the local container ports.",
  sections: [
    {
      title: "Install Docker on Ubuntu",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Docker's official apt repository for current versions of the engine, Compose plugin, and Buildx.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt update
sudo apt install -y ca-certificates curl

# Add Docker's GPG key
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc

# Add Docker's apt repository
echo \\
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \\
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \\
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install engine, Compose plugin, and Buildx plugin
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`,
        },
        {
          kind: "text",
          text: ["Enable the Docker service and allow the current user to run docker without sudo. Re-login is required for the group membership to take effect."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
exit`,
        },
      ],
    },
    {
      title: "Clone the project",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER
git clone https://github.com/your-org/your-app.git myapp
cd myapp
git status`,
        },
      ],
    },
    {
      title: "Create the production env file",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep a single central production env file at the repo root. Backend and worker services load it via env_file in compose.prod.yaml. Frontend build-time variables like NEXT_PUBLIC_* are passed separately as build args.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano /home/$USER/myapp/.env.prod`,
        },
        {
          kind: "text",
          text: ["Typical values to set:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `NEXT_PUBLIC_API_URL=https://api.example.com
DATABASE_URL=<your database connection string>
REDIS_URL=redis://redis:6379/0
# ... additional backend secrets`,
        },
      ],
    },
    {
      title: "compose.prod.yaml skeleton",
      blocks: [
        {
          kind: "text",
          text: [
            "A minimal template showing the production patterns:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    restart: unless-stopped
    env_file:
      - .env.prod
    depends_on:
      - redis
    ports:
      - "127.0.0.1:8000:8000"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
      args:
        NEXT_PUBLIC_API_URL: \${NEXT_PUBLIC_API_URL}
    restart: unless-stopped
    environment:
      NODE_ENV: production
    depends_on:
      - backend
    ports:
      - "127.0.0.1:3000:3000"

volumes:
  redis_data:`,
        },
      ],
    },
    {
      title: "First build and start",
      blocks: [
        {
          kind: "text",
          text: [
            "If host-level services from the previous setup are still binding the app ports (e.g. an old systemd unit on 3000 or 8000), stop them first. Then build images and bring up the stack detached.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER/myapp

# Stop any host services that may still hold the ports
sudo systemctl stop <old-host-service> 2>/dev/null || true

# Build, then start detached
docker compose --env-file .env.prod -f compose.prod.yaml build
docker compose --env-file .env.prod -f compose.prod.yaml up -d
docker compose --env-file .env.prod -f compose.prod.yaml ps`,
        },
      ],
    },
    {
      title: "Logs and health checks",
      blocks: [
        {
          kind: "text",
          text: ["Tail recent output or follow live."],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose --env-file .env.prod -f compose.prod.yaml logs --tail=100 backend
docker compose --env-file .env.prod -f compose.prod.yaml logs -f frontend`,
        },
        {
          kind: "text",
          text: ["Confirm local ports are reachable and that the expected process is listening."],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl http://127.0.0.1:8000
curl http://127.0.0.1:3000
sudo ss -ltnp | grep -E ':3000|:8000'`,
        },
      ],
    },
    {
      title: "Production request and log monitoring",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use Docker Compose logs for application container output.",
            "Use nginx access logs to see browser requests, page loads, static asset requests, and API routing through the public domain.",
            "Use nginx error logs to diagnose proxy, upstream, TLS, and routing errors.",
            "Production Next.js logs are usually quieter than npm run dev. A normal browser page load may not produce frontend container logs.",
            "Client-side browser console logs are not shown in Docker logs. Use the browser DevTools Console and Network tabs for client-side errors.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER/myapp

# Follow live frontend container logs
docker compose --env-file .env.prod -f compose.prod.yaml logs --tail=200 -f frontend

# Follow live backend container logs
docker compose --env-file .env.prod -f compose.prod.yaml logs --tail=200 -f backend

# Follow frontend and backend together while reproducing an issue
docker compose --env-file .env.prod -f compose.prod.yaml logs --tail=200 -f frontend backend`,
        },
        {
          kind: "text",
          text: [
            "Use nginx logs when you need to confirm whether the browser request reached the server and which route/status nginx returned.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Follow public request logs
sudo tail -f /var/log/nginx/access.log

# Follow nginx error logs
sudo tail -f /var/log/nginx/error.log

# Follow both nginx logs at the same time
sudo tail -f /var/log/nginx/access.log /var/log/nginx/error.log

# Filter for common auth and frontend routes
sudo tail -f /var/log/nginx/access.log | grep -E 'api|auth|register|signup|login|_next'`,
        },
        {
          kind: "text",
          text: [
            "Use the raw Docker container logs when you know the exact container name and want to bypass Compose service naming.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# List running containers
docker ps

# Follow logs for a specific container
docker logs --tail=200 -f <frontend-container-name>
docker logs --tail=200 -f <backend-container-name>`,
        },
        {
          kind: "text",
          text: [
            "Use systemd logs only for the Compose wrapper service itself. These logs are useful for boot/start/stop failures, but Docker Compose logs are better for application runtime errors.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl status app-compose
journalctl -u app-compose -n 100 --no-pager
journalctl -u app-compose -f`,
        },
        {
          kind: "text",
          bullets: [
            "If nginx access logs show the request but backend logs show nothing, the request may not be routed to the backend container.",
            "If nginx shows 4xx or 5xx responses, check nginx error logs and backend logs together.",
            "If Docker frontend logs show nothing during a page load, that can be normal in production.",
            "If the error is visible only in the browser, check DevTools Network response body and Console output.",
          ],
        },
      ],
    },
    {
      title: "Frontend-only rebuild",
      blocks: [
        {
          kind: "text",
          text: [
            "Rebuild only the frontend image when frontend code or frontend build-time env changes. --no-cache guarantees public env values like NEXT_PUBLIC_API_URL are baked in fresh.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER/myapp

# single service build and up shortcut:
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build frontend

# in two steps (and the only up version without build)
docker compose --env-file .env.prod -f compose.prod.yaml build frontend 
docker compose --env-file .env.prod -f compose.prod.yaml up -d frontend

# for validation/debug
docker compose --env-file .env.prod -f compose.prod.yaml logs --tail=100 frontend`,
        },
        {
          kind: "text",
          text: ["Inspect the built bundle to confirm the production API URL was baked in and no localhost references leaked through."],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose --env-file .env.prod -f compose.prod.yaml exec frontend sh -lc "grep -R 'localhost:8000' /app/.next | head -20"

docker compose --env-file .env.prod -f compose.prod.yaml exec frontend sh -lc "grep -R 'api.example.com' /app/.next | head -20"`,
        },
      ],
    },
    {
      title: "Full rebuild and update",
      blocks: [
        {
          kind: "text",
          text: ["Pull latest code, rebuild all services, and recreate."],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER/myapp
git pull
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build
docker compose --env-file .env.prod -f compose.prod.yaml ps`,
        },
      ],
    },
    {
      title: "Run backend migrations and scripts",
      blocks: [
        {
          kind: "text",
          text: [
            "Run one-time backend migration and seed scripts inside the backend container. This uses the same production env file and Compose file as the deployed stack.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER/myapp

# Verify migration files exist inside the backend image
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend ls -la /app/migrations

# Verify script files exist inside the backend image
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend ls -la /app/scripts`,
        },
        {
          kind: "text",
          text: [
            "If /app/scripts is missing or the target script is not listed, rebuild the backend image before running the script.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Rebuild backend if scripts or migrations are missing from the image
docker compose --env-file .env.prod -f compose.prod.yaml build --no-cache backend

# Recheck files after rebuild
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend ls -la /app/scripts
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend ls -la /app/migrations`,
        },
        {
          kind: "text",
          text: [
            "Run the migration first when the seed script depends on tables created by that migration.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Create required database tables first
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend python migrations/sample_migration.py

# Seed data after the tables exist
docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend python scripts/sample_script.py`,
        },
        {
          kind: "text",
          text: [
            "Run only the script when the required tables already exist.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose --env-file .env.prod -f compose.prod.yaml run --rm backend python scripts/sample_script.py`,
        },
      ],
    },
    {
      title: "Persist across reboots with systemd",
      blocks: [
        {
          kind: "text",
          text: [
            "Docker's restart: unless-stopped policies only resume containers if the Compose stack was already up. A systemd oneshot unit runs docker compose up on boot and down on shutdown, making sure the stack comes back cleanly after reboots.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/app-compose.service`,
        },
        {
          kind: "text",
          text: ["Paste the following and save. Adjust WorkingDirectory to match the repo path on your host."],
        },
        {
          kind: "code",
          language: "bash",
          code: `[Unit]
Description=App Docker Compose stack
Requires=docker.service
After=docker.service network.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/ubuntu/myapp
ExecStart=/usr/bin/docker compose --env-file .env.prod -f compose.prod.yaml up -d
ExecStop=/usr/bin/docker compose --env-file .env.prod -f compose.prod.yaml down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target`,
        },
        {
          kind: "text",
          text: ["Reload systemd, enable the service so it runs on boot, and start it now."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl daemon-reload
sudo systemctl enable app-compose
sudo systemctl start app-compose
sudo systemctl status app-compose

# View service-level logs
journalctl -u app-compose -n 100 --no-pager`,
        },
      ],
    },
    {
      title: "Day-to-day operations",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER/myapp

# Deploy latest
git pull
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build

# Check status
docker compose --env-file .env.prod -f compose.prod.yaml ps

# Restart one service
docker compose --env-file .env.prod -f compose.prod.yaml restart backend
docker compose --env-file .env.prod -f compose.prod.yaml restart frontend

# Stop / start the whole stack
docker compose --env-file .env.prod -f compose.prod.yaml down
docker compose --env-file .env.prod -f compose.prod.yaml up -d`,
        },
      ],
    },
    {
      title: "Operational notes",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Keep a single central production env file at the repo root (.env.prod).",
            "Runtime secrets for backend and worker services load through env_file in compose.prod.yaml.",
            "Inside Compose, service-to-service hostnames use service names (e.g. redis://redis:6379/0), not localhost.",
            "Bind container ports to 127.0.0.1 so nginx on the host stays the only public entry point.",
            "restart: unless-stopped alone does not survive full host reboots cleanly, thus the systemd unit above is what guarantees the stack comes back on boot.",
            "Docker Compose logs show application container stdout and stderr, not every browser request.",
            "nginx access logs are the main place to confirm public browser requests and HTTP status codes.",
            "nginx error logs are the main place to diagnose proxy, upstream, TLS, and routing failures.",
            "Production frontend logs are quieter than local development logs. Use browser DevTools for client-side console and network errors.",
          ],
        },
      ],
    },
  ],
}

export default entry
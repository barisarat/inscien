import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "systemd-nginx-fullstack-deploy",
  kind: "codenote",
  name: "systemd and Nginx Fullstack Deployment",
  desc: "Deploy a Next.js frontend and FastAPI backend on Ubuntu with systemd, Redis, Celery, Nginx, and Cloudflare Origin Certificate SSL.",
  intro:
    "This page shows a template production deployment on an Ubuntu server. The frontend runs as a Next.js service on localhost, the backend runs as a FastAPI service through Gunicorn and Uvicorn workers, Celery worker and beat run through systemd, Redis stays local, and Nginx is the only public entry point.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Run the Next.js frontend on 127.0.0.1:3000.",
            "Run the FastAPI backend on 127.0.0.1:8000.",
            "Run Redis locally on 127.0.0.1:6379.",
            "Run Celery worker and Celery beat with systemd.",
            "Expose only Nginx on ports 80 and 443.",
            "Route the main domain to the frontend.",
            "Route the API subdomain to the backend.",
            "Use Cloudflare Origin Certificate when Cloudflare proxies the domain.",
          ],
        },
      ],
    },
    {
      title: "Template variables",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these placeholders throughout the guide. Replace them with the real values for the target project.",
          ],
        },
        {
          kind: "table",
          headers: ["Placeholder", "Meaning"],
          rows: [
            ["example-app", "Short project or service name"],
            ["example.com", "Main frontend domain"],
            ["www.example.com", "Frontend www domain"],
            ["api.example.com", "Backend API domain"],
            ["/home/ubuntu/example_backend", "Backend repository path"],
            ["/home/ubuntu/example_frontend", "Frontend repository path"],
            ["/home/ubuntu/example_venv", "Python virtual environment path"],
            ["example-backend", "Backend systemd service name"],
            ["example-frontend", "Frontend systemd service name"],
            ["example-celery-worker", "Celery worker systemd service name"],
            ["example-celery-beat", "Celery beat systemd service name"],
            ["main:app", "FastAPI application import path"],
            ["celery_app:app", "Celery application import path"],
          ],
        },
      ],
    },
    {
      title: "Repository and runtime layout",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep the frontend and backend in separate folders. Keep the Python virtual environment outside the backend repository so it is not mixed with application source code.",
          ],
        },
        {
          kind: "table",
          headers: ["Component", "Template path"],
          rows: [
            ["Backend", "/home/ubuntu/example_backend"],
            ["Frontend", "/home/ubuntu/example_frontend"],
            ["Python virtual environment", "/home/ubuntu/example_venv"],
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `source /home/ubuntu/example_venv/bin/activate`,
        },
      ],
    },
    {
      title: "Ports and public exposure",
      blocks: [
        {
          kind: "text",
          text: [
            "Bind application services to localhost. Nginx is the only public service. This keeps Node, FastAPI, Redis, and Celery internals away from direct internet access.",
          ],
        },
        {
          kind: "table",
          headers: ["Service", "Bind address"],
          rows: [
            ["Frontend", "127.0.0.1:3000"],
            ["Backend", "127.0.0.1:8000"],
            ["Redis", "127.0.0.1:6379"],
            ["Nginx HTTP", "0.0.0.0:80"],
            ["Nginx HTTPS", "0.0.0.0:443"],
          ],
        },
      ],
    },
    {
      title: "Domain routing",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the root domain and www domain for the frontend. Use an api subdomain for the backend.",
          ],
        },
        {
          kind: "table",
          headers: ["Domain", "Target"],
          rows: [
            ["example.com", "Frontend on 127.0.0.1:3000"],
            ["www.example.com", "Frontend on 127.0.0.1:3000"],
            ["api.example.com", "Backend on 127.0.0.1:8000"],
          ],
        },
        {
          kind: "text",
          text: [
            "In Cloudflare DNS, create A records that point the root domain, www, and api to the server public IP. When using Cloudflare Origin Certificate, keep these records proxied and set SSL/TLS mode to Full strict.",
          ],
        },
      ],
    },
    {
      title: "Install OS packages",
      blocks: [
        {
          kind: "text",
          text: [
            "Install Nginx and Redis on the server. Certbot is not required when the project uses Cloudflare Origin Certificate files.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt-get update
sudo apt-get install -y nginx redis-server`,
        },
      ],
    },
    {
      title: "Backend environment file",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep the backend runtime environment file inside the backend project folder. Do not commit this file to the repository.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `/home/ubuntu/example_backend/.env`,
        },
        {
          kind: "text",
          bullets: [
            "CELERY_BROKER_URL is required when Celery uses Redis.",
            "CELERY_RESULT_BACKEND is optional unless the project stores task results.",
            "Add database URLs, application secrets, API keys, and other runtime settings required by the backend.",
            "The backend service and Celery services should read the same backend environment file.",
          ],
        },
      ],
    },
    {
      title: "Frontend environment file",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep the Next.js production environment file inside the frontend project folder. NEXT_PUBLIC variables are baked into the build, so changing them requires a rebuild.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `/home/ubuntu/example_frontend/.env.production`,
        },
        {
          kind: "text",
          bullets: [
            "Set NEXT_PUBLIC_API_URL to https://api.example.com.",
            "Rebuild the frontend after changing NEXT_PUBLIC variables.",
            "Restart the frontend service after rebuilding.",
          ],
        },
      ],
    },
    {
      title: "Redis setup",
      blocks: [
        {
          kind: "text",
          text: [
            "Redis runs locally as the Celery broker and optional result backend. Keep Redis bound to localhost and do not expose port 6379 publicly.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl enable redis-server
sudo systemctl start redis-server

sudo systemctl status redis-server --no-pager
redis-cli ping`,
        },
        {
          kind: "text",
          text: [
            "The expected Redis ping response is PONG.",
          ],
        },
      ],
    },
    {
      title: "Backend systemd service",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a systemd service for the FastAPI backend. Gunicorn starts Uvicorn workers and binds the app to localhost on port 8000.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/example-backend.service`,
        },
        {
          kind: "text",
          text: ["Paste the following and adjust main:app if the FastAPI entrypoint is different."],
        },
        {
          kind: "code",
          language: "bash",
          code: `[Unit]
Description=Example FastAPI Backend
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/example_backend
EnvironmentFile=/home/ubuntu/example_backend/.env
ExecStart=/home/ubuntu/example_venv/bin/gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 127.0.0.1:8000 main:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`,
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl daemon-reload
sudo systemctl enable example-backend
sudo systemctl start example-backend

sudo systemctl status example-backend --no-pager
journalctl -u example-backend -n 200 --no-pager`,
        },
      ],
    },
    {
      title: "Celery worker systemd service",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate service for the Celery worker. The example assumes the Celery instance is app inside celery_app.py, so the target is celery_app:app.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/example-celery-worker.service`,
        },
        {
          kind: "code",
          language: "bash",
          code: `[Unit]
Description=Example Celery Worker
After=network.target redis-server.service
Requires=redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/example_backend
EnvironmentFile=/home/ubuntu/example_backend/.env
ExecStart=/home/ubuntu/example_venv/bin/celery -A celery_app:app worker -l info --concurrency=2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`,
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl daemon-reload
sudo systemctl enable example-celery-worker
sudo systemctl start example-celery-worker

sudo systemctl status example-celery-worker --no-pager
journalctl -u example-celery-worker -n 200 --no-pager`,
        },
      ],
    },
    {
      title: "Celery beat systemd service",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a separate service for Celery beat when the application has scheduled jobs. Use an empty pidfile argument to avoid stale pidfile issues in simple deployments.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/example-celery-beat.service`,
        },
        {
          kind: "code",
          language: "bash",
          code: `[Unit]
Description=Example Celery Beat
After=network.target redis-server.service
Requires=redis-server.service

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/example_backend
EnvironmentFile=/home/ubuntu/example_backend/.env
ExecStart=/home/ubuntu/example_venv/bin/celery -A celery_app:app beat -l info --pidfile=
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`,
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl daemon-reload
sudo systemctl enable example-celery-beat
sudo systemctl start example-celery-beat

sudo systemctl status example-celery-beat --no-pager
journalctl -u example-celery-beat -n 200 --no-pager`,
        },
      ],
    },
    {
      title: "Optional Celery beat schedule path",
      blocks: [
        {
          kind: "text",
          text: [
            "For deployments that need a persistent beat schedule file outside the repository, create a writable runtime folder and pass the schedule path in ExecStart.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo mkdir -p /var/lib/example-app
sudo chown ubuntu:ubuntu /var/lib/example-app`,
        },
        {
          kind: "code",
          language: "bash",
          code: `ExecStart=/home/ubuntu/example_venv/bin/celery -A celery_app:app beat -l info --pidfile= --schedule=/var/lib/example-app/celerybeat-schedule`,
        },
      ],
    },
    {
      title: "Frontend build",
      blocks: [
        {
          kind: "text",
          text: [
            "Build the Next.js frontend from the frontend project folder. Production environment variables must already be correct before building.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/ubuntu/example_frontend
npm ci
npm run build`,
        },
      ],
    },
    {
      title: "Frontend systemd service",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a systemd service for the Next.js production server. The service runs npm start on localhost port 3000.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/example-frontend.service`,
        },
        {
          kind: "code",
          language: "bash",
          code: `[Unit]
Description=Example Next.js Frontend
After=network.target

[Service]
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/example_frontend
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target`,
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl daemon-reload
sudo systemctl enable example-frontend
sudo systemctl start example-frontend

sudo systemctl status example-frontend --no-pager
journalctl -u example-frontend -n 200 --no-pager`,
        },
      ],
    },
    {
      title: "Restart frontend after rebuild",
      blocks: [
        {
          kind: "text",
          text: [
            "When frontend code or NEXT_PUBLIC environment variables change, rebuild first and then restart the frontend service.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/ubuntu/example_frontend
npm run build
sudo systemctl restart example-frontend`,
        },
      ],
    },
    {
      title: "Nginx site file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create one Nginx site file for the frontend and backend domains. The HTTP blocks redirect to HTTPS. The HTTPS frontend block proxies to port 3000. The HTTPS API block proxies to port 8000.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/nginx/sites-available/example-app`,
        },
        {
          kind: "code",
          language: "bash",
          code: `server {
    listen 80;
    server_name example.com www.example.com api.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com www.example.com;

    ssl_certificate     /etc/nginx/ssl/example-app/origin-cert.pem;
    ssl_certificate_key /etc/nginx/ssl/example-app/origin-key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}

server {
    listen 443 ssl;
    server_name api.example.com;

    ssl_certificate     /etc/nginx/ssl/example-app/origin-cert.pem;
    ssl_certificate_key /etc/nginx/ssl/example-app/origin-key.pem;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}`,
        },
      ],
    },
    {
      title: "Enable Nginx site",
      blocks: [
        {
          kind: "text",
          text: [
            "Enable the site by linking it into sites-enabled. Remove the default site if it conflicts with the same domains.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo ln -s /etc/nginx/sites-available/example-app /etc/nginx/sites-enabled/example-app
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx`,
        },
      ],
    },
    {
      title: "Cloudflare Origin Certificate files",
      blocks: [
        {
          kind: "text",
          text: [
            "This certificate pattern assumes Cloudflare proxies traffic and SSL/TLS mode is Full strict. Store the origin certificate and private key on the server and reference them from the Nginx HTTPS blocks.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo mkdir -p /etc/nginx/ssl/example-app

sudo nano /etc/nginx/ssl/example-app/origin-cert.pem
sudo nano /etc/nginx/ssl/example-app/origin-key.pem`,
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo chmod 600 /etc/nginx/ssl/example-app/origin-key.pem
sudo chmod 644 /etc/nginx/ssl/example-app/origin-cert.pem
sudo chown -R root:root /etc/nginx/ssl/example-app

sudo nginx -t
sudo systemctl reload nginx`,
        },
      ],
    },
    {
      title: "Service status commands",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands to inspect all services involved in the deployment.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl status example-backend --no-pager
sudo systemctl status example-frontend --no-pager
sudo systemctl status example-celery-worker --no-pager
sudo systemctl status example-celery-beat --no-pager
sudo systemctl status redis-server --no-pager
sudo systemctl status nginx --no-pager`,
        },
      ],
    },
    {
      title: "Restart commands",
      blocks: [
        {
          kind: "text",
          text: [
            "Restart only the service that changed. Restart Nginx only after Nginx config or certificate changes.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl restart example-backend
sudo systemctl restart example-frontend
sudo systemctl restart example-celery-worker
sudo systemctl restart example-celery-beat
sudo systemctl restart redis-server
sudo systemctl restart nginx`,
        },
      ],
    },
    {
      title: "Log commands",
      blocks: [
        {
          kind: "text",
          text: [
            "Use journalctl for systemd service logs. Use follow mode when watching live behavior after a restart.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -u example-backend -f
journalctl -u example-frontend -f
journalctl -u example-celery-worker -f
journalctl -u example-celery-beat -f
journalctl -u nginx -n 200 --no-pager
journalctl -u redis-server -n 200 --no-pager`,
        },
      ],
    },
    {
      title: "Local health checks",
      blocks: [
        {
          kind: "text",
          text: [
            "Run local checks from the server first. These confirm the internal services respond before testing public domains.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:8000
redis-cli ping`,
        },
      ],
    },
    {
      title: "External health checks",
      blocks: [
        {
          kind: "text",
          text: [
            "After local checks pass and Nginx reloads successfully, test the public HTTPS domains.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -I https://example.com
curl -I https://www.example.com
curl -I https://api.example.com`,
        },
      ],
    },
    {
      title: "Expected final state",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Nginx is the only public service on ports 80 and 443.",
            "The frontend runs locally on 127.0.0.1:3000.",
            "The backend runs locally on 127.0.0.1:8000.",
            "Redis runs locally and responds with PONG.",
            "Celery worker and Celery beat run as systemd services.",
            "The main domain serves the frontend.",
            "The API subdomain serves the backend.",
            "Cloudflare proxies the domains and uses Full strict SSL mode.",
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
            "Exposing the backend or Redis publicly instead of binding them to localhost.",
            "Changing NEXT_PUBLIC frontend variables without rebuilding the frontend.",
            "Forgetting to run sudo systemctl daemon-reload after editing service files.",
            "Using the wrong FastAPI app path in the Gunicorn ExecStart command.",
            "Using the wrong Celery app target. If the file is celery_app.py and the instance is app, use celery_app:app.",
            "Reloading Nginx without first running sudo nginx -t.",
            "Using Cloudflare Origin Certificate without Cloudflare proxy and Full strict mode.",
            "Putting private keys or environment files into the repository.",
          ],
        },
      ],
    },
  ],
}

export default entry
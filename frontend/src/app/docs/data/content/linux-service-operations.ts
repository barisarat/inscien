import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "linux-service-operations",
  kind: "codenote",
  name: "Linux Service Operations",
  desc: "Operate systemd services, Nginx configs, process IDs, journal logs, Docker logs, and cron jobs on Linux servers and Arch workstations.",
  intro:
    "This page is a quick operational reference for Linux service management and server maintenance. We cover systemd and systemctl, service creation and removal, Nginx site cleanup, PID checks, journalctl, Docker logs, cron, and cron versus Celery.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use systemctl to control systemd-managed services.",
            "Use daemon-reload after creating, editing, or deleting systemd unit files.",
            "Use restart for app services after code or environment changes.",
            "Use nginx -t and systemctl reload nginx after Nginx config changes.",
            "Use journalctl for systemd service logs.",
            "Use docker compose logs for container application logs.",
            "Use cron for simple time-based shell commands.",
            "Use Celery for application background jobs, retries, queues, and scheduled app tasks.",
          ],
        },
      ],
    },
    {
      title: "Mental model",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `Linux kernel
  -> systemd
    -> services
      -> nginx
      -> docker
      -> ssh
      -> cron or cronie
      -> custom app services

systemctl
  -> command tool used to control systemd

journalctl
  -> command tool used to read logs collected by systemd-journald`,
        },
        {
          kind: "text",
          bullets: [
            "systemd is the service manager daemon.",
            "systemctl is the command-line control tool.",
            "journalctl is the command-line log reader.",
            "Nginx, Docker, cron, and custom apps can all run as services managed by systemd.",
          ],
        },
      ],
    },
    {
      title: "Check PID 1",
      blocks: [
        {
          kind: "text",
          text: [
            "PID 1 is usually systemd on modern Arch and Ubuntu systems. It may appear as /sbin/init because that path points to systemd.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ps -p 1 -o pid,comm,args
ls -l /sbin/init
readlink -f /sbin/init`,
        },
        {
          kind: "text",
          text: ["Example output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `PID COMMAND  COMMAND
1   systemd  /sbin/init

/sbin/init -> ../lib/systemd/systemd
/usr/lib/systemd/systemd`,
        },
      ],
    },
    {
      title: "Common systemctl commands",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `systemctl status nginx
systemctl status docker
systemctl status my-app.service

sudo systemctl start my-app.service
sudo systemctl stop my-app.service
sudo systemctl restart my-app.service

sudo systemctl enable my-app.service
sudo systemctl disable my-app.service

sudo systemctl daemon-reload
sudo systemctl reset-failed`,
        },
        {
          kind: "table",
          headers: ["Command", "Use"],
          rows: [
            ["status", "Show service state, recent logs, and main process"],
            ["start", "Start a stopped service"],
            ["stop", "Stop a running service"],
            ["restart", "Stop and start the service process"],
            ["reload", "Ask a service to re-read its own config if supported"],
            ["enable", "Start service automatically on boot"],
            ["disable", "Prevent service from starting on boot"],
            ["daemon-reload", "Reload systemd unit definitions"],
            ["reset-failed", "Clear old failed-state records"],
          ],
        },
      ],
    },
    {
      title: "daemon-reload, restart, and reload",
      blocks: [
        {
          kind: "text",
          bullets: [
            "daemon-reload refreshes systemd unit definitions. It does not restart running services.",
            "restart restarts the actual service process.",
            "reload asks a running service to re-read its own config if the service supports reload.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl daemon-reload
sudo systemctl restart my-app.service
sudo systemctl reload nginx`,
        },
        {
          kind: "text",
          text: ["Use both daemon-reload and restart after changing a .service file."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/my-app.service
sudo systemctl daemon-reload
sudo systemctl restart my-app.service
sudo systemctl status my-app.service`,
        },
        {
          kind: "text",
          text: ["Use only restart when the app code changed but the .service file did not change."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl restart my-app.service
sudo systemctl status my-app.service`,
        },
      ],
    },
    {
      title: "Create a systemd service",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a service file under /etc/systemd/system for custom application services.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/my-app.service`,
        },
        {
          kind: "text",
          text: ["Example service file:"],
        },
        {
        kind: "code",
        language: "bash",
        code: `[Unit]
        Description=My App Service
        After=network.target

        [Service]
        WorkingDirectory=/home/ubuntu/my-app
        ExecStart=/home/ubuntu/my-app/.venv/bin/python app.py
        Restart=always
        RestartSec=5
        User=ubuntu
        EnvironmentFile=/home/ubuntu/my-app/.env

        [Install]
        WantedBy=multi-user.target`,
        },
        {
          kind: "text",
          text: ["Load the new definition, start it, enable it on boot, and inspect status."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl daemon-reload
sudo systemctl start my-app.service
sudo systemctl enable my-app.service
sudo systemctl status my-app.service`,
        },
      ],
    },
    {
      title: "Update a systemd service",
      blocks: [
        {
          kind: "text",
          text: [
            "If the service file changes, reload systemd definitions and restart the service process.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/systemd/system/my-app.service
sudo systemctl daemon-reload
sudo systemctl restart my-app.service
sudo systemctl status my-app.service`,
        },
        {
          kind: "text",
          text: [
            "If only application code changed, restart the service without daemon-reload.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl restart my-app.service
sudo systemctl status my-app.service`,
        },
      ],
    },
    {
      title: "Remove a systemd service",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop the service, disable boot startup, confirm the unit file path, remove the unit file, reload systemd definitions, and clear failed state if needed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl stop service-name.service
sudo systemctl disable service-name.service
sudo systemctl cat service-name.service
sudo rm /etc/systemd/system/service-name.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
systemctl status service-name.service`,
        },
        {
          kind: "text",
          text: ["Expected final output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Unit service-name.service could not be found.`,
        },
      ],
    },
    {
      title: "Remove multiple custom services",
      blocks: [
        {
          kind: "text",
          text: [
            "Use one command per phase when removing a group of related services.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl stop app-backend.service app-worker.service app-beat.service app-frontend.service

sudo systemctl disable app-backend.service app-worker.service app-beat.service app-frontend.service

sudo rm /etc/systemd/system/app-backend.service
sudo rm /etc/systemd/system/app-worker.service
sudo rm /etc/systemd/system/app-beat.service
sudo rm /etc/systemd/system/app-frontend.service

sudo systemctl daemon-reload
sudo systemctl reset-failed`,
        },
        {
          kind: "text",
          text: ["Confirm no matching units remain."],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl list-unit-files | grep app
systemctl list-units --all | grep app`,
        },
      ],
    },
    {
      title: "Nginx as a systemd service",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Nginx is installed server software.",
            "nginx.service is the systemd service that runs Nginx.",
            "systemctl manages the Nginx service lifecycle.",
            "Nginx usually acts as the public entry point for web traffic.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
sudo systemctl disable nginx

systemctl cat nginx`,
        },
      ],
    },
    {
      title: "Nginx config locations",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `/etc/nginx/nginx.conf
/etc/nginx/sites-available/
/etc/nginx/sites-enabled/`,
        },
        {
          kind: "text",
          bullets: [
            "sites-available stores site config files.",
            "sites-enabled stores symlinks to active site configs.",
            "A file in sites-available is inactive unless it is linked from sites-enabled.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls /etc/nginx/sites-available
ls -l /etc/nginx/sites-enabled`,
        },
      ],
    },
    {
      title: "Remove an Nginx site config",
      blocks: [
        {
          kind: "text",
          text: [
            "Remove the enabled symlink first, then remove the available config file. Test before reloading Nginx.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -l /etc/nginx/sites-enabled | grep example-site

sudo rm -f /etc/nginx/sites-enabled/example-site.conf
sudo rm -f /etc/nginx/sites-available/example-site.conf

sudo nginx -t
sudo systemctl reload nginx`,
        },
        {
          kind: "text",
          text: ["Expected nginx -t output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful`,
        },
      ],
    },
    {
      title: "Default Nginx site",
      blocks: [
        {
          kind: "text",
          bullets: [
            "The default file can stay in sites-available as a reference.",
            "It is inactive if it is not linked from sites-enabled.",
            "Remove only the sites-enabled/default symlink if the default site is active and not needed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -l /etc/nginx/sites-enabled

sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx`,
        },
      ],
    },
    {
      title: "Why Nginx is used in production",
      blocks: [
        {
          kind: "text",
          text: [
            "In development, apps are often accessed directly on localhost ports. In production, users usually access Nginx on ports 80 and 443, then Nginx forwards traffic to internal app ports.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Development:

Browser
  -> http://localhost:3000
  -> http://localhost:8000

Production:

Browser
  -> https://example.com
    -> Nginx on port 443
      -> frontend app on localhost or Docker
      -> backend app on localhost or Docker`,
        },
        {
          kind: "text",
          bullets: [
            "Nginx handles public ports 80 and 443.",
            "Nginx can handle HTTPS certificates.",
            "Nginx routes domains and paths to the correct app.",
            "Nginx keeps app ports hidden from the public internet.",
            "Nginx can reload config without fully restarting the service.",
          ],
        },
      ],
    },
    {
      title: "AWS ALB and Nginx",
      blocks: [
        {
          kind: "text",
          bullets: [
            "AWS Application Load Balancer can replace Nginx as the public reverse proxy in many AWS-native setups.",
            "ALB is useful with multiple EC2 instances, ECS services, target groups, health checks, and autoscaling.",
            "Nginx is often simpler for a single EC2 instance.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Single EC2 pattern:

Browser
  -> Nginx on EC2
    -> app services or Docker containers

AWS ALB pattern:

Browser
  -> AWS Application Load Balancer
    -> EC2 instance
    -> ECS task
    -> target group`,
        },
      ],
    },
    {
      title: "Process and PID inspection",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `ps aux
ps -p 1 -o pid,comm,args

ps aux | grep nginx
ps aux | grep docker
ps aux | grep node

ps aux | grep '[n]ginx'

pgrep nginx
pgrep -a nginx

pstree -p

top
htop`,
        },
        {
          kind: "text",
          text: [
            "Install helper tools on Arch if needed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S psmisc htop`,
        },
      ],
    },
    {
      title: "Kernel threads in ps output",
      blocks: [
        {
          kind: "text",
          text: [
            "Processes shown inside square brackets are usually kernel threads, not normal user services.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `root           1  0.0  0.0  26452 15516 ? Ss Apr30 0:03 /sbin/init
root           2  0.0  0.0      0     0 ? S  Apr30 0:00 [kthreadd]
root           3  0.0  0.0      0     0 ? S  Apr30 0:00 [pool_workqueue]
root          15  0.0  0.0      0     0 ? S  Apr30 0:01 [ksoftirqd/0]`,
        },
        {
          kind: "text",
          bullets: [
            "PID 1 is usually systemd or /sbin/init.",
            "PID 2 is kthreadd, the kernel thread manager.",
            "kworker entries are kernel worker threads.",
            "ksoftirqd entries are kernel interrupt handling workers.",
          ],
        },
      ],
    },
    {
      title: "Check listening ports",
      blocks: [
        {
          kind: "text",
          text: [
            "Use ss to see which processes listen on ports. Add sudo to see process names clearly.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ss -ltnp
sudo ss -ltnp

sudo ss -ltnp | grep 3000
sudo ss -ltnp | grep 8000
sudo ss -ltnp | grep 80
sudo ss -ltnp | grep 443`,
        },
      ],
    },
    {
      title: "journalctl and systemd-journald",
      blocks: [
        {
          kind: "text",
          bullets: [
            "systemd-journald is the background log collection daemon.",
            "journalctl is the command used to read logs.",
            "Use journalctl for services managed directly by systemd.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -u nginx
journalctl -u docker
journalctl -u my-app.service

journalctl -u my-app.service -f
journalctl -u my-app.service -n 100
journalctl -u my-app.service --since "1 hour ago"
journalctl -u my-app.service --since today

journalctl -b
journalctl -u my-app.service -b`,
        },
        {
          kind: "text",
          text: ["Check journald itself:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl status systemd-journald
ps aux | grep '[s]ystemd-journald'`,
        },
      ],
    },
    {
      title: "Docker logs and journal logs",
      blocks: [
        {
          kind: "text",
          bullets: [
            "journalctl -u docker shows Docker daemon logs.",
            "docker compose logs shows logs from application containers.",
            "Use Docker logs for app exceptions inside containers.",
            "Use journalctl -u docker for Docker engine, network, image, and daemon problems.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemd
  -> docker.service
    -> Docker daemon
      -> containers
        -> backend app
        -> frontend app`,
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -u docker -f

docker compose logs -f backend
docker compose logs -f frontend

docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend`,
        },
      ],
    },
    {
      title: "Cron and cronie",
      blocks: [
        {
          kind: "text",
          bullets: [
            "cron is a time-based command scheduler.",
            "cronie is a common cron implementation on Arch.",
            "crontab edits the current user's scheduled jobs.",
            "Cron uses the system's local timezone by default.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S cronie
sudo systemctl enable --now cronie
systemctl status cronie

crontab -e
crontab -l`,
        },
        {
          kind: "text",
          text: ["Use nano if vi is missing."],
        },
        {
          kind: "code",
          language: "bash",
          code: `EDITOR=nano crontab -e

echo 'export EDITOR=nano' >> ~/.bashrc
source ~/.bashrc`,
        },
      ],
    },
    {
      title: "Cron time format",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `minute hour day-of-month month day-of-week command`,
        },
        {
          kind: "text",
          text: ["Example: run a Python script every day at 03:00."],
        },
        {
          kind: "code",
          language: "bash",
          code: `0 3 * * * /home/example/project/.venv/bin/python /home/example/project/scripts/daily_job.py`,
        },
        {
          kind: "text",
          text: ["Check local system time and timezone."],
        },
        {
          kind: "code",
          language: "bash",
          code: `date
timedatectl
timedatectl | grep "Time zone"`,
        },
        {
          kind: "text",
          text: ["Set timezone if needed."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo timedatectl set-timezone Europe/Istanbul`,
        },
      ],
    },
    {
      title: "Cron logging pattern",
      blocks: [
        {
          kind: "text",
          text: [
            "Redirect command output to a log file when running scripts from cron. This keeps print output and errors easy to inspect.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p /home/example/project/logs`,
        },
        {
          kind: "code",
          language: "bash",
          code: `0 3 * * * cd /home/example/project && /home/example/project/.venv/bin/python scripts/daily_job.py >> logs/daily_job.log 2>&1`,
        },
        {
          kind: "text",
          bullets: [
            ">> appends normal output to the log file.",
            "2>&1 sends error output to the same log file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `tail -f /home/example/project/logs/daily_job.log

journalctl -u cronie --since today`,
        },
      ],
    },
    {
      title: "Cron versus Celery",
      blocks: [
        {
          kind: "table",
          headers: ["Use case", "Better tool"],
          rows: [
            ["Run one Python script every day", "cron"],
            ["Run backup or cleanup commands", "cron"],
            ["Send verification email after user registration", "Celery"],
            ["Process uploads or reports in the background", "Celery"],
            ["Retry failed external API work", "Celery"],
            ["Schedule app-level tasks with workers", "Celery beat"],
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cron
  At this time, run this shell command.

Celery
  Put this app task into a background queue.

Celery beat
  At this time, put this app task into the Celery queue.

Redis
  Broker where Celery tasks wait.

Celery worker
  Process that consumes queued tasks.`,
        },
        {
          kind: "text",
          text: [
            "For web apps, slow or retryable work should usually move out of the request and into a background worker.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `User registers
  -> backend creates user
  -> backend queues send_verification_email task
  -> backend returns response quickly

Celery worker
  -> sends email separately
  -> retries if needed`,
        },
      ],
    },
    {
      title: "Quick service cleanup checklist",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl stop example.service
sudo systemctl disable example.service
sudo systemctl cat example.service
sudo rm /etc/systemd/system/example.service
sudo systemctl daemon-reload
sudo systemctl reset-failed
systemctl status example.service`,
        },
        {
          kind: "text",
          text: ["Expected final output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Unit example.service could not be found.`,
        },
      ],
    },
    {
      title: "Quick Nginx cleanup checklist",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `ls -l /etc/nginx/sites-enabled | grep example

sudo rm -f /etc/nginx/sites-enabled/example.conf
sudo rm -f /etc/nginx/sites-available/example.conf

sudo nginx -t
sudo systemctl reload nginx

ls /etc/nginx/sites-available
ls -l /etc/nginx/sites-enabled`,
        },
      ],
    },
    {
      title: "Debug command set",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `systemctl status nginx
systemctl status docker
systemctl list-unit-files | grep example
systemctl list-units --all | grep example

journalctl -u nginx -n 100
journalctl -u docker -n 100

docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend

ps -p 1 -o pid,comm,args
ps aux | grep '[n]ginx'
pgrep -a nginx

sudo ss -ltnp
sudo ss -ltnp | grep 8000`,
        },
      ],
    },
    {
      title: "Reference paths",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Custom systemd units: /etc/systemd/system/",
            "Packaged systemd units on Arch: /usr/lib/systemd/system/",
            "Nginx main config: /etc/nginx/nginx.conf",
            "Nginx available sites: /etc/nginx/sites-available/",
            "Nginx enabled sites: /etc/nginx/sites-enabled/",
            "User crontab editor: crontab -e",
            "Docker Compose logs: docker compose logs",
            "Systemd service logs: journalctl -u service-name",
          ],
        },
      ],
    },
  ],
}

export default entry
import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "docker-resource-diagnostics-cleanup",
  kind: "codenote",
  name: "Docker Resource Diagnostics and Cleanup",
  desc: "Check Linux memory, disk, Docker cache, containerd storage, and live CPU usage, then clean Docker safely on servers and local dev machines.",
  intro:
    "Use this workflow when Docker builds, worktrees, agents, dev stacks, or services have been running for a while and the machine needs a resource check. It is useful on small EC2 or VPS servers with limited disk and RAM, and also on local Linux development machines where Docker cache and unused containers can grow over time.",
  sections: [
    {
      title: "When to use it",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Before moving a service such as MySQL from managed hosting to local Docker.",
            "After many Docker builds, worktrees, agents, or dev stacks.",
            "When an EC2 or VPS machine feels slow or has a small root disk.",
            "When local Docker development starts consuming unexpected disk or CPU.",
            "When htop and Docker show high CPU but a whole-system monitor shows a lower total percentage.",
          ],
        },
      ],
    },
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# memory and disk
free -h
df -h

# live Docker usage
docker stats --no-stream
docker system df

# find large root, var, Docker, and containerd paths
sudo du -x -h --max-depth=1 / | sort -h
sudo du -h --max-depth=1 /var | sort -h
sudo du -h --max-depth=1 /var/lib | sort -h
sudo du -h --max-depth=1 /var/lib/docker | sort -h
sudo du -h --max-depth=1 /var/lib/containerd | sort -h

# conservative Docker cleanup
docker builder prune
docker container prune
docker image prune
docker system prune

# re-check
df -h
docker system df`,
        },
      ],
    },
    {
      title: "Check memory and disk",
      blocks: [
        {
          kind: "text",
          text: [
            "For memory, the important value is available. Linux uses unused memory for buff/cache, which is usually normal. On a small server, available memory comfortably above 1 GB is a good sign.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `free -h`,
        },
        {
          kind: "text",
          text: [
            "Check mounted filesystems next. On small EC2 or VPS disks, disk can become the bottleneck before RAM. Keeping the root filesystem below about 70 to 80 percent leaves room for logs, Docker layers, package cache, and temporary files.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `df -h`,
        },
      ],
    },
    {
      title: "Check Docker usage",
      blocks: [
        {
          kind: "text",
          text: [
            "docker stats shows live CPU and memory usage per container. Docker CPU percentage is per logical CPU core, not always the percentage of the whole machine.",
          ],
        },
        {
          kind: "table",
          headers: ["Docker CPU", "Meaning"],
          rows: [
            ["50%", "Half of one logical CPU core"],
            ["100%", "One full logical CPU core"],
            ["200%", "Two full logical CPU cores"],
            ["100% on 16 threads", "About 1/16 of total CPU capacity"],
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker stats --no-stream`,
        },
        {
          kind: "text",
          text: [
            "docker system df summarizes images, containers, volumes, and build cache. SIZE is current usage. RECLAIMABLE is what Docker thinks can be removed. Build cache is often safe to clean. Volumes can contain databases and should be treated carefully.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker system df`,
        },
      ],
    },
    {
      title: "Find disk growth",
      blocks: [
        {
          kind: "text",
          text: [
            "Start from the root filesystem, then inspect /var and /var/lib. Use -x when scanning / so du stays on the same filesystem and avoids mounted pseudo-filesystems. Some /proc or /run warnings are normal if / is scanned without -x.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo du -x -h --max-depth=1 / | sort -h

sudo du -h --max-depth=1 /var | sort -h
sudo du -h --max-depth=1 /var/lib | sort -h`,
        },
        {
          kind: "text",
          bullets: [
            "/var/lib/docker contains Docker images, containers, overlay layers, volumes, and build-related data.",
            "/var/lib/containerd can also grow, especially from downloaded image blobs and unpacked filesystem layers.",
            "/var/log, /var/cache, /var/lib/mysql, /var/lib/postgresql, and /var/lib/snapd can also be large depending on the machine.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo du -h --max-depth=1 /var/lib/docker | sort -h
sudo du -h --max-depth=1 /var/lib/containerd | sort -h`,
        },
        {
          kind: "table",
          headers: ["containerd path", "What it usually holds"],
          rows: [
            ["io.containerd.content.v1.content", "Downloaded image blobs and layers"],
            ["io.containerd.snapshotter.v1.overlayfs", "Unpacked container and image filesystem layers"],
          ],
        },
      ],
    },
    {
      title: "Clean Docker safely",
      blocks: [
        {
          kind: "text",
          text: [
            "Start with the safest cleanup. Build cache is usually the first thing to remove because it does not delete running containers, active images, Docker volumes, databases, env files, or source code. The tradeoff is that the next Docker build may be slower.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker builder prune

# non-interactive
docker builder prune -f`,
        },
        {
          kind: "table",
          headers: ["Command", "What it removes"],
          rows: [
            ["docker container prune", "Stopped containers only"],
            ["docker image prune", "Dangling images only"],
            ["docker system prune", "Stopped containers, unused networks, dangling images, and build cache"],
            ["docker image prune -a", "All unused images, not images used by running containers"],
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker container prune
docker image prune
docker system prune

# more aggressive
docker image prune -a`,
        },
        {
          kind: "text",
          text: [
            "Avoid volume cleanup by default. Unused Docker volumes may contain old local databases, Qdrant data, Redis data, or experiment state.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Do not run this unless the volumes are definitely disposable.
# docker system prune -a --volumes`,
        },
      ],
    },
    {
      title: "Re-check after cleanup",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `df -h
docker system df
sudo du -h --max-depth=1 /var/lib/containerd | sort -h
sudo du -h --max-depth=1 /var/lib/docker | sort -h`,
        },
      ],
    },
    {
      title: "Read CPU correctly",
      blocks: [
        {
          kind: "text",
          text: [
            "htop process CPU is usually per logical CPU core. Whole-system monitors such as Mission Center usually show total CPU across all CPU threads. Both views can be correct at the same time.",
          ],
        },
        {
          kind: "table",
          headers: ["Process CPU", "Meaning"],
          rows: [
            ["70%", "0.7 of one logical CPU"],
            ["100%", "One full logical CPU"],
            ["200%", "Two full logical CPUs"],
            ["Two processes at 70% on 16 threads", "About 1.4 logical CPUs, or about 8.75 percent of total CPU capacity"],
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Ubuntu/Debian
sudo apt install htop

# Arch
sudo pacman -S htop

htop`,
        },
      ],
    },
    {
      title: "Map CPU to a container",
      blocks: [
        {
          kind: "text",
          text: [
            "When htop shows a busy process, inspect the PID and check whether it belongs to a container. Replace PID_HERE with the process ID from htop.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ps -fp PID_HERE
cat /proc/PID_HERE/cgroup`,
        },
        {
          kind: "code",
          language: "bash",
          code: `for c in $(docker ps --format '{{.Names}}')
do
  echo "=== $c ==="
  docker top "$c" | grep -E 'PID_HERE' || true
done`,
        },
        {
          kind: "text",
          text: ["Then check the suspected container logs."],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker logs --tail=100 CONTAINER_NAME

docker logs --tail=100 project-wt1-backend
docker logs --tail=100 project-wt2-backend
docker logs --tail=100 automation-service`,
        },
      ],
    },
    {
      title: "Watch reload CPU",
      blocks: [
        {
          kind: "text",
          text: [
            "uvicorn --reload can cause steady CPU usage because it watches files. Inside Docker this can be heavier if the watched directory includes mounted source code, .git, .venv, node_modules, generated files, cache folders, or large worktrees.",
          ],
          bullets: [
            "Use --reload only for the backend you are actively editing.",
            "Run other worktree or backend containers without reload.",
            "Never use --reload in production.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker inspect CONTAINER_NAME --format '{{.Config.Cmd}}'`,
        },
        {
          kind: "code",
          language: "bash",
          code: `# production-style FastAPI command
gunicorn -k uvicorn.workers.UvicornWorker -w 2 -b 0.0.0.0:8000 main:app

# plain non-reload Uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000

# dev reload with common exclusions
uvicorn main:app \\
  --host 0.0.0.0 \\
  --port 8000 \\
  --reload \\
  --reload-exclude .git \\
  --reload-exclude .venv \\
  --reload-exclude node_modules \\
  --reload-exclude __pycache__ \\
  --reload-exclude .pytest_cache`,
        },
      ],
    },
    {
      title: "Stop unused stacks",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop containers that are not actively needed. For local development, this is often better than trying to optimize every idle worktree service.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker stop CONTAINER_NAME

docker stop project-wt1-backend project-wt1-frontend
docker stop project-wt2-backend project-wt2-frontend`,
        },
        {
          kind: "text",
          text: ["Or stop a Compose stack from the relevant project directory."],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose down`,
        },
      ],
    },
    {
      title: "Check Node service CPU",
      blocks: [
        {
          kind: "text",
          text: [
            "If htop shows a long-running node process, a workflow service or other Node-based container may be the active CPU user. A process at 100 percent means about one logical CPU core. On a 16-thread machine that is about 6.25 percent of total CPU capacity.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker stats --no-stream | grep -i service-name
docker logs --tail=100 automation-service`,
        },
        {
          kind: "code",
          language: "bash",
          code: `# if not needed
docker stop automation-service

# if it should be running but seems busy
docker restart automation-service
docker logs --tail=100 automation-service`,
        },
      ],
    },
  ],
}

export default entry

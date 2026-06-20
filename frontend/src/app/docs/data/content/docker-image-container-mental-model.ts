import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "docker-image-container-mental-model",
  kind: "codenote",
  name: "Docker Image and Container Mental Model",
  desc: "Understand Docker Hub, images, containers, tags, mounts, ports, startup commands, and common docker run flags.",
  intro:
    "Use this note as a practical mental model for pulling and running containers. It explains what Docker downloads, what starts at runtime, where data lives, and how common docker run flags change the container.",
  sections: [
    {
      title: "Image vs container",
      blocks: [
        {
          kind: "table",
          headers: ["Concept", "Meaning"],
          rows: [
            ["Image", "Packaged application template with userland, app files, libraries, dependencies, startup scripts, and default ENTRYPOINT or CMD"],
            ["Container", "A running instance created from an image"],
            ["Disposable container", "Container removed after exit, usually with --rm"],
            ["Persistent data", "Data kept outside the disposable container through bind mounts or named volumes"],
          ],
        },
      ],
    },
    {
      title: "Registries and pull",
      blocks: [
        {
          kind: "text",
          text: [
            "docker pull downloads an image from a container registry. Docker Hub is the default registry when no registry hostname is provided.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker pull owner/image-name

# Equivalent default form
docker pull docker.io/owner/image-name:latest

# General form
docker pull registry/namespace/image:tag`,
        },
        {
          kind: "code",
          language: "bash",
          code: `docker pull nginx
docker pull postgres:16
docker pull redis:7-alpine
docker pull docker.io/library/ubuntu:24.04
docker pull ghcr.io/owner/image:tag`,
        },
      ],
    },
    {
      title: "Pull vs run",
      blocks: [
        {
          kind: "table",
          headers: ["Command", "Effect"],
          rows: [
            ["docker pull image-name", "Downloads or updates the image locally"],
            ["docker run image-name", "Creates and starts a new container from the image"],
            ["docker run missing-image", "Pulls automatically first, then starts the container"],
          ],
        },
        {
          kind: "text",
          text: [
            "Use explicit docker pull when you want to update the local image before running it.",
          ],
        },
      ],
    },
    {
      title: "Tags and layers",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `docker pull image-name:latest
docker pull image-name:1.2.3`,
        },
        {
          kind: "text",
          bullets: [
            "latest is convenient but can change over time.",
            "Fixed tags are better for stable deployments.",
            "Images are built in layers such as base distro, system packages, language runtime, app code, and startup scripts.",
            "docker pull downloads only missing or changed layers.",
          ],
        },
      ],
    },
    {
      title: "Container OS and host kernel",
      blocks: [
        {
          kind: "text",
          text: [
            "The image provides the container userland, such as Debian, Ubuntu, Alpine, or Fedora. The host provides the Linux kernel. An Ubuntu container on an Arch host runs Ubuntu binaries and libraries while sharing the Arch host kernel.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run --rm image-name cat /etc/os-release
docker run --rm image-name uname -a`,
        },
        {
          kind: "text",
          bullets: [
            "/etc/os-release shows the container distro.",
            "uname -a shows the host kernel because Linux containers share the host kernel.",
          ],
        },
      ],
    },
    {
      title: "Startup behavior",
      blocks: [
        {
          kind: "text",
          text: [
            "ENTRYPOINT and CMD define what starts by default when the container runs.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker inspect image-name --format '
Entrypoint: {{json .Config.Entrypoint}}
Cmd:        {{json .Config.Cmd}}
WorkingDir: {{json .Config.WorkingDir}}
'`,
        },
        {
          kind: "code",
          language: "bash",
          code: `# Use the default image startup behavior
docker run image-name

# Start a shell instead of the default application
docker run -it --rm --entrypoint bash image-name
docker run -it --rm --entrypoint sh image-name

# Pass command arguments to the image's default entrypoint behavior
docker run --rm image-name command args`,
        },
      ],
    },
    {
      title: "Interactive and disposable runs",
      blocks: [
        {
          kind: "table",
          headers: ["Flag", "Meaning"],
          rows: [
            ["-i", "Keep STDIN open"],
            ["-t", "Allocate a terminal"],
            ["-it", "Use for shells, CLIs, TUIs, REPLs, and interactive agents"],
            ["--rm", "Remove the container automatically after it exits"],
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm image-name
docker run image-name`,
        },
      ],
    },
    {
      title: "Bind mounts",
      blocks: [
        {
          kind: "text",
          text: [
            "A bind mount makes a host path appear inside the container. Reads and writes are bidirectional.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  -v "$HOME/my-data:/data" \\
  image-name`,
        },
        {
          kind: "table",
          headers: ["Host path", "Container path"],
          rows: [
            ["$HOME/my-data", "/data"],
            ["$HOME/my-data/file.txt", "/data/file.txt"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "If the image already has files at /data, the bind mount hides those image files while the mount is active.",
            "The mounted path is the host folder, not image contents plus host contents.",
          ],
        },
      ],
    },
    {
      title: "Named volumes",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `docker volume create app-data

docker run -it --rm \\
  -v app-data:/data \\
  image-name`,
        },
        {
          kind: "table",
          headers: ["Storage type", "Best use"],
          rows: [
            ["Bind mount", "Explicit host paths, projects, configs, and local files you want to inspect from the host"],
            ["Named volume", "Docker-managed persistent data for databases and app state"],
          ],
        },
      ],
    },
    {
      title: "Workspace pattern",
      blocks: [
        {
          kind: "text",
          text: [
            "A common project pattern is to mount the current host folder into /workspace and start the container there.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  -v "$PWD:/workspace" \\
  -w /workspace \\
  image-name`,
        },
      ],
    },
    {
      title: "Environment and user",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `docker run --rm \\
  -e APP_ENV=development \\
  -e API_KEY="$API_KEY" \\
  image-name`,
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run --rm \\
  --user "$(id -u):$(id -g)" \\
  -v "$PWD:/workspace" \\
  image-name`,
        },
        {
          kind: "text",
          bullets: [
            "-e passes environment variables into the container for config, credentials, runtime settings, and user IDs.",
            "--user runs the process as the host UID and GID, which helps avoid root-owned files in bind-mounted folders.",
            "Some images use APP_UID and APP_GID style environment variables instead of --user.",
          ],
        },
      ],
    },
    {
      title: "Ports and background services",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Host port 8080 maps to container port 80
docker run --rm \\
  -p 8080:80 \\
  image-name

# Localhost-only binding on the host
docker run --rm \\
  -p 127.0.0.1:8080:80 \\
  image-name`,
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -d \\
  --name app-name \\
  --restart unless-stopped \\
  image-name`,
        },
        {
          kind: "text",
          bullets: [
            "-d runs the container in the background.",
            "--name gives the container a stable name.",
            "--restart unless-stopped restarts the container after reboot or crash unless it was manually stopped.",
          ],
        },
      ],
    },
    {
      title: "Inspect containers",
      blocks: [
        {
          kind: "table",
          headers: ["Command", "Use"],
          rows: [
            ["docker ps", "Show running containers"],
            ["docker ps -a", "Show running and stopped containers"],
            ["docker logs -f container-name", "Follow container logs"],
            ["docker exec -it container-name bash", "Enter a running container with bash"],
            ["docker exec -it container-name sh", "Enter a running container with sh"],
            ["docker inspect container-name", "Show container metadata"],
          ],
        },
      ],
    },
    {
      title: "Resolve name conflicts",
      blocks: [
        {
          kind: "text",
          text: [
            "Docker container names are unique across the Docker daemon. A stopped container can still hold a name.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker ps -a --filter "name=test"
docker rm -f test`,
        },
      ],
    },
    {
      title: "Inspect image contents",
      blocks: [
        {
          kind: "text",
          text: [
            "Start a temporary shell without mounts to inspect what the image ships by default.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  --entrypoint sh \\
  image-name`,
        },
        {
          kind: "code",
          language: "bash",
          code: `cat /etc/os-release
pwd
ls -lah /
ls -lah /opt
find / -maxdepth 2 -type d 2>/dev/null | head`,
        },
        {
          kind: "text",
          text: [
            "Add mounts when you want to compare raw image contents with runtime mounted contents.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  -v "$HOME/my-data:/data" \\
  --entrypoint sh \\
  image-name`,
        },
      ],
    },
    {
      title: "Clean up",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `docker system prune

docker volume ls
docker volume rm volume-name`,
        },
        {
          kind: "text",
          bullets: [
            "docker system prune removes unused containers, networks, images, and build cache.",
            "It does not remove active containers.",
            "Remove named volumes only when you are sure the stored data is no longer needed.",
          ],
        },
      ],
    },
    {
      title: "Mount safety",
      blocks: [
        {
          kind: "table",
          headers: ["Pattern", "Risk"],
          rows: [
            ["-v \"$PWD:/workspace\"", "Safer project-scoped workspace"],
            ["-v \"$HOME/safe-folder:/data\"", "Safer explicit data folder"],
            ["-v \"$HOME:/workspace\"", "Risky because it exposes the whole home directory"],
            ["-v \"/:/host\"", "Risky because it exposes the host root filesystem"],
            ["-v \"$HOME/.ssh:/root/.ssh\"", "Risky because it exposes SSH credentials"],
            ["-v \"/var/run/docker.sock:/var/run/docker.sock\"", "Risky because it gives host-level Docker control"],
            ["--privileged", "Very risky because it grants broad container privileges"],
            ["--network host", "Very risky because it removes normal network isolation"],
          ],
        },
        {
          kind: "text",
          text: [
            "Mount only what the container should access.",
          ],
        },
      ],
    },
    {
      title: "Reusable run template",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `docker run -it --rm \\
  --name app-test \\
  -e APP_ENV=development \\
  -v "$HOME/app-data:/data" \\
  -v "$PWD:/workspace" \\
  -w /workspace \\
  image-name:tag`,
        },
        {
          kind: "text",
          bullets: [
            "Replace app-test with the container name.",
            "Replace APP_ENV with the environment variables the image needs.",
            "Replace $HOME/app-data with a persistent data path if needed.",
            "Replace $PWD with the project or workspace path.",
            "Replace image-name:tag with the Docker Hub or registry image.",
          ],
        },
      ],
    },
  ],
}

export default entry

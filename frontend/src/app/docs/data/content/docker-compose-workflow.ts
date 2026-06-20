import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "docker-compose-workflow",
  kind: "codenote",
  name: "Docker Compose Daily Workflow",
  desc: "Docker Compose commands on a Linux host for starting, entering, inspecting, and stopping services.",
  intro:
    "This workflow assumes the project is running through Docker Compose and compose.yaml is the entry point for the stack.",
  sections: [
    {
      title: "Start the stack",
      blocks: [
        {
          kind: "text",
          text: [
            "Navigate to the project folder first. Docker Compose always reads the compose.yaml in the current directory, so running commands from the wrong location will either fail or affect the wrong project.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/your-project`,
        },
        {
          kind: "text",
          text: ["Start in detached mode, reusing existing images if available:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up -d
# -d: detach`,
        },
        {
          kind: "text",
          text: ["Force a rebuild when Dockerfiles, dependencies, or package lockfiles have changed:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up -d --build`,
        },
      ],
    },
    {
      title: "Check status and service names",
      blocks: [
        {
          kind: "text",
          text: [
            "Use docker compose ps to check the process status of containers that belong to the Compose project in the current directory.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose ps
# ps: process status `,
        },
        {
          kind: "text",
          text: [
            "The command is project scoped. It reads the Compose project from the current folder, usually compose.yaml, and shows only the containers managed by that Compose project.",
          ],
        },
        {
          kind: "text",
          text: [
            "Use docker compose config --services when you need the exact service names from the Compose file. These names are used with commands like exec, logs, restart, and stop.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose config --services`,
        },
        {
          kind: "text",
          text: [
            "Use docker ps when you need a system level view of all running containers on the Docker host, including containers started by other Compose projects.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker ps`,
        },
        {
          kind: "text",
          bullets: [
            "docker compose ps shows containers for the current Compose project.",
            "docker ps shows all running containers globally on the Docker host.",
            "Multiple Compose projects can run at the same time.",
            "Host ports must be unique. For example, only one running container can bind host port 3306.",
            "Container ports can be the same across containers because each container has its own network namespace.",
          ],
        },
      ],
    },
    {
      title: "Enter a container",
      blocks: [
        {
          kind: "text",
          text: [
            "Enter a running service container to work inside its environment. Commands run here use the container's tools, paths, and installed packages.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec <service-name> bash`,
        },
        {
          kind: "text",
          text: ["If bash is not available in the container, use sh instead:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec <service-name> sh`,
        },
        {
          kind: "text",
          text: ["Once inside, verify your location and check available files:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `pwd
ls`,
        },
      ],
    },
    {
      title: "Follow logs",
      blocks: [
        {
          kind: "text",
          text: [
            "Stream live output from a service without entering. Can be used to follow server output or to debug startup issues.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose logs -f <service-name>`,
        },
      ],
    },
    {
      title: "Stop the stack",
      blocks: [
        {
          kind: "text",
          text: [
            "Stop and remove containers and the compose network entirely:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose down`,
        },
        {
          kind: "text",
          text: ["Stop containers without removing them:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose stop`,
        },
      ],
    },
    {
      title: "Typical daily sequence",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `cd ~/your-project
docker compose up -d
docker compose ps
docker compose exec backend bash
docker compose exec frontend bash`,
        },
        {
          kind: "text",
          bullets: [
            "After a reboot, containers do not restart automatically unless restart policies are configured.",
            "docker compose exec requires the container to already be running.",
          ],
        },
      ],
    },
  ],
}

export default entry
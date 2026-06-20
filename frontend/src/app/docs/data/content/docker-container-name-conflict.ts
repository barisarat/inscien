import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "docker-container-name-conflict",
  kind: "codenote",
  name: "Docker Container Name Conflict",
  desc: "Resolve 'container name already in use' errors caused by leftover containers when docker compose up fails to recreate services.",
  intro:
    "When docker-compose.yml uses fixed container_name values, those names must be unique across the entire Docker daemon. Old containers from a previous project state can block new ones from being created, even after a successful image build.",
  sections: [
    {
      title: "Typical error",
      blocks: [
        {
          kind: "text",
          text: [
            "The image builds successfully, then container creation fails with a message like:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Error response from daemon: Conflict. The container name "/my_project" is already in use ...`,
        },
      ],
    },
    {
      title: "List existing containers",
      blocks: [
        {
          kind: "text",
          text: ["Show all containers on the system, including stopped ones."],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker ps -a`,
        },
        {
          kind: "text",
          text: ["Filter to the names likely in conflict if needed. Adjust the pattern to match your service and project names."],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker ps -a | grep -E 'frontend|backend|redis|mysql'`,
        },
      ],
    },
    {
      title: "Remove conflicting containers",
      blocks: [
        {
          kind: "text",
          text: [
            "Force remove the containers holding the names. This frees the fixed names so new ones can be created.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker rm -f my_project 2>/dev/null`,
        },
      ],
    },
    {
      title: "Rebuild and recreate",
      blocks: [
        {
          kind: "text",
          text: [
            "With the old names freed, recreate the stack. The --build flag is only needed if code, Dockerfile, or compose config changed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose up --build`,
        },
      ],
    },
  ],
}

export default entry
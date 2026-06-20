import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "port-in-use",
  kind: "codenote",
  name: "Port Already in Use",
  desc: "Find and kill the process using a port with PIDs.",
  intro:
    "This operation is to free a selected port already in use. A simple alternative is to start your app on a different port but in this case we will see how to free up the port your app wants to use.",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo lsof -i :8000        # find process + PID on port 8000
sudo ss -ltnp | grep 8000 # alternative
sudo fuser 8000/tcp       # one-shot: just print the PID
sudo fuser -k 8000/tcp    # one-shot: find and kill in one step

kill <PID>                # stop the process
kill -9 <PID>             # force-kill if it ignores kill`,
        },
      ],
    },
    {
      title: "Why sudo is needed",
      blocks: [
        {
          kind: "text",
          text: [
            "Running ss or lsof without sudo shows the port is occupied but hides the PID and process name. You need elevated privileges to see which process owns the socket.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo ss -ltnp | grep 8000
sudo lsof -i :8000`,
        },
        {
          kind: "text",
          text: [
            "The output will show the process name (e.g. python, uvicorn, docker-proxy) and the PID.",
          ],
        },
      ],
    },
    {
      title: "Kill by PID",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `kill <PID>
kill -9 <PID>   # if the process ignores the first kill`,
        },
      ],
    },
    {
      title: "One-shot with fuser",
      blocks: [
        {
          kind: "text",
          text: ["fuser skips the find then kill two step run:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo fuser 8000/tcp        # print PID only
sudo fuser -k 8000/tcp    # kill it directly`,
        },
      ],
    },
  ],
}

export default entry
import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "ollama-local-api",
  kind: "codenote",
  name: "Local Ollama API on Linux",
  desc: "Install Ollama, run it as a systemd service, pull models, and call the local API from curl and Python.",
  intro:
    "In this setup Ollama runs as a local HTTP API on http://localhost:11434. On Linux it integrates with systemd for automatic startup. Local access via API requires no authentication and model runs on GPU.",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Install
curl -fsSL https://ollama.com/install.sh | sh

# Service
systemctl status ollama
sudo systemctl start ollama
sudo systemctl enable ollama

# Models
ollama pull qwen2.5:7b-instruct-q4_K_M
ollama pull llama3.1:8b-instruct-q4_K_M
ollama list

# API checks
curl http://localhost:11434/api/tags
curl http://localhost:11434/api/ps
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "prompt": "Say hello world",
  "stream": false
}'`,
        },
      ],
    },
    {
      title: "Install",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `curl -fsSL https://ollama.com/install.sh | sh`,
        },
      ],
    },
    {
      title: "Service management",
      blocks: [
        {
          kind: "text",
          text: [
            "On Linux, Ollama runs as a systemd service. The API starts automatically on boot without needing to run ollama serve manually.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl status ollama          # check current status
sudo systemctl start ollama      # start now
sudo systemctl enable ollama     # enable on boot
journalctl -u ollama --no-pager -n 50  # view logs`,
        },
        {
          kind: "text",
          text: [
            "If ollama serve says the port is already in use, the systemd service is already running. Use the running service rather than starting a second server manually.",
          ],
        },
      ],
    },
    {
      title: "Pull models",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `ollama pull qwen2.5:7b-instruct-q4_K_M
ollama pull llama3.1:8b-instruct-q4_K_M
ollama list`,
        },
        {
          kind: "text",
          text: ["Run a model interactively from the terminal:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ollama run qwen2.5:7b-instruct-q4_K_M
ollama run llama3.1:8b-instruct-q4_K_M`,
        },
      ],
    },
    {
      title: "Check the API from curl",
      blocks: [
        {
          kind: "text",
          text: [
            "Once Ollama is running the API is available immediately. Key endpoints: /api/generate for generation, /api/tags for installed models, /api/ps for currently running models.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl http://localhost:11434/api/tags    # installed models
curl http://localhost:11434/api/ps      # running models`,
        },
        {
          kind: "code",
          language: "bash",
          code: `curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "prompt": "Say hello world",
  "stream": false
}'`,
        },
        {
          kind: "code",
          language: "bash",
          code: `curl http://localhost:11434/api/generate -d '{
  "model": "llama3.1:8b-instruct-q4_K_M",
  "prompt": "Say hello world",
  "stream": false
}'`,
        },
        {
          kind: "text",
          text: ["Pretty-print the JSON response:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -s http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "prompt": "Say hello world",
  "stream": false
}' | python -m json.tool`,
        },
      ],
    },
    {
      title: "Check from Python",
      blocks: [
        {
          kind: "text",
          text: [
            "To call the models, no special Ollama Python package is needed. A plain HTTP request is enough since Ollama exposes a local HTTP API. Install requests in your venv:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pip install requests`,
        },
        {
          kind: "code",
          language: "python",
          code: `import requests

url = "http://localhost:11434/api/generate"
payload = {
    "model": "qwen2.5:7b-instruct-q4_K_M",
    "prompt": "Say hello world",
    "stream": False
}

response = requests.post(url, json=payload, timeout=60)
response.raise_for_status()

print(response.json()["response"])`,
        },
        {
          kind: "text",
          text: ["Switch to Llama by changing only the model name:"],
        },
        {
          kind: "code",
          language: "python",
          code: `payload = {
    "model": "llama3.1:8b-instruct-q4_K_M",
    "prompt": "Say hello world",
    "stream": False
}`,
        },
      ],
    },
    {
      title: "Daily checklist",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `systemctl status ollama
ollama list
curl http://localhost:11434/api/tags
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5:7b-instruct-q4_K_M",
  "prompt": "Say hello world",
  "stream": false
}'`,
        },
      ],
    },
  ],
}

export default entry
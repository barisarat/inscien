import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "bizdocs-esign-container",
  kind: "codenote",
  name: "Bizdocs e-Signature in Docker",
  desc: "Run Bizdocs e-signature service in a Debian container on an Arch host, with ACS smart card reader access through pcscd and browser signing through localhost.",
  intro:
    "This workflow runs the Bizdocs e-signature service inside a Debian Docker container while keeping the Arch host clean. The host provides the smart card reader through pcscd and the container runs Bizdocs, GUI forwarding, Java, and signing tools. The normal browser on the host can sign documents through the Bizdocs local service.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use the Arch host only for Docker, X11 access, and pcscd.",
            "Use the Debian container for Bizdocs, GUI libraries, Java, and signing tools.",
            "Share the smart card reader with the container through /run/pcscd/pcscd.comm.",
            "Share documents and installers through ./work mounted as /work.",
            "Run Bizdocs inside the container and keep the host browser outside the container.",
            "Use network_mode: host so the host browser can reach the Bizdocs service on 127.0.0.1:2151.",
          ],
        },
      ],
    },
    {
      title: "Working result",
      blocks: [
        {
          kind: "text",
          text: [
            "The completed setup uses this chain. This confirms that signing can work from the normal host browser while Bizdocs runs inside the container.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Arch browser
-> http://127.0.0.1:2151
-> Bizdocs service inside Debian container
-> /run/pcscd/pcscd.comm from Arch host
-> ACS ACR39T / ACR39U reader
-> e-signature card
-> signed document`,
        },
      ],
    },
    {
      title: "Install host packages",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the low-level smart card stack on the Arch host. This keeps the reader support on the host and avoids installing the signing application directly on the host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S pcsclite ccid pcsc-tools xorg-xhost
sudo systemctl enable --now pcscd.service`,
        },
      ],
    },
    {
      title: "Test the smart card reader on the host",
      blocks: [
        {
          kind: "text",
          text: [
            "Plug in the ACS reader and insert the card. pcsc_scan should detect the reader, card state, and ATR. Stop the command with Ctrl+C after confirming the card is visible.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pcsc_scan`,
        },
        {
          kind: "text",
          text: [
            "A successful result shows the ACS reader and Card inserted. The reader may appear as ACR39T or ACR39U depending on the device firmware and driver reporting.",
          ],
        },
      ],
    },
    {
      title: "Create the workspace",
      blocks: [
        {
          kind: "text",
          text: [
            "Create one movable workspace for the compose file, installers, test PDFs, and signed outputs. The work folder is mounted into the container as /work.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/projects/esign/work
cd ~/projects/esign`,
        },
        {
          kind: "text",
          text: [
            "Place the Bizdocs Debian package in the work folder.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls work
# bizdocs-eimza_1.2.6_amd64.deb`,
        },
      ],
    },
    {
      title: "Create compose.yaml",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Debian as the container base. Host networking is used because the host browser must reach the Bizdocs local service. X11 is mounted so the Bizdocs GUI can open from the container.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano compose.yaml`,
        },
        {
          kind: "code",
          language: "bash",
          code: `services:
  esign:
    image: debian:12
    container_name: esign
    network_mode: host
    stdin_open: true
    tty: true
    environment:
      - DISPLAY=\${DISPLAY}
      - LIBGL_ALWAYS_SOFTWARE=1
    volumes:
      - /run/pcscd/pcscd.comm:/run/pcscd/pcscd.comm
      - /tmp/.X11-unix:/tmp/.X11-unix
      - ./work:/work
    working_dir: /work`,
        },
      ],
    },
    {
      title: "Start the container",
      blocks: [
        {
          kind: "text",
          text: [
            "Start the container and enter it. The prompt changes to root inside the container. The /work folder inside the container maps to ./work on the host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/esign
docker compose up -d
docker exec -it esign bash`,
        },
        {
          kind: "code",
          language: "bash",
          code: `pwd
ls
cat /etc/os-release`,
        },
      ],
    },
    {
      title: "Install container packages",
      blocks: [
        {
          kind: "text",
          text: [
            "Install tools for smart card testing, GUI forwarding, TLS certificates, and basic runtime support. iproute2 provides ss for checking the local Bizdocs service port.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `apt update
apt install -y \\
  pcsc-tools \\
  opensc \\
  ca-certificates \\
  curl \\
  wget \\
  unzip \\
  default-jre \\
  file \\
  iproute2 \\
  libgl1 \\
  libglx-mesa0 \\
  libegl1 \\
  libx11-6 \\
  libxcursor1 \\
  libxrandr2 \\
  libxinerama1 \\
  libxi6 \\
  libxxf86vm1 \\
  libxrender1 \\
  libxext6 \\
  libxfixes3 \\
  libxkbcommon0 \\
  libxkbcommon-x11-0 \\
  libgtk-3-0 \\
  libnss3 \\
  libasound2 \\
  x11-apps

update-ca-certificates`,
        },
      ],
    },
    {
      title: "Test the reader inside the container",
      blocks: [
        {
          kind: "text",
          text: [
            "Run pcsc_scan inside the container. This proves that the container can reach the card through the host pcscd socket.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pcsc_scan`,
        },
        {
          kind: "text",
          bullets: [
            "Expected reader: ACS ACR39U ICC Reader or similar.",
            "Expected state: Card inserted.",
            "Expected card data: ATR is printed.",
            "Stop pcsc_scan with Ctrl+C after confirming detection.",
          ],
        },
      ],
    },
    {
      title: "Enable host GUI access",
      blocks: [
        {
          kind: "text",
          text: [
            "Run xhost on the Arch host, not inside the container. This allows the container to open GUI windows through the host X11 session.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xhost +local:docker`,
        },
        {
          kind: "text",
          text: [
            "Then enter the container and test with xclock. If a small clock window opens, GUI forwarding is working.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker exec -it esign bash
xclock`,
        },
      ],
    },
    {
      title: "Install Bizdocs",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the Bizdocs Debian package from the shared /work folder. The package installs the launcher under /opt/bizdocs-eimza.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /work
apt install -y ./bizdocs-eimza_1.2.6_amd64.deb`,
        },
        {
          kind: "text",
          text: [
            "If dependencies are missing, fix broken dependencies and run the install command again.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `apt --fix-broken install -y
apt install -y ./bizdocs-eimza_1.2.6_amd64.deb`,
        },
        {
          kind: "text",
          text: [
            "Confirm the launcher exists.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -la /opt/bizdocs-eimza
file /opt/bizdocs-eimza/BIZdocs-eLauncher`,
        },
      ],
    },
    {
      title: "Start Bizdocs",
      blocks: [
        {
          kind: "text",
          text: [
            "Run the Bizdocs launcher from inside the container. Wait until the GUI says the signature service is ready.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `/opt/bizdocs-eimza/BIZdocs-eLauncher`,
        },
        {
          kind: "text",
          bullets: [
            "Expected GUI state: İmza servise hazır.",
            "Bizdocs may update itself on first launch.",
            "Keep the Bizdocs window open while signing from the browser.",
          ],
        },
      ],
    },
    {
      title: "Check the local signing service",
      blocks: [
        {
          kind: "text",
          text: [
            "With Bizdocs running, check that BIZdocs.Core listens on the local service port.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ss -lntp`,
        },
        {
          kind: "text",
          text: [
            "Expected service:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `127.0.0.1:2151 users:(("BIZdocs.Core",pid=...,fd=...))`,
        },
        {
          kind: "text",
          text: [
            "From the Arch host, test the same port. A 404 response is acceptable because the root path is not the signing endpoint. The important part is that the connection is not refused.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl http://127.0.0.1:2151
# 404 page not found`,
        },
      ],
    },
    {
      title: "Sign from the host browser",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the normal browser on the Arch host. The browser talks to the Bizdocs local service through 127.0.0.1:2151 while Bizdocs runs inside the container.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Start the container.",
            "Start Bizdocs inside the container.",
            "Wait until Bizdocs shows İmza servise hazır.",
            "Open the signing page in the host browser.",
            "Start the signing operation.",
            "Choose the certificate and enter the PIN if requested.",
            "Confirm that the signed document is completed.",
          ],
        },
      ],
    },
    {
      title: "TLS certificate fix",
      blocks: [
        {
          kind: "text",
          text: [
            "If Bizdocs fails while downloading the signing package and shows x509: certificate signed by unknown authority, update the container certificate store and restart Bizdocs.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `apt install -y ca-certificates curl
update-ca-certificates

curl -I https://example-signing-domain.com`,
        },
        {
          kind: "text",
          text: [
            "If curl returns HTTP 200 or another valid HTTP response, restart Bizdocs and retry signing.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pkill -f BIZdocs || true
pkill -f BIZdocs.Core || true
pkill -f BIZdocs-eLauncher || true

/opt/bizdocs-eimza/BIZdocs-eLauncher`,
        },
      ],
    },
    {
      title: "Daily start and stop",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this daily flow after the setup is complete. docker compose stop keeps the installed Bizdocs files inside the container.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/esign
docker compose up -d
docker exec -it esign bash
/opt/bizdocs-eimza/BIZdocs-eLauncher`,
        },
        {
          kind: "text",
          text: [
            "After signing is complete, exit the container shell and stop the container.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `exit
docker compose stop`,
        },
      ],
    },
    {
      title: "Stop versus down",
      blocks: [
        {
          kind: "text",
          text: [
            "Use stop for normal daily use. Use down only when you intentionally want to remove and recreate the container.",
          ],
        },
        {
          kind: "table",
          headers: ["Command", "Effect"],
          rows: [
            ["docker compose stop", "Stops the container and keeps installed Bizdocs files under /opt/bizdocs-eimza."],
            ["docker compose up -d", "Starts the existing container again."],
            ["docker compose down", "Removes the container. Files in ./work remain, but installed packages inside the container are lost."],
            ["docker compose up -d after down", "Creates a new clean container. Bizdocs and packages must be installed again unless a custom image is used."],
          ],
        },
      ],
    },
    {
      title: "Useful checks",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Host: check running containers
docker ps

# Host: enter the container
docker exec -it esign bash

# Container: confirm Debian base
cat /etc/os-release

# Container: confirm smart card access
pcsc_scan

# Container: confirm Bizdocs service port
ss -lntp | grep 2151

# Host: confirm browser can reach Bizdocs service
curl http://127.0.0.1:2151

# Container: check Bizdocs files
ls -la /opt/bizdocs-eimza

# Container: check Bizdocs logs
ls -la /opt/bizdocs-eimza/logs
tail -n 100 /opt/bizdocs-eimza/logs/* 2>/dev/null`,
        },
      ],
    },
    {
      title: "Workspace layout",
      blocks: [
        {
          kind: "text",
          text: [
            "Keep the workspace simple and movable. The work folder is safe because it is stored on the host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `~/projects/esign/
├── compose.yaml
└── work/
    ├── bizdocs-eimza_1.2.6_amd64.deb
    ├── input-documents
    └── signed-output`,
        },
      ],
    },
    {
      title: "Notes",
      blocks: [
        {
          kind: "text",
          bullets: [
            "The ACS reader may be shown as ACR39U even when the physical model is ACR39T.",
            "A 404 response from http://127.0.0.1:2151 is acceptable for the root path.",
            "The real signing page calls a specific Bizdocs endpoint, not the root path.",
            "If xclock opens, the container GUI layer is working.",
            "If pcsc_scan works inside the container, the card reader layer is working.",
            "If Bizdocs says İmza servise hazır, the local signing service is ready.",
            "Keep the Bizdocs window open while signing from the browser.",
            "Run xhost -local:docker after finishing if local Docker GUI access should be revoked.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `xhost -local:docker`,
        },
      ],
    },
  ],
}

export default entry
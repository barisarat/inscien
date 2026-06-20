import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-asus-laptop-controls",
  kind: "codenote",
  name: "Arch ASUS Laptop Controls",
  desc: "Use asusctl and asusd for ASUS-specific laptop controls such as keyboard RGB and battery charge limits.",
  intro:
    "Configure ASUS-specific laptop controls on Arch with asusctl and asusd. This workflow covers power profile separation, ASUS keyboard RGB, battery charge limits, a local asusd service workaround, and set-and-go usage when ASUS settings persist without keeping the daemon enabled all day.",
  sections: [
    {
      title: "Understand the tool split",
      blocks: [
        {
          kind: "text",
          text: [
            "ASUS laptops can expose extra hardware controls that are not part of standard i3, PipeWire, or powerprofilesctl workflows. Use asusctl only for ASUS-specific features such as keyboard RGB, battery charge limits, and optional fan curve inspection.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Use powerprofilesctl for normal performance, balanced, and power-saver modes.",
            "Use asusctl for ASUS-specific laptop controls.",
            "The asusd service is required while running asusctl commands.",
            "If the settings persist after being applied, asusd does not have to run all day for a set-and-go setup.",
          ],
        },
      ],
    },
    {
      title: "Check standard Linux power profiles",
      blocks: [
        {
          kind: "text",
          text: [
            "Use powerprofilesctl for normal Linux power mode changes. This is separate from ASUS-specific hardware control.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `powerprofilesctl
powerprofilesctl get

powerprofilesctl set balanced
powerprofilesctl set power-saver
powerprofilesctl set performance`,
        },
      ],
    },
    {
      title: "Install and inspect asusctl",
      blocks: [
        {
          kind: "text",
          text: [
            "Install asusctl and inspect the available ASUS commands.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `yay -S asusctl

asusctl --help
asusctl info`,
        },
      ],
    },
    {
      title: "ASUS service workaround",
      blocks: [
        {
          kind: "text",
          text: [
            "On this ASUS setup, the packaged asusd.service failed before the daemon started. The failure appeared as status 226/NAMESPACE on ExecStartPre=/bin/sleep 1. This points to systemd sandbox or namespace settings in the packaged unit, not an ASUS hardware failure.",
          ],
        },
        {
          kind: "text",
          text: [
            "The working fix was to create a simpler local systemd unit at /etc/systemd/system/asusd.service. A local unit in /etc overrides the packaged unit in /usr/lib/systemd/system.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Inspect the active service definition
systemctl cat asusd.service

# Check service status
systemctl status asusd.service --no-pager

# Check logs if it fails
journalctl -u asusd.service -b --no-pager -n 100`,
        },
        {
          kind: "code",
          language: "bash",
          code: `# Create a minimal local asusd service
sudo tee /etc/systemd/system/asusd.service >/dev/null <<'EOF'
[Unit]
Description=ASUS Notebook Control
After=systemd-udevd.service

[Service]
Environment=IS_SERVICE=1
ExecStart=/usr/bin/asusd
Restart=on-failure
RestartSec=1
Type=dbus
BusName=xyz.ljones.Asusd
TimeoutSec=10

[Install]
WantedBy=multi-user.target
EOF

# Remove old drop-in overrides if they were created during testing
sudo rm -rf /etc/systemd/system/asusd.service.d

# Reload systemd and start the service
sudo systemctl daemon-reload
sudo systemctl reset-failed asusd.service
sudo systemctl start asusd.service
systemctl status asusd.service --no-pager`,
        },
      ],
    },
    {
      title: "Enable asusd only if needed",
      blocks: [
        {
          kind: "text",
          text: [
            "Enable the local service only if ASUS controls should be available after reboot without starting the daemon manually.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Enable ASUS control daemon on boot
sudo systemctl enable --now asusd.service

# Verify boot state
systemctl is-enabled asusd.service
systemctl status asusd.service --no-pager`,
        },
      ],
    },
    {
      title: "ASUS keyboard RGB",
      blocks: [
        {
          kind: "text",
          text: [
            "After asusd is running, use asusctl to set a static keyboard color.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Inspect Aura commands
asusctl aura --help
asusctl aura effect --help
asusctl aura effect static --help

# Set keyboard backlight to static white
asusctl aura effect static -c ffffff`,
        },
      ],
    },
    {
      title: "ASUS battery charge limit",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the ASUS battery commands to inspect battery state, set a daily plugged-in charge limit, or perform a one-shot full charge before travel.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Inspect battery commands
asusctl battery --help
asusctl battery info

# Set daily plugged-in charge limit
asusctl battery limit 80

# One-shot full charge before travel
asusctl battery oneshot 100`,
        },
        {
          kind: "text",
          bullets: [
            "Static white keyboard color: asusctl aura effect static -c ffffff",
            "Daily battery preservation: asusctl battery limit 80",
            "Full charge before travel: asusctl battery oneshot 100",
            "Avoid custom fan curves unless there is a clear thermal reason.",
          ],
        },
      ],
    },
    {
      title: "ASUS set-and-go mode",
      blocks: [
        {
          kind: "text",
          text: [
            "If ASUS settings are rarely changed, asusd can be started only when applying settings and stopped afterward. Test this after a reboot because keyboard RGB may reset more often than the battery charge limit.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Apply ASUS preferences manually
sudo systemctl start asusd.service
asusctl aura effect static -c ffffff
asusctl battery limit 80
sudo systemctl stop asusd.service`,
        },
        {
          kind: "code",
          language: "bash",
          code: `# Disable background startup if set-and-go is preferred
sudo systemctl disable asusd.service

# Start only when ASUS settings need to be changed again
sudo systemctl start asusd.service`,
        },
        {
          kind: "text",
          bullets: [
            "Arch, i3, sound, and powerprofilesctl work without asusd.",
            "asusd is needed only when asusctl needs to talk to ASUS-specific hardware controls.",
            "Keep asusd enabled if keyboard RGB resets after reboot or if ASUS controls are used often.",
            "Keep asusd disabled if the settings persist and the laptop is used in a fixed set-and-go style.",
          ],
        },
      ],
    },
    {
      title: "Debug commands",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Check ASUS control daemon
systemctl status asusd.service --no-pager
systemctl cat asusd.service
journalctl -u asusd.service -b --no-pager -n 100

# Check ASUS command availability
command -v asusctl
asusctl --help
asusctl info

# Check current power profile
powerprofilesctl get`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Local asusd service override: /etc/systemd/system/asusd.service",
            "Packaged asusd service location: /usr/lib/systemd/system/asusd.service",
            "ASUS command-line tool: asusctl",
            "ASUS daemon service: asusd.service",
            "Standard Linux power profile tool: powerprofilesctl",
          ],
        },
      ],
    },
  ],
}

export default entry
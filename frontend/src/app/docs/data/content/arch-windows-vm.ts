import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-windows-vm",
  kind: "codenote",
  name: "Arch Windows VM with KVM/QEMU",
  desc: "UEFI based Windows 11 virtual machine on an Arch Linux host using QEMU/KVM, libvirt, and virt-manager.",
  intro:
    "Standard Arch virtualization stack: QEMU/KVM + libvirt + virt-manager + OVMF (UEFI) + swtpm (TPM). Windows 11 requires UEFI and TPM 2.0, both provided by this stack.",
  resources: [
    {
      label: "Windows 11 ISO",
      href: "https://www.microsoft.com/en-us/software-download/windows11",
    },
    {
      label: "virtio-win driver ISO",
      href: "https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/",
    },
    {
      label: "SPICE Guest Tools - Windows binaries",
      href: "https://www.spice-space.org/download.html",
    },
  ],
  sections: [
    {
      title: "Host package setup",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -Syu
sudo pacman -S qemu-desktop libvirt virt-manager dnsmasq edk2-ovmf swtpm
sudo systemctl enable --now libvirtd
sudo usermod -aG libvirt $USER`,
        },
        {
          kind: "text",
          text: ["Log out and back in after usermod for group membership to take effect."],
        },
      ],
    },
    {
      title: "Recommended VM configuration",
      blocks: [
        {
          kind: "text",
          text: ["Tested working configuration:"],
        },
        {
          kind: "text",
          bullets: [
            "Memory: 12 GB (16 GB for heavier multitasking)",
            "vCPU: 4 (6 for heavier multitasking)",
            "Disk: 100 GB, SATA bus for simplest initial install",
            "Firmware: UEFI / OVMF",
            "TPM: enabled (required for Windows 11)",
            "Network: default libvirt NAT",
          ],
        },
        {
          kind: "text",
          text: ["Verify the default libvirt network is active and set to autostart:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo virsh net-list --all
sudo virsh net-info default`,
        },
      ],
    },
    {
      title: "Network fix - host forwarding and NAT",
      blocks: [
        {
          kind: "text",
          text: [
            "On hosts running Docker alongside libvirt, Docker's forwarding rules can block guest internet access. The symptom is the guest receiving an IP from the libvirt bridge but failing to reach outside. Fix by adding the missing rules manually:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo iptables -I FORWARD 1 -i virbr0 -o virbr0 -j ACCEPT
sudo iptables -I FORWARD 1 -i virbr0 -j ACCEPT
sudo iptables -I FORWARD 1 -o virbr0 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
sudo iptables -t nat -I POSTROUTING 1 -s 192.168.122.0/24 ! -d 192.168.122.0/24 -j MASQUERADE`,
        },
        {
          kind: "text",
          text: ["Accepts forwarding from the VM bridge and masquerades guest traffic out to the host network."],
        },
      ],
    },
    {
      title: "virtio NIC driver for Windows",
      blocks: [
        {
          kind: "text",
          text: ["Attach the virtio-win ISO as a CD-ROM in virt-manager:"],
        },
        {
          kind: "text",
          bullets: [
            "Shut down the VM",
            "VM settings → Add Hardware → Storage",
            "Select the virtio-win ISO → set device type to CDROM → attach on SATA",
            "Change the VM NIC model to virtio",
          ],
        },
        {
          kind: "text",
          text: ["Then inside Windows, install the NetKVM driver:"],
        },
        {
          kind: "text",
          bullets: [
            "Device Manager → locate unknown network adapter",
            "Update driver → Browse my computer",
            "Point to the mounted virtio ISO, enable subfolders",
            "Install the NetKVM driver (Windows 11 x64)",
          ],
        },
      ],
    },
    {
      title: "SPICE guest tools for clipboard and display",
      blocks: [
        {
          kind: "text",
          text: [
            "Run the SPICE Guest Tools installer inside the Windows guest and reboot. This enables host to guest clipboard and dynamic display resolution. Do this after boot and networking are confirmed.",
          ],
        },
      ],
    },
    {
      title: "Setup order",
      blocks: [
        {
          kind: "text",
          bullets: [
            "1. Download Windows 11 ISO, virtio-win ISO, and SPICE Guest Tools",
            "2. Install host packages and enable libvirtd",
            "3. Create VM in virt-manager with UEFI, TPM, and NAT networking",
            "4. Install Windows 11 from ISO",
            "5. Fix host iptables rules if Docker is also running on the host",
            "6. Attach virtio-win ISO as CDROM, change NIC to virtio, install NetKVM driver in Windows",
            "7. Install SPICE Guest Tools in Windows for clipboard and display",
          ],
        },
      ],
    },
  ],
}

export default entry
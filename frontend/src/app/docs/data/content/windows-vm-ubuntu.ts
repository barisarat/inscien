import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "windows-vm-ubuntu",
  kind: "codenote",
  name: "Windows 11 VM on Ubuntu with KVM/QEMU",
  desc: "UEFI based Windows 11 virtual machine on an Ubuntu host using QEMU/KVM, libvirt, and virt-manager.",
  intro:
    "Ubuntu virtualization stack for running Windows 11 as a guest: QEMU/KVM, libvirt, virt-manager, OVMF (UEFI), and TPM 2.0. Both UEFI firmware and TPM are required by Windows 11 and provided by this stack.",
  resources: [
    {
      label: "Windows 11 ISO",
      href: "https://www.microsoft.com/en-us/software-download/windows11",
    },
    {
      label: "Arch Windows VM with KVM/QEMU",
      href: "/docs/arch-windows-vm",
    },
  ],
  sections: [
    {
      title: "Verify CPU virtualization",
      blocks: [
        {
          kind: "text",
          text: [
            "Confirm the host CPU supports hardware virtualization. Output greater than 0 means the CPU supports it. If the count is 0, enable Intel VT-x or AMD-V in BIOS first.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `egrep -c '(vmx|svm)' /proc/cpuinfo`,
        },
      ],
    },
    {
      title: "Install the KVM stack",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo apt update
sudo apt install qemu-kvm libvirt-daemon-system libvirt-clients bridge-utils virt-manager
sudo systemctl enable libvirtd
sudo systemctl start libvirtd
sudo usermod -aG libvirt $USER`,
        },
        {
          kind: "text",
          text: ["Log out and back in after usermod for group membership to take effect."],
        },
        {
          kind: "text",
          text: ["Verify KVM kernel modules are loaded. Output should include kvm_intel or kvm_amd depending on the CPU."],
        },
        {
          kind: "code",
          language: "bash",
          code: `lsmod | grep kvm`,
        },
      ],
    },
    {
      title: "Recommended VM configuration",
      blocks: [
        {
          kind: "text",
          text: ["Tested working configuration on a 12 core host with 32 GB RAM:"],
          bullets: [
            "Memory: 16 GB",
            "vCPU: 6",
            "Disk: 100 GB, qcow2 (default)",
            "Firmware: UEFI / OVMF",
            "TPM: 2.0 (required for Windows 11)",
            "CPU model: host-passthrough",
            "Network: default libvirt NAT",
          ],
        },
      ],
    },
    {
      title: "Create the VM in virt-manager",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `virt-manager`,
        },
        {
          kind: "text",
          text: ["Confirm Localhost (QEMU/KVM) shows Connected. Then:"],
          bullets: [
            "Create new virtual machine, choose Local install media (ISO image)",
            "Browse and select the Windows 11 ISO. Manually select Windows 11 if not detected automatically",
            "Set memory and CPU per the recommended config",
            "Set disk size to 100 GB, qcow2",
            "Check Customize configuration before install before clicking Finish",
          ],
        },
      ],
    },
    {
      title: "Critical pre-install settings",
      blocks: [
        {
          kind: "text",
          text: [
            "Apply these in the customize view before starting the install. Each is required for Windows 11 to install and boot correctly.",
          ],
          bullets: [
            "Overview, Firmware: set to UEFI (OVMF)",
            "CPUs, Model: set to host-passthrough",
            "Add Hardware, TPM: add a TPM 2.0 device",
            "Boot Options: CD-ROM first, Hard Disk second",
          ],
        },
      ],
    },
    {
      title: "Start the install",
      blocks: [
        {
          kind: "text",
          text: [
            "Click Begin Installation. When the boot prompt appears asking to boot from CD or DVD, press Space immediately or the VM will skip to the empty disk and fail to boot.",
            "Proceed with the normal Windows installation.",
          ],
        },
      ],
    },
  ],
}

export default entry
import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "find-local-ip",
  kind: "codenote",
  name: "Find Local Network IP",
  desc: "Find the IPv4 address of a Linux machine on the local network so another device can reach it over SSH.",
  intro:
    "This process how to find the LAN IPv4 address of a Linux machine and make sense of the shell outputs. A typically use case for this is to get the address to connect over SSH.",
  resources: [
    { label: "SSH into a local network device", href: "/docs/ssh-local-device" },
  ],
  sections: [
    {
      title: "Quickest check",
      blocks: [
        {
          kind: "text",
          text: [
            "Ask the kernel which interface and source address it would use to reach the public internet. The src field is the IP this machine presents on the LAN.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ip route get 1.1.1.1`,
        },
        {
          kind: "text",
          text: ["Example output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `1.1.1.1 via 192.168.1.1 dev wlp4s0 src 192.168.1.4`,
        },
        {
          kind: "text",
          text: ["The src 192.168.1.4 is the LAN IP. dev wlp4s0 is the active interface."],
        },
      ],
    },
    {
      title: "Cleaner alternatives",
      blocks: [
        {
          kind: "text",
          text: ["Two single-line commands that filter to the relevant addresses without parsing full ip a output."],
        },
        {
          kind: "code",
          language: "bash",
          code: `ip -4 addr show scope global
hostname -I`,
        },
      ],
    },
    {
      title: "Read full ip a output",
      blocks: [
        {
          kind: "text",
          text: [
            "When you need to see all interfaces run ip a and look for the inet line on the active interface.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ip a`,
        },
        {
          kind: "text",
          text: ["Example excerpt for a wired desktop:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `enp4s0: <BROADCAST,MULTICAST,UP,LOWER_UP>
    inet 192.168.1.6/24 brd 192.168.1.255 scope global dynamic noprefixroute enp4s0`,
        },
        {
          kind: "text",
          text: ["Reading the line:"],
          bullets: [
            "enp4s0 is the wired Ethernet interface (en* = Ethernet, wl* = Wi-Fi, lo = loopback).",
            "UP means the interface is enabled, LOWER_UP means the physical link is active.",
            "scope global means it is a real network address, not loopback.",
            "dynamic means the IP was assigned by DHCP from the router.",
            "192.168.1.6 is the LAN IP is the address to use for SSH from another machine.",
          ],
        },
      ],
    },
    {
      title: "Interfaces to ignore",
      blocks: [
        {
          kind: "text",
          text: [
            "Several interfaces show up in ip a but are not the address you want for SSH from another machine.",
          ],
          bullets: [
            "lo / 127.0.0.1 is a loopback. It points back to the same machine, unreachable from outside.",
            "docker0, br-..., veth... are Docker / container networks. Typically in 172.17–172.19.x.x.",
            "virbr0 is virtual machine bridge, often 192.168.122.x.",
          ],
        },
        {
          kind: "text",
          text: [
            "The address you want is the IPv4 on the real active LAN interface which is usually 192.168.1.x or similar, on en* (wired) or wl* (Wi-Fi).",
          ],
        },
      ],
    },
    {
      title: "Test reachability",
      blocks: [
        {
          kind: "text",
          text: [
            "From the other machine that will be doing the SSH, ping the discovered IP first to confirm basic reachability before trying to connect.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ping 192.168.1.6
ssh your-user@192.168.1.6`,
        },
      ],
    },
  ],
}

export default entry
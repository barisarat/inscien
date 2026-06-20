import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-yay-install",
  kind: "codenote",
  name: "Arch yay Install",
  desc: "yay is an AUR helper for installing packages not available in the official Arch repositories. Required for packages like Google Chrome.",
  intro:
    "yay builds AUR packages locally from PKGBUILDs. Use pacman for official Arch packages and yay only when the package is not available there. AUR packages are community maintained.",
  sections: [
    {
      title: "Install",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S --needed git base-devel
git clone https://aur.archlinux.org/yay.git
cd yay
makepkg -si`,
        },
      ],
    },
    {
      title: "Usage",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `yay -S <package-name>   # install from AUR
yay -S google-chrome    # example`,
        },
      ],
    },
  ],
}

export default entry
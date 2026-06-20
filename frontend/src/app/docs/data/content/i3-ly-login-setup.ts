import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "i3-ly-login-setup",
  kind: "codenote",
  name: "i3 Login with ly on Arch",
  desc: "Configure ly as a terminal-style display manager on Arch and make it start the i3 session by default.",
  intro:
    "Configure ly as a terminal-style login manager for an i3 setup on Arch. This workflow covers installing ly, switching from a graphical display manager, enabling the correct ly systemd service, selecting the i3 session, fixing remembered Plasma sessions through dmrc and AccountsService, and switching back if needed.",
  sections: [
    {
      title: "Install ly",
      blocks: [
        {
          kind: "text",
          text: [
            "Install ly from the Arch repositories. ly provides a terminal-style display manager that can launch X11 sessions such as i3.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S ly`,
        },
      ],
    },
    {
      title: "Confirm available i3 sessions",
      blocks: [
        {
          kind: "text",
          text: [
            "ly reads X11 sessions from /usr/share/xsessions. Confirm that the i3 session file exists before switching display managers.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls /usr/share/xsessions`,
        },
        {
          kind: "text",
          text: [
            "Expected available sessions on this setup include i3, i3-with-shmlog, and plasmax11. Use i3 for normal login.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `i3.desktop
i3-with-shmlog.desktop
plasmax11.desktop`,
        },
      ],
    },
    {
      title: "Switch from LightDM to ly",
      blocks: [
        {
          kind: "text",
          text: [
            "Disable the current graphical display manager and enable ly on tty2. The Arch ly package uses the tty-specific ly@tty2.service style rather than ly.service.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl disable lightdm
sudo systemctl enable ly@tty2.service
sudo systemctl disable getty@tty2.service
sudo reboot`,
        },
        {
          kind: "text",
          bullets: [
            "After reboot, ly should appear as a terminal-style login screen.",
            "Select i3 from the session field before logging in.",
            "If ly opens Plasma, change the selected session to i3 and log in again.",
          ],
        },
      ],
    },
    {
      title: "Check ly session configuration",
      blocks: [
        {
          kind: "text",
          text: [
            "Confirm ly is configured to use the standard X command and X session directory.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -n "xsessions\\|x_cmd\\|session" /etc/ly/config.ini`,
        },
        {
          kind: "text",
          text: [
            "The important values are:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `x_cmd = /usr/bin/X
xsessions = /usr/share/xsessions`,
        },
        {
          kind: "text",
          text: [
            "Use the filename without .desktop when referring to a session name. For i3.desktop, the session name is i3.",
          ],
        },
      ],
    },
    {
      title: "Set dmrc session to i3",
      blocks: [
        {
          kind: "text",
          text: [
            "Set the user's dmrc session to i3. This helps display managers remember the intended X11 session.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/.dmrc`,
        },
        {
          kind: "code",
          language: "bash",
          code: `[Desktop]
Session=i3`,
        },
        {
          kind: "code",
          language: "bash",
          code: `cat ~/.dmrc`,
        },
      ],
    },
    {
      title: "Fix AccountsService remembered session",
      blocks: [
        {
          kind: "text",
          text: [
            "If the system keeps opening Plasma even after selecting i3, check the per-user AccountsService session. In this setup, AccountsService remembered Plasma and had to be changed to i3.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo cat /var/lib/AccountsService/users/$USER`,
        },
        {
          kind: "text",
          text: [
            "If the file contains XSession=plasma, edit it and change the remembered X session to i3. Replace $USER with the target username on another machine.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /var/lib/AccountsService/users/$USER`,
        },
        {
          kind: "code",
          language: "bash",
          code: `[User]
Session=
XSession=i3
Icon=/home/$USER/.face
SystemAccount=false`,
        },
        {
          kind: "text",
          bullets: [
            "The important value is XSession=i3.",
            "If XSession=plasma is present, the login manager can keep opening Plasma.",
            "After changing the file, reboot and choose i3 in ly once.",
          ],
        },
      ],
    },
    {
      title: "Verify active display manager and session",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands after logging in to confirm that ly is active and the i3 session files are available.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl status display-manager --no-pager
systemctl status ly@tty2.service --no-pager
ls /usr/share/xsessions
cat ~/.dmrc
sudo cat /var/lib/AccountsService/users/$USER`,
        },
      ],
    },
    {
      title: "Switch back to LightDM if needed",
      blocks: [
        {
          kind: "text",
          text: [
            "If ly does not work as expected or a graphical login screen is preferred again, disable ly and restore LightDM.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl disable ly@tty2.service
sudo systemctl enable getty@tty2.service
sudo systemctl enable lightdm
sudo reboot`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "ly config: /etc/ly/config.ini",
            "ly systemd service: ly@tty2.service",
            "LightDM service: lightdm.service",
            "User dmrc session file: ~/.dmrc",
            "AccountsService user session file: /var/lib/AccountsService/users/$USER",
            "X11 session files: /usr/share/xsessions",
          ],
        },
      ],
    },
  ],
}

export default entry
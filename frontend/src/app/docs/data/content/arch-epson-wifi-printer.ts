import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-epson-wifi-printer",
  kind: "codenote",
  name: "Arch WiFi Printer Setup",
  desc: "Set up a WiFi printer on Arch Linux using CUPS with manual IP configuration and the Epson ESC/P-R driver.",
  intro:
    "This setup is configured specifically for Epson L3250/L3252 over home WiFi on Arch Linux, steps may differ for different devices.",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# install
sudo pacman -S cups cups-filters avahi nss-mdns
sudo systemctl enable --now cups.service
sudo systemctl enable --now avahi-daemon.service

# driver
yay -S epson-inkjet-printer-escpr
sudo systemctl restart cups.service

# verify printer reachable
ping -c 4 PRINTER_IP

# add via CUPS UI
# http://localhost:631 → Add Printer → LPD/LPR Host
# connection: lpd://PRINTER_IP/
# make: Epson
# model: EPSON L3250 Series, Epson Inkjet Printer Driver (ESC/P-R)

# set default
lpoptions -d EPSON_L3250_Series
lpstat -p -d`,
        },
      ],
    },
    {
      title: "Preconditions",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Printer is powered on with paper loaded and connected to the router WiFi",
            "Print the network status page from the printer and note the SSID and IP address",
            "Host is connected to the same WiFi network",
          ],
        },
      ],
    },
    {
      title: "Install packages and enable services",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S cups cups-filters avahi nss-mdns
sudo systemctl enable --now cups.service
sudo systemctl enable --now avahi-daemon.service`,
        },
      ],
    },
    {
      title: "Confirm network reachability",
      blocks: [
        {
          kind: "text",
          text: [
            "Ping the printer by IP from the status page. Replies with 0% packet loss confirms the laptop can reach the printer.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ping -c 4 $DEVICE_IP`,
        },
      ],
    },
    {
      title: "Install Epson ESC/P-R driver",
      blocks: [
        {
          kind: "text",
          text: [
            "The base CUPS install only includes generic drivers. The Epson specific driver provides proper model support and avoids PPD failures with the driverless entry.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `yay -S epson-inkjet-printer-escpr
sudo systemctl restart cups.service`,
        },
        {
          kind: "text",
          text: [
            "Confirm the model is now available.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `lpinfo -m | grep -i epson | grep -i 325`,
        },
      ],
    },
    {
      title: "Add printer in CUPS",
      blocks: [
        {
          kind: "text",
          text: [
            "Open http://localhost:631 in the browser. Go to Administration → Add Printer → select LPD/LPR Host or Printer.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Connection: lpd://PRINTER_IP/ (replace with actual IP)",
            "Name: EPSON_L3250_Series",
            "Description: EPSON L3250 Series",
            "Sharing: unchecked",
            "Manufacturer: Epson",
            "Model: EPSON L3250 Series, Epson Inkjet Printer Driver (ESC/P-R) for Linux",
          ],
        },
        {
          kind: "text",
          text: [
            "Do not choose the 9-Pin, 24-Pin, or driverless entries. CUPS may show a deprecation warning about printer drivers. This does not block current use.",
          ],
        },
      ],
    },
    {
      title: "Validate and set default",
      blocks: [
        {
          kind: "text",
          text: [
            "After adding, print a test page from the CUPS printer page under Maintenance → Print Test Page. Then set the printer as system default.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `lpstat -p -d
lpoptions -d EPSON_L3250_Series
lpstat -d`,
        },
      ],
    },
        {
      title: "Install scanning and PDF tools",
      blocks: [
        {
          kind: "text",
          text: [
            "Scanning is separate from CUPS printing. For Epson L3250/L3252 over WiFi, the minimal working setup uses SANE, Simple Scan, sane-airscan, ImageMagick, and Poppler.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S sane simple-scan sane-airscan imagemagick poppler`,
        },
      ],
    },
    {
      title: "Detect scanner devices",
      blocks: [
        {
          kind: "text",
          text: [
            "Use scanimage to list available scanner backends. The Epson scanner may appear through multiple backends. The airscan device name can change from w0 to w1, so copy the current device name from scanimage -L before scanning.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `scanimage -L`,
        },
        {
          kind: "text",
          text: [
            "Typical working entries can include airscan:w1:EPSON L3250 Series, epsonds:net:PRINTER_IP, or epson2:net:PRINTER_IP. The epsonds IP-based backend is useful when the airscan w0/w1 name changes.",
          ],
        },
      ],
    },
    {
      title: "Scan official documents",
      blocks: [
        {
          kind: "text",
          text: [
            "For government or official submissions, use 300 DPI for high-quality A4 scans. If the upload limit is strict, 250 DPI can reduce size while usually keeping documents readable.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/scans
scanimage -d "airscan:w1:EPSON L3250 Series" --format=png --resolution 300 > ~/scans/document-page-1.png
file ~/scans/document-page-1.png
xdg-open ~/scans/document-page-1.png`,
        },
        {
          kind: "text",
          text: [
            "A 300 DPI A4 scan should be around 2480 x 3508 pixels. A value close to this, such as 2550 x 3510, is acceptable and usually means the full flatbed area was scanned.",
          ],
        },
      ],
    },
    {
      title: "Scan with smaller file size",
      blocks: [
        {
          kind: "text",
          text: [
            "Use 250 DPI when the portal has a tight file-size limit, such as 5 MB, and the document remains readable.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `scanimage -d "airscan:w1:EPSON L3250 Series" --format=png --resolution 250 > ~/scans/document-page-1.png
scanimage -d "airscan:w1:EPSON L3250 Series" --format=png --resolution 250 > ~/scans/document-page-2.png
scanimage -d "airscan:w1:EPSON L3250 Series" --format=png --resolution 250 > ~/scans/document-page-3.png`,
        },
      ],
    },
{
  title: "Convert scans to PDF",
  blocks: [
    {
      kind: "text",
      text: [
        "ImageMagick can convert PNG scans to PDF. Use JPEG compression and quality settings during conversion to keep the output below upload limits.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `# convert one PNG scan to one PDF
magick ~/scans/document-page-1.png -compress jpeg -quality 90 ~/scans/document.pdf

# convert several explicitly named PNG scans into one PDF
magick ~/scans/document-page-1.png ~/scans/document-page-2.png ~/scans/document-page-3.png -compress jpeg -quality 90 ~/scans/document.pdf

# convert an ordered page range into one PDF
magick ~/scans/document-sf{1..8}.png -compress jpeg -quality 90 ~/scans/document.pdf

# verify the result
ls -lh ~/scans/document.pdf
xdg-open ~/scans/document.pdf`,
    },
    {
      kind: "text",
      text: [
        "Use the highest quality value that stays under the portal limit. Quality 90 is a good first attempt, while 80 or 70 can be used if the PDF is still too large.",
      ],
    },
  ],
},
    {
      title: "Compress existing PDFs",
      blocks: [
        {
          kind: "text",
          text: [
            "If the PDF already exists and is slightly above the upload limit, compress the existing PDF with ImageMagick. Place -density before the input PDF.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `magick -density 150 ~/scans/document.pdf -compress jpeg -quality 80 ~/scans/document-under-limit.pdf
magick -density 140 ~/scans/document.pdf -compress jpeg -quality 70 ~/scans/document-under-limit.pdf
ls -lh ~/scans/document-under-limit.pdf
xdg-open ~/scans/document-under-limit.pdf`,
        },
      ],
    },
{
  title: "Combine existing PDF documents",
  blocks: [
    {
      kind: "text",
      text: [
        "Use pdfunite when two or more existing PDF documents need to become one PDF. The input order becomes the page order in the final file.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `# combine two existing PDFs
pdfunite ./first-document.pdf ./second-document.pdf ./combined-document.pdf

# combine several existing PDFs
pdfunite ./first-document.pdf ./second-document.pdf ./third-document.pdf ./combined-document.pdf

# verify the result
pdfinfo ./combined-document.pdf
ls -lh ./combined-document.pdf
xdg-open ./combined-document.pdf`,
    },
    {
      kind: "text",
      text: [
        "Do not use the same filename for the output as one of the inputs. Create a new combined file first, verify it, then rename it only if needed.",
      ],
    },
  ],
},
{
  title: "Check file sizes",
  blocks: [
    {
      kind: "text",
      text: [
        "Check file sizes before upload, compression, or manual cleanup. This is useful when a portal has a strict file-size limit.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `# show file and folder sizes in human-readable format
du -h *

# show file and folder sizes in MB
du -m *

# show largest items first
du -m * | sort -nr

# show files only, not folders
find . -maxdepth 1 -type f -exec du -m {} + | sort -nr

# show exact file sizes in MB from byte size
find . -maxdepth 1 -type f -printf "%s %f\\n" | awk '{printf "%.2f MB\\t%s\\n", $1/1024/1024, $2}' | sort -nr`,
    },
    {
      kind: "text",
      text: [
        "Use du -m for a quick MB check. Use the exact byte-based command when the file is close to the upload limit.",
      ],
    },
  ],
},
    {
  title: "Batch append and remove PDF pages",
  blocks: [
    {
      kind: "text",
      text: [
        "Use these commands when the same supporting PDF must be appended to multiple selected PDF files. Select the target files by filename pattern, then verify page counts before upload or submission.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `# choose the files to update by filename pattern
FILE_PATTERN='*TARGET_PATTERN.pdf'
SUPPORTING_PDF='./SUPPORTING_DOCUMENT.pdf'

# append SUPPORTING_PDF to every matching PDF
find . -type f -name "$FILE_PATTERN" -print0 | while IFS= read -r -d '' file
do
    dir=$(dirname "$file")
    base=$(basename "$file")
    tmp="$dir/.tmp_$base"

    pdfunite "$file" "$SUPPORTING_PDF" "$tmp" && mv "$tmp" "$file"
done

# verify page counts after append
find . -type f -name "$FILE_PATTERN" -print0 | while IFS= read -r -d '' file
do
    echo "$file"
    pdfinfo "$file" | grep Pages
done`,
    },
    {
      kind: "text",
      text: [
        "If the appended pages should be removed later, remove the last N pages from each matching PDF. Set PAGES_TO_REMOVE to the number of pages that were appended.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `FILE_PATTERN='*TARGET_PATTERN.pdf'
PAGES_TO_REMOVE=2

find . -type f -name "$FILE_PATTERN" -print0 | while IFS= read -r -d '' file
do
    pages=$(pdfinfo "$file" | awk '/^Pages:/ {print $2}')
    keep_until=$((pages - PAGES_TO_REMOVE))

    if [ "$keep_until" -ge 1 ]; then
        tmp="$(dirname "$file")/.tmp_$(basename "$file")"
        workdir=$(mktemp -d)

        pdfseparate -f 1 -l "$keep_until" "$file" "$workdir/page-%04d.pdf"
        pdfunite "$workdir"/page-*.pdf "$tmp" && mv "$tmp" "$file"

        rm -rf "$workdir"
        echo "Updated: $file, kept pages 1-$keep_until"
    else
        echo "Skipped: $file has only $pages pages"
    fi
done

# verify page counts after removal
find . -type f -name "$FILE_PATTERN" -print0 | while IFS= read -r -d '' file
do
    echo "$file"
    pdfinfo "$file" | grep Pages
done`,
    },
  ],
},
        {
      title: "Daily commands",
      blocks: [
        {
          kind: "table",
          headers: ["Command", "Action"],
          rows: [
            ["lpstat -p -d", "Show printer status and default"],
            ["lpstat -o", "Show queued jobs"],
            ["cancel JOB_ID", "Cancel a specific print job"],
            ["cancel -a", "Cancel all print jobs"],
            ["scanimage -L", "Show detected scanner devices"],
            ["simple-scan", "Open the GUI scanner app"],
            ["scanimage -d \"airscan:w1:EPSON L3250 Series\" --format=png --resolution 300 > ~/scans/document-page-1.png", "Scan one A4 page at 300 DPI"],
            ["scanimage -d \"airscan:w1:EPSON L3250 Series\" --format=png --resolution 250 > ~/scans/document-page-1.png", "Scan one smaller 250 DPI page"],
            ["scanimage -d \"epsonds:net:PRINTER_IP\" --format=png --resolution 300 > ~/scans/document-page-1.png", "Scan using the stable IP-based Epson backend"],
            ["file ~/scans/document-page-1.png", "Check PNG dimensions and format"],
            ["magick ~/scans/document-page-1.png -compress jpeg -quality 90 ~/scans/document.pdf", "Convert PNG scan to compressed PDF"],
            ["magick -density 150 ~/scans/document.pdf -compress jpeg -quality 80 ~/scans/document-under-limit.pdf", "Compress an existing PDF"],
            ["pdfunite ~/scans/document-page-1.pdf ~/scans/document-page-2.pdf ~/scans/combined-document.pdf", "Merge multiple PDFs into one"],
            ["ls -lh ~/scans/document.pdf", "Check final file size"],
            ["xdg-open ~/scans/document.pdf", "Open and visually verify the PDF"],
          ],
        },
      ],
    },
    {
      title: "Troubleshooting",
      blocks: [
        {
          kind: "text",
          bullets: [
            ".local discovery fails with host down: bypass the discovered hostname entry entirely and add manually by IP using lpd://PRINTER_IP/",
            "Driverless setup fails at PPD stage: install the Epson ESC/P-R driver and add again using the model specific entry",
            "Printing breaks after IP changes: reserve the printer IP in router DHCP settings to keep a stable address",
            "scanimage -L shows airscan:w0 first and later airscan:w1: use the exact current device name shown by scanimage -L",
            "AirScan scan command fails with Invalid argument: rerun scanimage -L and update the -d value, or use epsonds:net:PRINTER_IP as the more stable IP-based backend",
            "Output path fails with No such file or directory: create the folder first with mkdir -p ~/scans and remember that Linux paths are case-sensitive",
            "PDF is larger than the upload limit: convert PNG scans with magick using -compress jpeg -quality 90, then lower to 80 or 70 only if needed",
            "Existing PDF needs compression: use magick -density 150 input.pdf -compress jpeg -quality 80 output.pdf and visually verify readability after compression",
            "Final official PDF should be checked manually before upload: confirm all corners are visible, text is readable, signatures and stamps are clear, and the file is under the portal limit",
          ],
        },
      ],
    },
  ],
}

export default entry
#!/bin/bash
# Builds the game and installs it on the Batocera PC. Run from the repo root.
# Run again after any game update; saves are kept.
set -euo pipefail
HOST="${1:-batocera-nuc.local}"
ELECTRON=v45.2.0
export SSHPASS=linux
SSH=(sshpass -e ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR)
DEST=/userdata/system/4wd-simulator

npm run build
# Electron needs a printing library Batocera doesn't ship; take it from Debian 12.
CUPS=$(mktemp -d)
curl -fsSL -o "$CUPS/cups.deb" https://deb.debian.org/debian/pool/main/c/cups/libcups2_2.4.2-3+deb12u9_amd64.deb
(cd "$CUPS" && bsdtar -xf cups.deb && bsdtar -xf data.tar.xz)
"${SSH[@]}" "root@$HOST" "
  if [ ! -x $DEST/4wd-simulator ]; then
    curl -fsSL -o /tmp/electron.zip https://github.com/electron/electron/releases/download/$ELECTRON/electron-$ELECTRON-linux-x64.zip
    mkdir -p $DEST && unzip -q -o /tmp/electron.zip -d $DEST && rm /tmp/electron.zip
    mv $DEST/electron $DEST/4wd-simulator
  fi
  mkdir -p $DEST/resources/app/game"
rsync -aL -e "${SSH[*]}" "$CUPS/usr/lib/x86_64-linux-gnu/libcups.so.2" "root@$HOST:$DEST/"
rsync -a --delete -e "${SSH[*]}" --exclude game batocera/app/ "root@$HOST:$DEST/resources/app/"
rsync -a --delete -e "${SSH[*]}" dist/ "root@$HOST:$DEST/resources/app/game/"
rsync -a -e "${SSH[*]}" "batocera/4WD Simulator.sh" "root@$HOST:/userdata/roms/ports/"
"${SSH[@]}" "root@$HOST" "
  chmod +x '/userdata/roms/ports/4WD Simulator.sh'
  # 30 W while playing; the default 15 W starves the graphics chip (12 fps vs 45 fps).
  grep -q '4WD Simulator.sh\"\].tdp' /userdata/system/batocera.conf ||
    echo 'ports[\"4WD Simulator.sh\"].tdp=85' >> /userdata/system/batocera.conf"
# Ports tile: cover art and a menu entry, added once (play counts kept after that).
rsync -a -e "${SSH[*]}" batocera/cover.png "root@$HOST:/userdata/roms/ports/images/4WDSimulator.png"
"${SSH[@]}" "root@$HOST" '
  LIST=/userdata/roms/ports/gamelist.xml
  grep -q "4WD Simulator.sh" $LIST || sed -i "s|</gameList>|\t<game>\n\t\t<path>./4WD Simulator.sh</path>\n\t\t<name>4WD Simulator</name>\n\t\t<desc>A 4WD playground: climbs, creek crossings, bog holes and rock. No route, nothing to finish; drive any line in any of thirteen vehicles.</desc>\n\t\t<genre>Racing, Driving</genre>\n\t\t<image>./images/4WDSimulator.png</image>\n\t\t<thumbnail>./images/4WDSimulator.png</thumbnail>\n\t\t<developer>Steve Reid</developer>\n\t\t<players>1</players>\n\t\t<lang>en</lang>\n\t</game>\n</gameList>|" $LIST
  curl -s http://localhost:1234/reloadgames >/dev/null || true'

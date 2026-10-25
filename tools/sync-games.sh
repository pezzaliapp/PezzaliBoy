#!/usr/bin/env bash
# Aggiorna le cartucce scaricando l'ultima versione dei giochi dai repo GitHub di pezzaliapp,
# reinserisce il bridge della console e rigenera il service worker.
# Uso (dalla cartella del progetto):  bash tools/sync-games.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# id-cartuccia  repo  sottocartella-da-copiare
GAMES="
pacman    PAC-MAN-PWA       .
galaga    GalagaPWA         .
invaders  SpaceInvadersPWA  .
defender  DefenderPWA       .
frogger   FroggerPWA        .
centipede Centipede         .
qbert     QbertPWA          .
snake     Snake             .
aleskat   ALESKAT           .
atari2600 2600              .
sudoku    SUDOKU            .
ilcubo    ILCUBO            docs
tris      Tris              .
scacco    scacco            .
tama      TamaPWA           .
"

echo "$GAMES" | while read -r id repo sub; do
  [ -z "${id:-}" ] && continue
  echo "== $id <- pezzaliapp/$repo"
  git clone -q --depth 1 "https://github.com/pezzaliapp/$repo" "$TMP/$repo"
  src="$TMP/$repo/$sub"
  if [ "$sub" = "BUILD" ]; then
    (cd "$TMP/$repo" && npm install --no-audit --no-fund >/dev/null && node scripts/gen-icons.mjs >/dev/null && npx vite build --base ./ >/dev/null)
    src="$TMP/$repo/dist"
  fi
  rm -rf "$ROOT/games/$id"
  mkdir -p "$ROOT/games/$id"
  tar -C "$src" --exclude=.git --exclude=node_modules --exclude=./ios --exclude=./native --exclude=./store \
      --exclude=./tests --exclude=./resources --exclude=./scripts --exclude='*.md' --exclude='package*.json' \
      --exclude=capacitor.config.json --exclude=./legacy --exclude=readme.html --exclude='LICENSE*' --exclude='*.yml' \
      -cf - . | tar -C "$ROOT/games/$id" -xf -
  python3 - "$ROOT/games/$id/index.html" <<'EOF'
import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
tag = '<script src="../../gbx-bridge.js"></script>'
if tag not in s:
    m = re.search(r'<head[^>]*>', s, re.I)
    s = s[:m.end()] + '\n' + tag + s[m.end():] if m else tag + s
    open(p, 'w', encoding='utf-8').write(s)
EOF
done

python3 "$ROOT/tools/rebrand.py"
python3 "$ROOT/tools/build-sw.py"
echo "Fatto. Controlla in locale con:  python3 -m http.server  e apri http://localhost:8000"

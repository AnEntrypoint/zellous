set -e
MSG="$1"
HERE=$(cd "$(dirname "$0")" && pwd)
ZELLOUS=$(cd "$HERE/../.." && pwd)
DESIGN=${DESIGN_DIR:-$ZELLOUS/../design}
bash "$HERE/lint.sh" || { echo "SHIP BLOCKED: undefined names"; exit 1; }
(cd "$ZELLOUS" && node "$HERE/kinds.mjs") || { echo "SHIP BLOCKED: a message kind failed to render locally"; exit 1; }
(cd "$ZELLOUS" && node "$HERE/isolation.mjs") || { echo "SHIP BLOCKED: server isolation failed"; exit 1; }
(cd "$ZELLOUS" && node "$HERE/sweep.mjs") || { echo "SHIP BLOCKED: a cancel path failed"; exit 1; }
G="git -c user.name=lanmower -c user.email=lanmower@users.noreply.github.com"
cd "$DESIGN"
if [ -n "$(git status --short)" ]; then git add -A .; $G commit -q -m "$MSG"; fi
git push origin HEAD:main 2>&1 | tail -1
FULL=$(git rev-parse HEAD)
cd "$ZELLOUS"
WW=$(grep -o 'wireweave@[0-9a-f]\{40\}' docs/nostr-chat/index.html | head -1 | cut -d@ -f2)
wait200() { for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w '%{http_code}' "$1"); [ "$c" = 200 ] && return 0; sleep 6; done; echo "COLD $1 $c"; return 1; }
wait200 https://cdn.jsdelivr.net/gh/AnEntrypoint/design@$FULL/dist/247420.js
wait200 https://cdn.jsdelivr.net/gh/AnEntrypoint/design@$FULL/dist/247420.css
wait200 https://cdn.jsdelivr.net/gh/AnEntrypoint/wireweave@$WW/src/index.js
echo GUARD_OK
OLD=$(grep -o 'design@[0-9a-f]\{40\}' docs/nostr-chat/index.html | sort -u | head -1 | cut -d@ -f2)
sed -i "s/design@$OLD/design@$FULL/g" docs/nostr-chat/index.html
git add -A .
if ! git diff --cached --quiet; then $G commit -q -m "$MSG"; fi
git push origin main 2>&1 | tail -1
git ls-remote origin main | cut -c1-12
PUSHED=$(git rev-parse HEAD)
WANT_WW=$(grep -o 'wireweave@[0-9a-f]\{40\}' docs/nostr-chat/index.html | head -1 | cut -d@ -f2)
deployed() { P=$(curl -s "https://anentrypoint.github.io/zellous/nostr-chat/?cb=$(date +%s%N)"); [ "$(echo "$P" | grep -o 'design@[0-9a-f]\{40\}' | head -1 | cut -d@ -f2)" = "$FULL" ] && [ "$(echo "$P" | grep -o 'wireweave@[0-9a-f]\{40\}' | head -1 | cut -d@ -f2)" = "$WANT_WW" ]; }
redispatch() { gh workflow run gh-pages.yml --ref main -f attempt=2 >/dev/null 2>&1 && echo "re-dispatched attempt=2"; }
RUN_FAILED=0
poll() { for i in $(seq 1 $1); do deployed && echo DEPLOYED $i && return 0; if [ $((i % 4)) = 0 ] && [ "$RUN_FAILED" = 0 ]; then C=$(gh run list --limit 3 --json headSha,conclusion --jq "[.[] | select(.headSha == \"$PUSHED\" and .conclusion == \"failure\")] | length" 2>/dev/null); if [ "${C:-0}" -ge 1 ]; then echo "run for $PUSHED failed"; RUN_FAILED=1; redispatch; fi; fi; sleep 8; done; return 1; }
if ! poll 60; then
  echo "NOT DEPLOYED after 60 polls: $(gh run list --limit 1 --json status,conclusion,databaseId --jq '.[0] | "\(.status)/\(.conclusion)/\(.databaseId)"')"
  [ "$RUN_FAILED" = 0 ] && redispatch
  poll 60 || { echo "DEPLOY FAILED"; exit 1; }
fi
echo LIVE_PINS_MATCH design=$FULL wireweave=$WANT_WW
echo DESIGN=$FULL
node "$HERE/live.mjs" || { echo "LIVE CHECK FAILED"; exit 1; }

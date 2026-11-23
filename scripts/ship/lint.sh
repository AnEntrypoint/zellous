set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ZELLOUS=$(cd "$HERE/../.." && pwd)
DESIGN=${DESIGN_DIR:-$ZELLOUS/../design}
WIREWEAVE=${WIREWEAVE_DIR:-$ZELLOUS/../wireweave}
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/design" "$T/zjs" "$T/ww"
cp -r "$DESIGN/src/." "$T/design/"
cp -r "$ZELLOUS/docs/js/modules" "$ZELLOUS/docs/js/bridge" "$ZELLOUS/docs/js/adapter" "$T/zjs/"
cp "$ZELLOUS/docs/js/nostr-adapter.js" "$T/zjs/"
cp -r "$WIREWEAVE/src/." "$T/ww/"
cd "$T"
npx --yes eslint@9 -c "$HERE/eslint.config.mjs" -f json -o "$T/report.json" design/community-app design/modules design/components zjs ww >"$T/eslint.log" 2>&1 || true
[ -s "$T/report.json" ] || { echo "eslint produced no report:"; head -20 "$T/eslint.log"; exit 1; }
OUT=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));for(const f of r)for(const m of f.messages)if(m.ruleId==="no-undef")console.log(f.filePath.replace(process.argv[2]+"/","")+":"+m.line+" "+m.message)' "$T/report.json" "$T")
if [ -n "$OUT" ]; then echo "UNDEFINED NAMES:"; echo "$OUT" ; exit 1; fi
echo LINT_OK

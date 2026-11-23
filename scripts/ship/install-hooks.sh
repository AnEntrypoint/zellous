HERE=$(cd "$(dirname "$0")" && pwd)
HOOKS=$(git -C "$HERE" rev-parse --absolute-git-dir)/hooks
mkdir -p "$HOOKS"
cp "$HERE/prepush.sh" "$HOOKS/pre-push"
chmod +x "$HOOKS/pre-push"

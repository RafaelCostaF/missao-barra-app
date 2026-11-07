#!/usr/bin/env bash
# Publica o painel no GitHub Pages (branch gh-pages). Requer VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (anon é pública).
set -euo pipefail
DIR=$(cd "$(dirname "$0")/.." && pwd)
REPO=$(git -C "$DIR" remote get-url origin)
NAME=$(basename -s .git "$REPO")
: "${VITE_SUPABASE_URL:?}" "${VITE_SUPABASE_ANON_KEY:?}"
(cd "$DIR/apps/admin" && VITE_BASE="/$NAME/" npx vite build --emptyOutDir)
OUT="$DIR/apps/admin/dist"
touch "$OUT/.nojekyll"
git -C "$OUT" init -q -b gh-pages
git -C "$OUT" add -A
git -C "$OUT" -c user.name="$(git -C "$DIR" config user.name)" -c user.email="$(git -C "$DIR" config user.email)" commit -qm "deploy painel"
git -C "$OUT" push -qf "$REPO" gh-pages
rm -rf "$OUT/.git"
OWNER=$(gh repo view --json owner -q .owner.login)
gh api -X POST "repos/$OWNER/$NAME/pages" -f "source[branch]=gh-pages" -f "source[path]=/" >/dev/null 2>&1 || true # já habilitado = ok
echo "Publicado: https://$(echo "$OWNER" | tr 'A-Z' 'a-z').github.io/$NAME/"

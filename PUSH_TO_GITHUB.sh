#!/usr/bin/env bash
# One-time founder step: make this kit the canonical template repo (rule zero).
# Usage: ./PUSH_TO_GITHUB.sh [org-or-user] [repo-name]
set -euo pipefail
die(){ echo "✗ $1" >&2; exit 1; }

[ -f "$(dirname "$0")/vanilla/scripts/selftest.ts" ] || die "This looks like an OLD kit (no selftest). Re-download the latest zip and verify its md5."
gh auth status >/dev/null 2>&1 || die "GitHub CLI not logged in. Run: gh auth login"
[ -n "$(git config --global user.email || true)" ] || die 'Set your git identity first: git config --global user.name "You" && git config --global user.email "you@x.com"'

OWNER="${1:-$(gh api user -q .login)}"
REPO="${2:-ailabs-product-template}"
cd "$(dirname "$0")/vanilla"
[ -d .git ] || git init -qb main
git add -A && git commit -qm "feat: AI Labs template v2.3 — verified against its own gates" || true
gh repo create "$OWNER/$REPO" --private --source=. --push
gh repo edit "$OWNER/$REPO" --template
echo "TEMPLATE_REPO_OK: https://github.com/$OWNER/$REPO  (marked as template — the green button is live)"
echo "Waiting for CI to appear..." && sleep 8
gh run list --repo "$OWNER/$REPO" --limit 1 || true
echo "Follow it live:  gh run watch --repo $OWNER/$REPO   (press Enter to select the run)"

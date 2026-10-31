#!/bin/bash
# SessionStart hook for Claude Code cloud sessions: prepares the clone so that the
# git hook, `npm test` and `node scripts/build-icons.mjs` work right away.
set -euo pipefail

# Only in cloud sessions – a local clone is set up by hand (see AGENTS.md)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# 1. Git hook: regenerates the generated parts (CSP hashes, sw.js, …) before every commit
git config core.hooksPath .githooks

# 2. Test tools – only when package.json, the lock file or this script changed since the last install
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  npm install --no-audit --no-fund --ignore-scripts
  sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
fi

# 3. Browser for Playwright. Cloud images ship a preinstalled Chromium that may be older than the
#    one @playwright/test expects, and the browser download is often blocked. Then use the
#    preinstalled one via PW_CHROMIUM_PATH (read by playwright.config.mjs and build-icons.mjs).
can_launch() {
  PW_CHROMIUM_PATH="${1:-}" timeout 60 node --input-type=module -e "
    import { chromium } from '@playwright/test';
    const path = process.env.PW_CHROMIUM_PATH;
    const b = await chromium.launch(path ? { executablePath: path } : {});
    await b.close();" >/dev/null 2>&1
}

use_browser() {
  echo "export PW_CHROMIUM_PATH=\"$1\"" >> "${CLAUDE_ENV_FILE:-/dev/null}"
  echo "session-start: Playwright uses the preinstalled browser $1" >&2
}

# The browser found last time (kept in node_modules, so it goes away with a fresh install)
known=node_modules/.session-start-browser
if can_launch; then
  rm -f "$known"
elif [ -s "$known" ] && can_launch "$(cat "$known")"; then
  use_browser "$(cat "$known")"
else
  rm -f "$known"
  timeout 180 npx playwright install chromium >/dev/null 2>&1 || true
  if ! can_launch; then
    for dir in "${PLAYWRIGHT_BROWSERS_PATH:-}" /opt/pw-browsers "$HOME/.cache/ms-playwright"; do
      [ -n "$dir" ] && [ -d "$dir" ] || continue
      for exe in $(ls -d "$dir"/chromium_headless_shell-*/*/chrome-headless-shell 2>/dev/null | sort -V -r); do
        if can_launch "$exe"; then echo "$exe" > "$known"; break 2; fi
      done
    done
    if [ -s "$known" ]; then
      use_browser "$(cat "$known")"
    else
      echo "session-start: no working Chromium for Playwright found – npm test will fail" >&2
    fi
  fi
fi

#!/usr/bin/env bash
# Send one message to the user's Telegram.
#
# This is the only Telegram automation there is meant to be. No heartbeat, no poller, no periodic
# report - those existed once, the user stopped them twice, and the rule now is that this script
# is called by hand. See SKILL.md for the three occasions.
#
#   tg.sh "message"
#   echo "message" | tg.sh
#
# Credentials come from the environment first, then ~/.claude/local/telegram.env. Neither lives in
# a repository: a token in a commit is a stolen bot.

set -euo pipefail

ENV_FILE="${TG_ENV_FILE:-$HOME/.claude/local/telegram.env}"
if [ -z "${TG_TOKEN:-}" ] && [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$ENV_FILE"
fi

if [ -z "${TG_TOKEN:-}" ] || [ -z "${TG_CHAT:-}" ]; then
    echo "telegram is not set up on this machine." >&2
    echo "run: bash $(dirname "$0")/tg-setup.sh <bot token>" >&2
    exit 2
fi

text="${1-}"
[ -z "$text" ] && text="$(cat)"
[ -z "$text" ] && { echo "nothing to send" >&2; exit 1; }

# Telegram rejects anything over 4096 characters outright, so a long report would fail entirely
# rather than arrive shortened. Cut it here and say so, since a truncated message that arrives
# beats a complete one that does not.
if [ "${#text}" -gt 4000 ]; then
    text="${text:0:3960}
… (잘림)"
fi

code=$(curl -s -X POST "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT}" \
    --data-urlencode "text=${text}" \
    --data-urlencode "disable_web_page_preview=true" \
    -o /tmp/tg-send.$$ -w '%{http_code}')

if [ "$code" != "200" ]; then
    echo "$code" >&2
    # The body says which of the failures it is - a wrong token, a blocked bot, a bad chat id.
    # Printing it is the difference between fixing it and guessing.
    sed 's/bot[0-9]\{6,\}:[A-Za-z0-9_-]\{20,\}/bot<TOKEN>/g' "/tmp/tg-send.$$" >&2 || true
    rm -f "/tmp/tg-send.$$"
    exit 1
fi
rm -f "/tmp/tg-send.$$"
echo "$code"

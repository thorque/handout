#!/usr/bin/env bash
# Checks that every commit in <base-ref>..<head-ref> carries a Signed-off-by trailer.
#
# The range is the pull request's own commits, never the whole history: the rule applies
# from the day it was introduced, not retroactively to commits made before it existed.
#
# Merge commits are skipped: a merge GitHub creates for a pull request is nobody's own
# contribution and must not be required to carry a trailer.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: check-signoff.sh <base-ref> <head-ref>" >&2
  exit 2
fi

base="$1"
head="$2"

commits=$(git rev-list --no-merges "$base..$head")

if [ -z "$commits" ]; then
  echo "no commits in $base..$head to check"
  exit 0
fi

missing=""
count=0
while IFS= read -r sha; do
  count=$((count + 1))
  trailer=$(git show -s --format='%(trailers:key=Signed-off-by,valueonly)' "$sha")
  if [ -z "$trailer" ]; then
    missing="${missing}${sha}"$'\n'
  fi
done <<<"$commits"

if [ -n "$missing" ]; then
  echo "commits without a Signed-off-by trailer:" >&2
  while IFS= read -r sha; do
    [ -n "$sha" ] || continue
    git show -s --format='%h %s' "$sha" >&2
  done <<<"$missing"
  echo >&2
  echo "fix the last commit:  git commit --amend -s" >&2
  echo "fix a whole branch:   git rebase --signoff $base" >&2
  exit 1
fi

# Presence only, no shape validation: the check is about the assertion being on the
# record, not about validating an email. A regex over names would invite false reds
# without catching anything a `git commit -s` user would ever hit.
echo "checked $count commit(s) in $base..$head, all signed off"

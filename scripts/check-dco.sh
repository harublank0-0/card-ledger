#!/bin/sh
# Check that every commit in a range carries a Developer Certificate of Origin sign-off.
#
#   sh scripts/check-dco.sh origin/main..HEAD
#
# A commit passes when it has a `Signed-off-by: Name <email>` trailer whose email equals the
# commit author's email (case-insensitive). Merge commits are skipped: GitHub creates them
# without a sign-off. Run it from inside the repository; CI runs it on pull requests.
#
# Exit status: 0 all signed off, 1 at least one commit is not, 2 usage or git error.
set -eu

if [ "$#" -ne 1 ] || [ -z "$1" ]; then
	echo "usage: sh scripts/check-dco.sh <revision-range>   (for example: origin/main..HEAD)" >&2
	exit 2
fi
range="$1"

if ! commits="$(git rev-list --no-merges --reverse "$range" 2>/dev/null)"; then
	echo "check-dco: cannot list commits for '$range'" >&2
	exit 2
fi

total=0
bad=0
report=""

for commit in $commits; do
	total=$((total + 1))
	author="$(git show -s --format='%ae' "$commit" | tr '[:upper:]' '[:lower:]')"
	signoff_emails="$(
		git show -s --format='%(trailers:key=Signed-off-by,valueonly,unfold)' "$commit" |
			sed -n 's/.*<\([^>]*\)>.*/\1/p' |
			tr '[:upper:]' '[:lower:]'
	)"
	if ! printf '%s\n' "$signoff_emails" | grep -Fxq -- "$author"; then
		bad=$((bad + 1))
		report="${report}  $(git show -s --format='%h %s' "$commit")  (author: $author)
"
	fi
done

noun="commits"
[ "$total" -eq 1 ] && noun="commit"

if [ "$bad" -gt 0 ]; then
	echo "DCO check failed: $bad of $total $noun lack a Signed-off-by line matching the author's email:" >&2
	printf '%s' "$report" >&2
	cat >&2 <<'EOF'

Fix it by signing off, then force-push your branch:
  git rebase --signoff <base-branch>      # every commit on your branch
  git commit --amend -s --no-edit         # only the last commit
See CONTRIBUTING.md ("Sign your commits (DCO)").
EOF
	exit 1
fi

echo "DCO check passed: $total $noun signed off."

# Releasing

How a release of Card Ledger is cut, and the mistakes this order is built to avoid. A tag is a
public promise about one commit, so the order matters: the code and the notes are merged first,
the tag comes last.

`main` only takes pull requests (ruleset `protect-main`), and tags matching `v*` cannot be deleted
or moved once pushed (ruleset `protect-release-tags`). Nothing here needs a special permission
beyond push access to tags and the right to publish a release.

## Before you tag

1. Every change for the release is merged, and CI is green on `main` for the merge commit you are
   about to tag (all three required checks, plus the informational audit).
2. [`CHANGELOG.md`](../CHANGELOG.md) has a section for the version, newest first, with the release
   date in its heading and no "unreleased". Its known limitations are the ones the audit document
   and the README still list. The tests in `src/changelog.test.ts` check the count of fixed
   findings and the date.
3. The release body is generated from that section, not retyped (below).

## Tag

```sh
git fetch origin
git switch main
git pull --ff-only
git log --oneline -1          # must be the merge commit you meant to release
git tag -a v0.1.0 -m "Card Ledger 0.1.0"
git push origin v0.1.0
```

`git tag -a` tags whatever is checked out, so the `git log` line is the check. Tag only after the
merge: a tag created earlier points at an older commit, and the release notes then describe code
that the tag does not contain.

## The release body

A release page does not resolve relative links, so `[SECURITY.md](./SECURITY.md)` copied from the
changelog is a dead link there. This command prints the version's section without its heading,
with every relative link pointed at the tagged file. Change `VERSION`, and add `| pbcopy` (macOS)
or `| xclip -selection clipboard` to copy it:

```sh
VERSION=0.1.0
awk -v v="$VERSION" 'index($0, "## " v " ") == 1 {f=1; next} /^## / {f=0} f' CHANGELOG.md \
  | sed -E "s#\]\(\./([^)]+)\)#](https://github.com/haruBlank0-0/card-ledger/blob/v$VERSION/\1)#g" \
  | sed '1{/^$/d;}'
```

`src/releasing.test.ts` runs this exact command against the changelog.

## Publish

1. Releases, then **Draft a new release**, and choose the tag you pushed.
2. Title: `Card Ledger 0.1.0` (no leading space).
3. Paste the body from above.
4. Tick **Set as a pre-release** while the version is 0.x.
5. Publish, then check the page: the commit shown is the one you meant, and a link or two from
   the body opens the file rather than a 404.

## Mistakes this order avoids

- **A tag before the merge.** The release then describes commits the tag does not contain. Delete
  the wrong tag (`git tag -d` and `git push origin --delete`) **before** creating a release from
  it, because the draft-release page happily attaches to an existing tag.
- **Relative links in the body.** They resolve against the release URL and break.
- **Moving a published tag.** The tag ruleset blocks it on purpose. To correct a release, publish
  the next version.
- **A number that drifts.** Counts such as fixed findings are computed from the audit table by a
  test; a number in the notes is a statement about that release and is not edited afterwards.

## After the release

Record it: the status paragraph in [`AGENTS.md`](../AGENTS.md), the Progress table in
[`docs/roadmap.md`](./roadmap.md) and the checklist in
[`docs/pre-publication-audit.md`](./pre-publication-audit.md). A new version starts as a new
section at the top of `CHANGELOG.md`; the sections below it are left as they were.

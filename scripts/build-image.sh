#!/bin/sh
# Build the application image the way a published image is built.
#
#   sh scripts/build-image.sh <image-ref>
#
# The image-check and publish workflows both call this, so what CI checks on a pull request is
# what a release pushes. The reference is taken as given (for example
# ghcr.io/haruBlank0-0/card-ledger:1.2.3-amd64). Optional environment:
#
#   IMAGE_VERSION    label org.opencontainers.image.version (default: dev)
#   IMAGE_REVISION   the commit the image is built from (default: `git rev-parse HEAD`)
#   IMAGE_SOURCE     the repository URL (default: this project's)
#
# `--pull` takes the newest base image, so a rebuild gets base-image security fixes; the build
# itself is fully described by the Dockerfile and the lockfile.
set -eu

cd "$(dirname "$0")/.."

ref="${1:-}"
if [ -z "$ref" ]; then
	echo "usage: sh scripts/build-image.sh <image-ref>   (for example ghcr.io/owner/card-ledger:1.2.3-amd64)" >&2
	exit 2
fi

version="${IMAGE_VERSION:-dev}"
revision="${IMAGE_REVISION:-}"
if [ -z "$revision" ]; then
	revision="$(git rev-parse HEAD 2>/dev/null || true)"
fi
[ -n "$revision" ] || revision="unknown"
source_url="${IMAGE_SOURCE:-https://github.com/haruBlank0-0/card-ledger}"

exec docker build \
	--pull \
	--tag "$ref" \
	--label "org.opencontainers.image.title=Card Ledger" \
	--label "org.opencontainers.image.source=$source_url" \
	--label "org.opencontainers.image.revision=$revision" \
	--label "org.opencontainers.image.version=$version" \
	--label "org.opencontainers.image.licenses=AGPL-3.0-only" \
	.

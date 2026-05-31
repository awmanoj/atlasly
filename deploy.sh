#!/usr/bin/env bash
set -euo pipefail

DOCKER_USER="${DOCKER_USER:-awmanoj}"

IMAGE="awmanoj/atlasly"
TAG="${1:-$(git rev-parse --short HEAD)}"

echo ">> Building $IMAGE:$TAG"

if docker buildx version >/dev/null 2>&1; then
  echo ">> Using docker buildx (multi-arch: linux/amd64,linux/arm64)"
  docker buildx build \
    --platform linux/amd64,linux/arm64 \
    -t "$IMAGE:$TAG" \
    -t "$IMAGE:latest" \
    --push \
    .
else
  echo ">> buildx not available; falling back to classic docker build (single-arch)"
  docker build -t "$IMAGE:$TAG" -t "$IMAGE:latest" .
  docker push "$IMAGE:$TAG"
  docker push "$IMAGE:latest"
fi

echo "Done: ${IMAGE}"

#!/usr/bin/env bash
set -euo pipefail

DOCKER_USER="${DOCKER_USER:-awmanoj}"
IMAGE_NAME="${IMAGE_NAME:-atlasly}"
TAG="${TAG:-latest}"

IMAGE="${DOCKER_USER}/${IMAGE_NAME}:${TAG}"

echo "Building ${IMAGE}..."
docker build -t "${IMAGE}" .

echo "Pushing ${IMAGE} to Docker Hub..."
docker push "${IMAGE}"

echo "Done: ${IMAGE}"

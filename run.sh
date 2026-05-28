#!/usr/bin/env bash
set -euo pipefail

DOCKER_USER="${DOCKER_USER:-awmanoj}"
IMAGE_NAME="${IMAGE_NAME:-atlasly}"
TAG="${TAG:-latest}"
CONTAINER_NAME="${CONTAINER_NAME:-atlasly}"
HOST_PORT="${HOST_PORT:-8090}"

IMAGE="${DOCKER_USER}/${IMAGE_NAME}:${TAG}"

echo "Pulling ${IMAGE}..."
docker pull "${IMAGE}"

if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping and removing existing container ${CONTAINER_NAME}..."
  docker rm -f "${CONTAINER_NAME}" >/dev/null
fi

echo "Starting ${CONTAINER_NAME} on port ${HOST_PORT}..."
docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart unless-stopped \
  -p "${HOST_PORT}:8090" \
  "${IMAGE}"

echo "Running: http://localhost:${HOST_PORT}"

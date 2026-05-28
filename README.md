# Atlasly

Mark where you've been. Discover where to go.

Atlasly is a small, single-page travel atlas. Click countries on the world map to mark them as **visited** or **wishlisted**, search for cities to pin them, and watch your continent-by-continent progress fill in. Everything lives in your browser — no account, no backend, no tracking.

## Features

- Interactive SVG world map covering the 195 sovereign states (193 UN members + Vatican & Palestine).
- Two marking modes: **Visited** and **Wishlist**, with separate counters and progress bar.
- City pins via [OpenStreetMap Nominatim](https://nominatim.openstreetmap.org/) search.
- Continent breakdown (Africa, Asia, Europe, N. America, S. America, Oceania).
- Share button (encodes your map into a URL) and Reset.
- State persisted to `localStorage` (v2 schema, with v1 migration).

## Stack

- Pure HTML + CSS + vanilla JS — no build step, no framework.
- World map: [`@svg-maps/world`](https://www.npmjs.com/package/@svg-maps/world) loaded from jsDelivr.
- Geocoding: Nominatim public API.

## Run locally

Any static file server works. The simplest:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Docker

A minimal Alpine + Python image serves the three static files on port `8000`.

### Build & push

```bash
./deploy.sh
# overrides:
DOCKER_USER=youruser IMAGE_NAME=atlasly TAG=v1 ./deploy.sh
```

### Pull & run

```bash
./run.sh
# overrides:
HOST_PORT=8080 CONTAINER_NAME=atlasly ./run.sh
```

`run.sh` pulls the published image, removes any existing container of the same name, and starts a fresh one with `--restart unless-stopped`.

## Project layout

```
index.html    Markup and layout
styles.css    All styling
app.js        Map loading, state, search, persistence, sharing
Dockerfile    Alpine + python -m http.server
deploy.sh     docker build && docker push
run.sh        docker pull && docker run
```

## Data & privacy

All map state is stored in your browser's `localStorage` under the key `atlasly:v2`. City search queries go to Nominatim; nothing else leaves the browser.

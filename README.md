# Fabric Mod Manager

Lightweight full-stack app for browsing Modrinth, installing Fabric mods into a mounted server mods directory, disabling mods by renaming them to `.jar.disabled`, and deleting installed jars.

## Stack

- React + Vite frontend
- Node.js + Express backend
- Tailwind CSS v4 styling through the Vite plugin
- Docker-ready runtime with a shared `/mods` volume

## Environment

The backend reads these variables:

- `PORT`: HTTP port for the combined app, defaults to `3001`
- `MODS_DIR`: absolute path to the mounted Fabric mods folder, defaults to `/mods`
- `MINECRAFT_VERSION`: version filter used for Modrinth search and install, defaults to `1.21`

## Local Development

```bash
npm install
npm run dev
```

This starts the Vite UI and the Express API together. The Vite dev server proxies `/api/*` requests to port `3001`.

## Production Build

```bash
npm run build
npm start
```

## Docker

The included compose file assumes your server mods directory lives at `~/appdata/minecraft-fabric/mods`.

```bash
docker compose up -d --build
```

## API Overview

- `GET /api/mods/installed`: list local `.jar` and `.jar.disabled` files
- `GET /api/mods/search?query=...&page=1`: Modrinth search scoped to Fabric and your configured Minecraft version
- `POST /api/mods/install`: install the latest compatible release for a Modrinth project
- `POST /api/mods/toggle`: rename `mod.jar` to `mod.jar.disabled` or back again
- `DELETE /api/mods/:fileName`: delete an installed mod file

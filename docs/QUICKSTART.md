# Quickstart — run the app locally

These steps assume a Linux developer workstation (zsh/bash). They show how to run the Meteor-based Topogram app locally for development.

1) Prerequisites

- Node.js (LTS, e.g., 18.x or 20.x) — Meteor installs a compatible Node runtime during build, but having a system Node is convenient.
- Meteor 3.x (install from https://www.meteor.com/install)
- MongoDB (if you prefer running a local Mongo instance). Meteor comes with a local MongoDB for development.

2) Install dependencies

Open a terminal in the project root (this repo):

```bash
cd /path/to/topogram-m3-app
npm install
```

3) Run the app

Start Meteor in development mode:

```bash
meteor run
```

Open http://localhost:3000 in your browser. If you rely on a remote database or environment variables, set them before starting Meteor.

4) Testing

Run unit tests (Meteor test harness):

```bash
npm test
# or
meteor test --once --driver-package meteortesting:mocha
```

5) Developer tips

- If you're working on UI components, edit files under `imports/ui/` and use your editor's React/JSX linting.
- The Cytoscape network lives under `imports/ui/components/Network.jsx` (or similar). Geo map files are in `imports/ui/components/geoMap/`.
- If you make schema changes (imports/api/*), update migration scripts under `imports/schemas` or `imports/startup/server/`.

6) Common issues

- Meteor complaining about `aldeed:simple-schema` vs `simpl-schema`: the repo uses a lightweight shim in `imports/schemas/SimpleSchema.js` to keep compatibility.
- If selection on the GeoMap doesn't register: ensure `ui.selectedElements` is being synced between components — see `TopogramDetail.jsx`.

# Meteor Usage Guide for Topogram

This document summarizes how to run the Meteor application that powers Topogram, how to point it at different MongoDB instances (local or Docker), and how to configure the admin bootstrap parameters and helper scripts.

## Prerequisites
- Node.js and the Meteor CLI (`curl https://install.meteor.com/ | sh`).
- `mongosh` (MongoDB Shell) in your `PATH`.
- Optional: Docker Desktop or a Docker Engine host if you plan to run MongoDB in a container.

## Running Meteor with the default local database
1. From the repository root, start the dev server:
   ```bash
   meteor --port 3001
   ```
2. Meteor launches a local MongoDB in `.meteor/local/db`. The TCP port is recorded in `.meteor/local/db/METEOR-PORT` (normally 3002). You can inspect the data directly via `mongosh --port $(cat .meteor/local/db/METEOR-PORT)`.
3. Imported Topograms, nodes, and edges are stored in the `meteor` database inside that local Mongo.

### Importing Debian topograms locally
- Use the helper script to bulk import sample CSVs:
  ```bash
  ./scripts/import_topograms_folder.py --dir samples/topograms/debian --commit
  ```
- The script writes directly into the Mongo instance detected from `.meteor/local/db/METEOR-PORT`. Make sure the running Meteor app is using the same database; otherwise the UI will not see the imported records.
- When you target an external MongoDB (for example the Docker container), supply `--mongo-url mongodb://localhost:27017/meteor` so the importer inserts into the same database that `MONGO_URL` references.

## Running Meteor against a Docker MongoDB
1. Start a MongoDB container that exposes port 27017:
   ```bash
   docker run -d --name topogram-mongo -p 27017:27017 mongo:6.0
   ```
   > For oplog/reactivity support, run the container with a replica set, e.g. `--replSet rs0`, then run `mongosh --eval 'rs.initiate()'` once.
2. Stop any Meteor process that is still attached to the local `.meteor` database (`Ctrl+C`).
3. Relaunch Meteor with the Docker connection string:
   ```bash
   MONGO_URL='mongodb://localhost:27017/meteor' meteor --port 3001
   ```
   - Replace `localhost` with the appropriate host if Docker is remote.
   - If you enabled a replica set, also pass `MONGO_OPLOG_URL='mongodb://localhost:27017/local?replicaSet=rs0'`.
4. If you need existing data from the local dev DB, export it first and import it into the Docker Mongo:
   ```bash
   ./scripts/export_meteor_mongo.sh --out exports/meteor_dump.tar.gz
   tar -xzf exports/meteor_dump.tar.gz -C /tmp/meteor_dump
   for f in /tmp/meteor_dump/*.jsonl.gz; do
     coll=$(basename "$f" .jsonl.gz)
     gunzip -c "$f" | mongosh "mongodb://localhost:27017/meteor" --eval "db.getSiblingDB('meteor').getCollection('$coll').deleteMany({}); db.getSiblingDB('meteor').getCollection('$coll').insertMany(JSON.parse('[' + cat() + ']'))"
   done
   ```
   (Alternatively, direct the `gunzip` stream into `mongoimport` running inside the container.)

## Admin bootstrap parameters
The server automatically provisions or updates an administrative user during startup using environment variables or `Meteor.settings` values. Relevant keys:

| Variable / Setting       | Purpose                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| `ADMIN` / `admin`        | Admin username. Required to enable bootstrap logic.                     |
| `ADMIN_EMAIL` / `adminEmail` | Optional email assigned to the admin user.                             |
| `ADMIN_PASS` / `adminPass`   | Password used when creating a new admin user. Required when `ADMIN` is set and the user does not already exist. |
| `ADMIN_UPDATE_PASS` / `adminUpdatePass` | If set, updates the existing admin password without recreating the user. |

- These variables are read in `/imports/startup/server/accounts.js`.
- Admin-only server methods (e.g., `topogram.delete`) check the caller against these values.
- Provide the variables on the command line when starting Meteor:
  ```bash
  ADMIN=admin ADMIN_PASS=change-me meteor --port 3001
  ```

## Authentication and imports
- The user-facing CSV import UI (`ImportCsvModal`) invokes the Meteor method `topogram.enqueueCsvImport`, which requires a logged-in user. Anonymous users receive `Meteor.Error('unauthorized', 'Must be logged in to import')`.
- The Python helper `import_topograms_folder.py` bypasses Meteor methods and writes directly to MongoDB. Use it only for trusted migration tasks and ensure it targets the same database instance that the app uses (match `MONGO_URL` vs `--port` or `.meteor/local`).

### Edge metadata and arrows
- Both the UI importer and `import_topograms_folder.py` understand column headers such as `source`, `target`, `relationship`, `relationshipEmoji`, `color`, `weight`, and `enlightement`.
- Topogram renders arrowheads when an edge document contains `enlightement: 'arrow'`. Any other value (or a missing field) is treated as a plain line.
- When preparing CSVs, include the `enlightement` column and set its value to `arrow` for rows that should display directional arrows. The helper script preserves this field when inserting into Mongo.
- Additional edge metadata (relationship labels, colors, emojis) is also copied into the database, so custom presentations can reuse the same CSVs without post-processing.

## Troubleshooting tips
- If the Home page shows only a handful of topograms even after importing Debian data, confirm that the running Meteor process points to the database that contains the imported documents (`meteor shell` → `require('/imports/api/collections').Topograms.find({ folder: 'Debian' }).count()` should match the `mongosh` count).
- When you change `MONGO_URL`, restart Meteor so it reconnects to the new database.
- Ensure your shell user belongs to the `docker` group before invoking `docker` commands without `sudo` (`sudo groupadd docker`, `sudo usermod -aG docker $USER`, then re-login).

## Related scripts and references
- `scripts/import_topograms_folder.py` — bulk importer for `.topogram.csv` datasets.
- `scripts/export_meteor_mongo.sh` — exports all Meteor collections to gzipped JSONL files.
- `imports/api/adminMethods.js` — admin-only Meteor methods (delete topograms, admin checks).
- `imports/startup/server/accounts.js` — admin auto-creation and password update logic.

Use this guide as a checklist when switching between local and Docker-backed MongoDBs or when provisioning new environments for Topogram development.

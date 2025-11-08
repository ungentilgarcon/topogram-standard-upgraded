# Recent progress (week of 2025-11-02 → 2025-11-08)

Latest changes after merging `topodeschandling` back into `main`:

- **Home experience** – the Home page cards were rescaled, shifted to the compact "elevated" style, and now show About / Move / Delete / Export actions stacked beneath the title. Folder headers gained a green SVG folder icon, counts, and an admin-only delete button with confirmation options.
- **About dialog** – Topogram imports persist `graph_desc`; the About button renders the Markdown safely in a reusable dialog used by Home and the detail view side panel.
- **Folder administration** – new server methods and UI dialogs allow admins to create folders, move maps (with undo toast), and delete folder metadata or cascade-delete maps. Folder counts are exposed through `topograms.folderCounts` and displayed in the UI.
- **Denormalised metrics** – `nodeCount` and `edgeCount` live on each Topogram. Import jobs set them, node/edge mutations `$inc` them, and a startup backfill populates any missing values so the UI never counts from scratch.
- **Styling & pagination polish** – compact padding, tightened pagination controls, and responsive wrapping eliminate overflow while keeping cards readable on wide monitors.
- **Documentation & history** – README and documentation index were refreshed; `docs/CHANGELOG_FULL.md` now captures every commit across merged branches for traceability.

See `CHANGELOG.md` for a narrative summary and `docs/CHANGELOG_FULL.md` for the complete commit history.

Samples for Topogram Builder

This folder contains synthetic data files to exercise the Builder import and mapping flows.

Files:
- node_only.csv: simple nodes-only CSV with emoji and notes.
- node_edge.csv: CSV containing nodes followed by edges (edges have source/target).
- graph.json: structured JSON { nodes: [...], edges: [...] } matching builder expectations.
- array_rows.json: JSON array of mixed rows (some nodes, some edges) to test classification and mapping.
- mismatched.csv: CSV with alias column names (e.g. _id, title, src, dst, em) to test mapping heuristics and manual mapping.
- libre_utf7.csv: CSV including a sample LibreOffice-style +...- encoding fragment to exercise the UTF-7 segment decoder in the server worker.
- sample_nodes_edges.topogram.xlsx / .ods: spreadsheet with separate "Nodes" and "Edges" sheets (recommended sheet layout). Useful for verifying server/UI sheet detection.
- sample_single_sheet.topogram.xlsx / .ods: spreadsheet with a single mixed sheet (nodes first, then edges). Useful for verifying mixed-sheet detection.

Use these files by opening the Builder page or the Home import modal and importing them to see mapping suggestions and merge behavior. The CLI importer also recognizes the `.topogram.xlsx` and `.topogram.ods` naming convention.

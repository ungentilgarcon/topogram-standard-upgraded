#!/usr/bin/env python3
"""
Import Topogram CSV files from a folder into the local Meteor MongoDB.

Usage:
  ./scripts/import_topograms_folder.py --dir samples/topograms/debian --commit

By default the script runs in dry-run mode and prints counts. Use --commit to write.
It detects Meteor's port from .meteor/local/db/METEOR-PORT or falls back to 3001.

This script shells out to `mongosh --port <port> --eval <js>` to perform inserts so it
doesn't require extra Python MongoDB deps and works with the Meteor local DB.

The script expects Topogram CSV files where node rows start with an id (first column)
and edge rows have empty first columns and source/target columns later (old Topogram
CSV format). It creates a Topogram document per file, then inserts nodes and edges with
`topogramId` referencing the created _id.

Safety: this script will not overwrite existing Topogram documents with the same id.
It generates new ids using ObjectId() in Mongo where needed.
"""

import argparse
import csv
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path


def detect_meteor_port():
    p = Path('.meteor/local/db/METEOR-PORT')
    if p.exists():
        try:
            return int(p.read_text().strip())
        except Exception:
            pass
    return 3001


def find_topogram_files(root):
    rootp = Path(root)
    if not rootp.exists():
        raise SystemExit(f"Folder not found: {root}")
    return sorted([str(p) for p in rootp.rglob('*.topogram.csv')])


def parse_topogram_csv(path):
    nodes = []
    edges = []
    with open(path, newline='', encoding='utf-8') as fh:
        reader = csv.reader(fh)
        # skip header rows until we find the header line that starts with 'id' or similar
        header = None
        rows = list(reader)
        if not rows:
            return nodes, edges
        # If first row contains 'id' or 'title' treat it as header
        if any('id' == c.lower() or 'title' == c.lower() for c in rows[0]):
            header = [c.strip() for c in rows[0]]
            body = rows[1:]
        else:
            # No header: assume fixed format where nodes have many columns and edges have blanks in first cols
            body = rows
        for r in body:
            if not any(cell.strip() for cell in r):
                continue
            # detect edge row: first field empty
            if len(r) > 0 and (r[0].strip() == '' or r[0].strip().lower() == 'edge'):
                # heuristic: edge rows have source in column 5 and target in column 6 in some exports
                src = r[4].strip() if len(r) > 4 else ''
                tgt = r[5].strip() if len(r) > 5 else ''
                if not src or not tgt:
                    # fallback: try cols 2/3
                    src = r[1].strip() if len(r) > 1 else src
                    tgt = r[2].strip() if len(r) > 2 else tgt
                edges.append({'source': src, 'target': tgt, 'raw': r})
            else:
                # node row: take id, title, label heuristically
                nid = r[0].strip()
                title = r[1].strip() if len(r) > 1 else nid
                label = r[2].strip() if len(r) > 2 else title
                nodes.append({'id': nid, 'title': title, 'label': label, 'raw': r})
    return nodes, edges


def mongo_insert(port, js_expr, dry_run=True):
    # js_expr should be a complete JS expression that prints JSON at the end
    cmd = ['mongosh', '--port', str(port), '--quiet', '--eval', js_expr]
    if dry_run:
        print('[DRY-RUN] would run mongosh with port', port)
        # just return a dummy success
        return {'ok': True, 'dry': True}
    print('Running mongosh --port', port)
    res = subprocess.run(cmd, check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if res.returncode != 0:
        print('mongosh error:', res.stderr.strip())
        return {'ok': False, 'error': res.stderr.strip(), 'stdout': res.stdout}
    out = res.stdout.strip()
    try:
        return json.loads(out)
    except Exception:
        return {'ok': True, 'raw': out}


def build_and_insert(topogram_name, nodes, edges, port, dry_run=True):
    # Create Topogram doc with a generated _id and metadata
    # Use a JS snippet that inserts topogram, nodes, edges and returns counts
    title = os.path.basename(topogram_name)
    safe_title = json.dumps(title)
    # Build arrays as JSON
    nodes_js = json.dumps([{'_id': None, 'id': n['id'], 'title': n['title'], 'label': n['label']} for n in nodes])
    edges_js = json.dumps([{'_id': None, 'source': e['source'], 'target': e['target']} for e in edges])
    js = f"""
(function(){{
  const top = {{ title: {safe_title}, source: 'imported-folder', folder: 'Debian', createdAt: new Date() }};
  // create ObjectId for topogram
  top._id = new ObjectId();
  db.getCollection('topograms').insertOne(top);
  const nodelist = {nodes_js};
  nodelist.forEach(n => {{ n.topogramId = top._id; if(!n._id) n._id = new ObjectId(); }});
  if(nodelist.length) db.getCollection('nodes').insertMany(nodelist);
  const edgelist = {edges_js};
  edgelist.forEach(e => {{ e.topogramId = top._id; if(!e._id) e._id = new ObjectId(); }});
    if(edgelist.length) db.getCollection('edges').insertMany(edgelist);
    return JSON.stringify({{ok:true, topogramId: top._id.str, nodes: nodelist.length, edges: edgelist.length}});
}})();
"""
    # Escape newlines for shell consumption
    js_single = js.replace('\n', '\\n')
    return mongo_insert(port, js, dry_run=dry_run)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--dir', required=True, help='Folder with .topogram.csv files')
    p.add_argument('--port', type=int, default=None, help='MongoDB port (defaults to Meteor port)')
    p.add_argument('--commit', action='store_true', help='Actually write to DB; otherwise dry-run')
    args = p.parse_args()

    port = args.port or detect_meteor_port()
    files = find_topogram_files(args.dir)
    if not files:
        print('No .topogram.csv files found in', args.dir)
        return

    print(f'Found {len(files)} files in {args.dir}; port={port}; commit={args.commit}')
    total_nodes = 0
    total_edges = 0
    for fp in files:
        print('Parsing', fp)
        nodes, edges = parse_topogram_csv(fp)
        print(f'  parsed nodes={len(nodes)}, edges={len(edges)}')
        total_nodes += len(nodes)
        total_edges += len(edges)
        if args.commit:
            res = build_and_insert(fp, nodes, edges, port, dry_run=not args.commit)
            print('  insert result:', res)
    print('Summary: files=', len(files), 'nodes=', total_nodes, 'edges=', total_edges)

if __name__ == '__main__':
    main()

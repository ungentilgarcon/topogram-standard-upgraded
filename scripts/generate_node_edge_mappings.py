#!/usr/bin/env python3
import argparse
import json
import os
import csv

TOPOGRAM_HEADER = [
    'id', 'name', 'label', 'description', 'color', 'fillColor', 'weight', 'rawWeight',
    'lat', 'lng', 'start', 'end', 'time', 'date', 'source', 'target', 'edgeLabel',
    'edgeColor', 'edgeWeight', 'relationship', 'enlightement', 'emoji', 'extra'
]


def topogram_node_row(node):
    return {
        'id': node.get('id',''),
        'name': node.get('label',''),
        'label': (f"{node.get('label','')}()" if node.get('type')=='function' else node.get('label','')),
        'description': node.get('type',''),
        'color': node.get('color',''),
        'fillColor': node.get('fillColor',''),
        'weight': node.get('weight',''),
        'rawWeight': node.get('rawWeight',''),
        'lat':'','lng':'','start':'','end':'','time':'','date':'','source':'','target':'',
        'edgeLabel':'','edgeColor':'','edgeWeight':'','relationship':'','enlightement':node.get('enlightement',''),
        'emoji':'','extra': node.get('extra','')
    }


def topogram_edge_row(edge):
    return {
        'id': edge.get('id',''),
        'name': edge.get('name',''),
        'label': edge.get('label',''),
        'description': edge.get('description',''),
        'color': edge.get('color',''),
        'fillColor':'','weight':'','rawWeight':'','lat':'','lng':'','start':'','end':'','time':'','date':'',
        'source': edge.get('source',''),
        'target': edge.get('target',''),
        'edgeLabel': edge.get('edgeLabel',''),
        'edgeColor': edge.get('edgeColor',''),
        'edgeWeight': edge.get('edgeWeight',''),
        'relationship': edge.get('relationship',''),
        'enlightement': edge.get('enlightement',''),
        'emoji':'','extra': edge.get('extra','')
    }


def write_csv(path, fieldnames, rows):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', newline='', encoding='utf8') as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames)
        writer.writeheader()
        for r in rows:
            writer.writerow(r)


def process(json_path, handle_orphans='keep', orphan_prefix='missing:'):
    with open(json_path, 'r', encoding='utf8') as fh:
        data = json.load(fh)
    nodes = list(data.get('nodes', []))
    edges = list(data.get('edges', []))

    # Detect orphan edges (source/target not in nodes)
    node_ids = {n.get('id') for n in nodes}
    orphans = []
    for e in edges:
        s, t = e.get('source'), e.get('target')
        src_ok = s in node_ids
        tgt_ok = t in node_ids
        if not src_ok or not tgt_ok:
            orphans.append((e, not src_ok, not tgt_ok))

    dropped = 0
    fixed = 0
    created = 0
    if orphans:
        if handle_orphans == 'drop':
            edges = [e for e in edges if e.get('source') in node_ids and e.get('target') in node_ids]
            dropped = len(orphans)
        elif handle_orphans == 'placeholder':
            # create placeholder nodes for missing endpoints
            existing = set(node_ids)
            for e, miss_src, miss_tgt in orphans:
                if miss_src:
                    sid = e.get('source')
                    if sid and sid not in existing:
                        ntype = 'placeholder'
                        label = sid
                        if isinstance(sid, str) and sid.startswith('module:'):
                            ntype = 'module'
                            label = orphan_prefix + sid.replace('module:', '')
                        elif isinstance(sid, str) and sid.startswith('package:'):
                            ntype = 'package'
                            label = orphan_prefix + sid.replace('package:', '')
                        nodes.append({'id': sid, 'label': label, 'type': ntype})
                        existing.add(sid)
                        created += 1
                if miss_tgt:
                    tid = e.get('target')
                    if tid and tid not in existing:
                        ntype = 'placeholder'
                        label = tid
                        if isinstance(tid, str) and tid.startswith('module:'):
                            ntype = 'module'
                            label = orphan_prefix + tid.replace('module:', '')
                        elif isinstance(tid, str) and tid.startswith('package:'):
                            ntype = 'package'
                            label = orphan_prefix + tid.replace('package:', '')
                        nodes.append({'id': tid, 'label': label, 'type': ntype})
                        existing.add(tid)
                        created += 1
            fixed = len(orphans)
        # keep: do nothing

    nodes_out = []
    for n in nodes:
        mapped = topogram_node_row(n)
        # include original node as JSON in original_* columns for traceability
        mapped_orig = {'original': json.dumps(n, ensure_ascii=False)}
        mapped.update(mapped_orig)
        nodes_out.append(mapped)

    edges_out = []
    for e in edges:
        mapped = topogram_edge_row(e)
        mapped.update({'original': json.dumps(e, ensure_ascii=False)})
        edges_out.append(mapped)

    base = os.path.splitext(os.path.basename(json_path))[0]
    node_csv = os.path.join('samples', f'nodes_mapping_{base}.csv')
    edge_csv = os.path.join('samples', f'edges_mapping_{base}.csv')
    write_csv(node_csv, ['original'] + TOPOGRAM_HEADER, [{'original': r['original'], **{k: r[k] for k in TOPOGRAM_HEADER}} for r in nodes_out])
    write_csv(edge_csv, ['original'] + TOPOGRAM_HEADER, [{'original': r['original'], **{k: r[k] for k in TOPOGRAM_HEADER}} for r in edges_out])
    print('Wrote', node_csv, 'rows=', len(nodes_out))
    print('Wrote', edge_csv, 'rows=', len(edges_out))
    if orphans:
        print(f"Orphan edges in input: {len(orphans)} | dropped={dropped} fixed={fixed} placeholders={created}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Generate Topogram CSV mappings from a graph JSON, with optional orphan-edge handling.')
    parser.add_argument('json_path', help='Path to graph JSON file')
    parser.add_argument('--handle-orphans', default='keep', choices=['keep','drop','placeholder'], help='How to handle edges whose endpoints are missing (default: keep)')
    parser.add_argument('--orphan-prefix', default='missing:', help='Label prefix for placeholder nodes')
    args = parser.parse_args()
    process(args.json_path, handle_orphans=args.handle_orphans, orphan_prefix=args.orphan_prefix)

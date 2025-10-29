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


def process(json_path):
    with open(json_path, 'r', encoding='utf8') as fh:
        data = json.load(fh)
    nodes = data.get('nodes', [])
    edges = data.get('edges', [])

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


if __name__ == '__main__':
    import sys
    if len(sys.argv) < 2:
        print('Usage: generate_node_edge_mappings.py <path-to-json>')
        sys.exit(2)
    process(sys.argv[1])

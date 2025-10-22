#!/usr/bin/env python3
"""
scripts/build_debian_topogram.py

Given a Debian package name, fetch Debian Packages metadata for a suite/component
(default: debian stable main) and build a Topogram-compatible CSV with nodes (packages)
and edges (Depends/Recommends). The script performs a BFS up to a configurable depth.

Usage:
  ./scripts/build_debian_topogram.py PACKAGENAME [-d DEPTH] [-o OUT.csv] [--suite stable] [--component main] [--include-recommends]

The output CSV follows the samples/node_edge.csv header used in the repository and
is importable into Topogram.

Note: This script performs simple parsing of Debian Packages files and strips
version constraints from dependency expressions. It does not resolve virtual
packages to concrete providers.

"""

import argparse
import gzip
import io
import json
import re
import requests
from collections import deque

PACKAGES_URL_TEMPLATE = 'http://ftp.debian.org/debian/dists/{suite}/{component}/binary-amd64/Packages.gz'

HEADER = 'id,name,label,description,color,fillColor,weight,rawWeight,lat,lng,emoji,notes,source,target,edgeLabel,edgeColor,edgeWeight,relationship,extra'

# simple regex to split dependency lists and strip version constraints and alternatives
DEP_SPLIT_RE = re.compile(r',\s*')
ALT_SPLIT_RE = re.compile(r'\s*\|\s*')
VERSION_RE = re.compile(r'\s*\(.*?\)')


def fetch_packages_file(suite='stable', component='main'):
    url = PACKAGES_URL_TEMPLATE.format(suite=suite, component=component)
    print(f'Fetching Packages.gz from {url} ...')
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = gzip.decompress(r.content).decode('utf-8', errors='replace')
    return data


def parse_packages(packages_text):
    """Parse a Debian Packages file into a dict: pkgname -> metadata dict"""
    pkgs = {}
    current = {}
    for line in packages_text.splitlines():
        if not line.strip():
            if 'Package' in current:
                pkgs[current['Package']] = current
            current = {}
            continue
        if ':' not in line:
            # continuation field (e.g., multiline Description)
            # append to last key's value
            if current:
                last = list(current.keys())[-1]
                current[last] += '\n' + line
            continue
        key, val = line.split(':', 1)
        current[key] = val.strip()
    if 'Package' in current:
        pkgs[current['Package']] = current
    return pkgs


def normalize_dep_token(token):
    # remove version constraints
    token = VERSION_RE.sub('', token).strip()
    return token


def expand_dep_field(field_value):
    # field_value like: "libc6 (>= 2.28), libgcc1 (>= 1:3.0), debconf (>= 0.5) | debconf-2.0"
    if not field_value:
        return []
    parts = DEP_SPLIT_RE.split(field_value)
    deps = []
    for p in parts:
        # take the first alternative (naive)
        alts = ALT_SPLIT_RE.split(p)
        token = normalize_dep_token(alts[0])
        if token:
            deps.append(token)
    return deps


def build_graph(root_pkg, pkgs, depth=2, include_recommends=False, include_suggests=False):
    nodes = {}
    edges = []
    q = deque()
    q.append((root_pkg, 0))
    visited = set()
    while q:
        pkg, d = q.popleft()
        if pkg in visited:
            continue
        visited.add(pkg)
        meta = pkgs.get(pkg)
        if not meta:
            # unknown package: create a stub node
            nodes[pkg] = {
                'id': pkg,
                'name': pkg,
                'label': pkg,
                'description': 'unknown',
                'notes': 'missing in Packages file'
            }
            continue
        nodes[pkg] = {
            'id': pkg,
            'name': meta.get('Package', pkg),
            'label': meta.get('Package', pkg),
            'description': meta.get('Description', '').split('\n',1)[0],
            'notes': f"Section={meta.get('Section','')}; Version={meta.get('Version','')}"
        }
        if d < depth:
            deps = expand_dep_field(meta.get('Depends',''))
            for dep in deps:
                edges.append((pkg, dep, 'Depends'))
                q.append((dep, d+1))
            if include_recommends:
                recs = expand_dep_field(meta.get('Recommends',''))
                for r in recs:
                    edges.append((pkg, r, 'Recommends'))
                    q.append((r, d+1))
            if include_suggests:
                sugs = expand_dep_field(meta.get('Suggests',''))
                for s in sugs:
                    edges.append((pkg, s, 'Suggests'))
                    q.append((s, d+1))
    return nodes, edges


def write_topogram_csv(nodes, edges, outpath):
    with open(outpath, 'w', encoding='utf-8') as f:
        f.write(HEADER + '\n')
        # write nodes
        for nid, n in nodes.items():
            # id,name,label,description,color,fillColor,weight,rawWeight,lat,lng,emoji,notes,source,target,edgeLabel,edgeColor,edgeWeight,relationship,extra
            row = [n['id'], n['name'], n['label'], n['description'], '', '', '1', '1', '', '', '', n.get('notes',''), '', '', '', '', '', '']
            f.write(','.join('"{}"'.format(s.replace('"','""')) for s in row) + '\n')
        # write edges as rows where source/target fields are filled
        for src, tgt, rel in edges:
            row = ['', '', '', '', '', '', '', '', '', '', '', '', src, tgt, rel, '#333', '1', rel, '{}']
            f.write(','.join('"{}"'.format(s.replace('"','""')) for s in row) + '\n')
    print(f'Wrote CSV to {outpath}')


def main():
    p = argparse.ArgumentParser()
    p.add_argument('package', help='Debian package name to build graph from')
    p.add_argument('-d', '--depth', type=int, default=2, help='BFS depth (default: 2)')
    p.add_argument('-o', '--out', default='samples/debian_package_topogram.csv', help='Output CSV path')
    p.add_argument('--suite', default='stable', help='Debian suite (stable, testing, etc.)')
    p.add_argument('--component', default='main', help='Component (main, contrib, non-free)')
    p.add_argument('--include-recommends', action='store_true')
    p.add_argument('--include-suggests', action='store_true')
    args = p.parse_args()

    packages_text = fetch_packages_file(suite=args.suite, component=args.component)
    pkgs = parse_packages(packages_text)
    print(f'Parsed {len(pkgs)} packages from {args.suite}/{args.component}')
    nodes, edges = build_graph(args.package, pkgs, depth=args.depth, include_recommends=args.include_recommends, include_suggests=args.include_suggests)
    print(f'Collected {len(nodes)} nodes and {len(edges)} edges')
    write_topogram_csv(nodes, edges, args.out)


if __name__ == '__main__':
    main()

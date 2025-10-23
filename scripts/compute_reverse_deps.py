#!/usr/bin/env python3
"""
Compute reverse-dependency counts for Debian Packages.gz and map binary packages to their source packages.

Usage: python3 scripts/compute_reverse_deps.py --suite trixie --component main --arch amd64 --top 5000

Produces CSV to stdout: source_package, count
"""
import argparse
import gzip
import io
import re
import sys
from urllib.request import urlopen


def fetch_packages_gz(suite, component, arch):
    url = f"http://ftp.debian.org/debian/dists/{suite}/{component}/binary-{arch}/Packages.gz"
    print(f"Fetching {url}...", file=sys.stderr)
    resp = urlopen(url)
    data = resp.read()
    return gzip.decompress(data).decode('utf-8', errors='replace')


def parse_packages(text):
    entries = []
    cur = {}
    last_field = None
    for line in text.splitlines():
        if line.strip() == '':
            if cur:
                entries.append(cur)
                cur = {}
                last_field = None
            continue
        if line[0].isspace() and last_field:
            # continuation
            cur[last_field] += '\n' + line.strip()
            continue
        if ':' in line:
            k, v = line.split(':', 1)
            cur[k.strip()] = v.strip()
            last_field = k.strip()
    if cur:
        entries.append(cur)
    return entries


def extract_dep_names(field_value):
    if not field_value:
        return []
    parts = []
    # split on commas at top level
    for chunk in re.split(r',\s*(?=(?:[^()]*\([^()]*\))*[^()]*$)', field_value):
        # split alternatives
        for alt in chunk.split('|'):
            name = alt.strip()
            # remove arch qualifiers [amd64]
            name = re.sub(r"\[.*?\]", '', name).strip()
            # strip version constraints e.g. (>= 1.2)
            name = re.sub(r"\s*\(.*?\)", '', name).strip()
            # extract token at start that's a valid package name
            m = re.match(r"^([A-Za-z0-9+\-.]+)", name)
            if m:
                parts.append(m.group(1))
    return parts


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--suite', default='trixie')
    p.add_argument('--component', default='main')
    p.add_argument('--arch', default='amd64')
    p.add_argument('--top', type=int, default=5000)
    args = p.parse_args()

    text = fetch_packages_gz(args.suite, args.component, args.arch)
    entries = parse_packages(text)
    print(f"Parsed {len(entries)} binary package entries", file=sys.stderr)

    # map binary package -> source package
    bin2src = {}
    for e in entries:
        pkg = e.get('Package')
        src = e.get('Source')
        if src:
            # Source may include (version) after name
            srcname = src.split()[0]
        else:
            # fallback: assume source is same as package
            srcname = pkg
        bin2src[pkg] = srcname

    counts = {}

    for e in entries:
        pkg = e.get('Package')
        # consider Depends and Recommends
        for field in ('Depends', 'Recommends'):
            val = e.get(field)
            names = extract_dep_names(val)
            for name in names:
                src = bin2src.get(name, name)
                counts[src] = counts.get(src, 0) + 1

    # sort
    items = sorted(counts.items(), key=lambda x: (-x[1], x[0]))

    topn = args.top if args.top and args.top > 0 else len(items)
    print('source_package,count')
    for src, c in items[:topn]:
        print(f"{src},{c}")


if __name__ == '__main__':
    main()

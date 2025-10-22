#!/usr/bin/env python3
"""
Batch build Topogram CSVs for a list of source packages using the existing
`scripts/build_debian_topogram.py` helpers.

The script fetches the Debian Packages file for the given suite/component,
parses packages, maps source->binary, and for each source in the input CSV it
selects a representative binary package and builds a Topogram CSV using the
build_graph/write_topogram_csv functions from the other script.

Outputs (per source):
  {outdir}/{source}.topogram.csv

"""

import argparse
import csv
import sys
from pathlib import Path

# Import helper functions from the existing script
import importlib.util
from pathlib import Path

# Load the sibling script `build_debian_topogram.py` as a module even when
# the `scripts` directory is not an importable package.
script_path = Path(__file__).parent / 'build_debian_topogram.py'
spec = importlib.util.spec_from_file_location('bdt', str(script_path))
bdt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bdt)


def build_src_to_bins(pkgs):
    src_to_bins = {}
    for pkgname, meta in pkgs.items():
        src_field = meta.get('Source')
        if src_field:
            src_name = src_field.split()[0]
        else:
            src_name = pkgname
        src_to_bins.setdefault(src_name, []).append(pkgname)
    return src_to_bins


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--suite', required=True)
    p.add_argument('--component', default='main')
    p.add_argument('--input', default='samples/trixie_top5000.csv')
    p.add_argument('--top', type=int, default=10)
    p.add_argument('--outdir', default='/tmp/topograms')
    p.add_argument('--depth', type=int, default=2)
    p.add_argument('--no-recommends', action='store_true')
    args = p.parse_args()

    outdir = Path(args.outdir)
    outdir.mkdir(parents=True, exist_ok=True)

    print(f"Fetching Packages for {args.suite}/{args.component}...", file=sys.stderr)
    packages_text = bdt.fetch_packages_file(suite=args.suite, component=args.component)
    pkgs = bdt.parse_packages(packages_text)
    print(f"Parsed {len(pkgs)} packages.", file=sys.stderr)

    src_to_bins = build_src_to_bins(pkgs)

    # read input source list
    srcs = []
    with open(args.input, newline='') as f:
        r = csv.reader(f)
        _ = next(r)
        for row in r:
            if row:
                srcs.append(row[0])
    srcs = srcs[:args.top]

    include_recommends = not args.no_recommends

    for src in srcs:
        bins = src_to_bins.get(src)
        if not bins:
            print(f"No binary packages found for source {src}; skipping.", file=sys.stderr)
            continue
        root_bin = bins[0]
        print(f"Building topogram for source {src} using binary {root_bin}...", file=sys.stderr)
        nodes, edges = bdt.build_graph(root_bin, pkgs, depth=args.depth, include_recommends=include_recommends)
        outpath = Path(args.outdir) / f"{src}.topogram.csv"
        bdt.write_topogram_csv(nodes, edges, outpath)


if __name__ == '__main__':
    main()

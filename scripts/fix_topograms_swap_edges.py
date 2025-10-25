#!/usr/bin/env python3
"""
Swap source/target columns in Topogram CSV files under a directory.

Usage:
  scripts/fix_topograms_swap_edges.py --dir samples/topograms/debian --commit

The script will:
- Back up the directory to /tmp/debian_topograms_backup.tar.gz
- For each .topogram.csv file, read the CSV, and for rows where the `id` column is empty
  and either `source` or `target` is non-empty, swap the values in the `source` and `target`
  columns (columns 12 and 13, 0-based indexing).
- Overwrite the file in-place.

This operation is reversible by unpacking the backup archive.
"""

import argparse
import csv
from pathlib import Path
import tarfile
import time
import sys

HEADER_FIELDS = ['id','name','label','description','color','fillColor','weight','rawWeight','lat','lng','emoji','notes','source','target','edgeLabel','edgeColor','edgeWeight','relationship','extra']
SRC_IDX = 12
TGT_IDX = 13


def backup_dir(dpath: Path) -> Path:
    timestamp = time.strftime('%Y%m%d-%H%M%S')
    dest = Path('/tmp') / f'debian_topograms_backup_{timestamp}.tar.gz'
    with tarfile.open(dest, 'w:gz') as tf:
        tf.add(str(dpath), arcname=dpath.name)
    return dest


def process_file(p: Path) -> int:
    changed = 0
    # read rows preserving quoting
    with p.open(newline='') as f:
        reader = csv.reader(f)
        rows = list(reader)
    if not rows:
        return 0
    header = rows[0]
    # validate header roughly
    if len(header) < max(SRC_IDX, TGT_IDX)+1:
        print(f'Skipping {p}: unexpected header columns ({len(header)})', file=sys.stderr)
        return 0
    out_rows = [header]
    for row in rows[1:]:
        # ensure row has enough columns
        if len(row) < len(header):
            # pad
            row = row + ['']*(len(header)-len(row))
        if (not row[0].strip()) and (row[SRC_IDX].strip() or row[TGT_IDX].strip()):
            # edge row: swap source/target
            row[SRC_IDX], row[TGT_IDX] = row[TGT_IDX], row[SRC_IDX]
            changed += 1
        out_rows.append(row)
    if changed:
        # write back
        with p.open('w', newline='') as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerows(out_rows)
    return changed


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--dir', required=True)
    p.add_argument('--commit', action='store_true', help='Actually write changes (default: write).')
    args = p.parse_args()

    d = Path(args.dir)
    if not d.exists() or not d.is_dir():
        print('Directory not found:', d, file=sys.stderr)
        sys.exit(2)

    print('Backing up', d, 'to /tmp...', file=sys.stderr)
    backup = backup_dir(d)
    print('Backup created at', backup, file=sys.stderr)

    total_changed = 0
    files = list(d.rglob('*.topogram.csv'))
    print(f'Found {len(files)} files to process', file=sys.stderr)
    for i, fpath in enumerate(files, start=1):
        changed = process_file(fpath)
        if changed:
            print(f'[{i}/{len(files)}] Updated {fpath} ({changed} rows swapped)', file=sys.stderr)
        else:
            # print progress occasionally
            if i % 100 == 0:
                print(f'[{i}/{len(files)}] {fpath} (no change)', file=sys.stderr)
        total_changed += changed
    print(f'Done. Total rows swapped across files: {total_changed}', file=sys.stderr)

if __name__ == '__main__':
    main()

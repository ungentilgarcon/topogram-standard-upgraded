#!/usr/bin/env python3
import tarfile, sys, os
import glob
out = sys.argv[1] if len(sys.argv)>1 else f"exports/meteor_mongo_export_py.tar.gz"
os.makedirs('exports', exist_ok=True)
files = glob.glob('/tmp/tmp.*/*.jsonl.gz')
if not files:
    print('No files found in /tmp/tmp.*/*.jsonl.gz')
    sys.exit(1)
with tarfile.open(out, 'w:gz') as tf:
    for f in files:
        tf.add(f, arcname=os.path.basename(f))
print('Created', out)

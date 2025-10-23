#!/usr/bin/env python3
"""
Export Meteor local MongoDB (meteor DB) collections into gzipped JSONL files and package as tar.gz.

Usage: python3 scripts/export_meteor_mongo_py.py

Requires: mongosh present in PATH and reachable to the local mongod.
"""
import subprocess, json, shutil, os, sys, tempfile, tarfile, datetime

# detect mongod port: try ss/netstat, otherwise read .meteor/local/db/METEOR-PORT +1 or 3002
def detect_mongod_port():
    # try to find mongod listening on 127.0.0.1
    try:
        out = subprocess.check_output(['ss','-lntp'], stderr=subprocess.DEVNULL, text=True)
    except Exception:
        try:
            out = subprocess.check_output(['netstat','-lntp'], stderr=subprocess.DEVNULL, text=True)
        except Exception:
            out = ''
    for line in out.splitlines():
        if 'mongod' in line:
            parts = line.split()
            # address is 4th token in ss output
            addr = parts[3]
            if addr.startswith('127.0.0.1:') or addr.startswith('[::1]'):
                try:
                    return int(addr.split(':')[-1])
                except Exception:
                    continue
    # fallback to meteor port +1
    try:
        p = open('.meteor/local/db/METEOR-PORT').read().strip()
        if p.isdigit():
            return int(p) + 1
    except Exception:
        pass
    return 3002

port = detect_mongod_port()
print('Using mongod port:', port)

if shutil.which('mongosh') is None:
    print('mongosh not found in PATH; please install mongosh and retry', file=sys.stderr)
    sys.exit(1)

# get collection names from meteor DB
cmd = ['mongosh','--port',str(port),'--quiet','--eval',"JSON.stringify(db.getSiblingDB('meteor').getCollectionNames())"]
try:
    out = subprocess.check_output(cmd, text=True)
except subprocess.CalledProcessError as e:
    print('mongosh failed:', e, file=sys.stderr)
    sys.exit(1)

try:
    cols = json.loads(out)
except Exception:
    # try to strip surrounding whitespace
    s = out.strip()
    try:
        cols = json.loads(s)
    except Exception:
        print('Failed to parse collection list from mongosh output:', out, file=sys.stderr)
        sys.exit(1)

if not cols:
    print('No collections found in meteor DB', file=sys.stderr)
    sys.exit(1)

print('Collections to export:', cols)

# create temporary export dir inside repo to avoid tmp auto-clean
export_tmp = os.path.abspath('exports/tmp_export_' + datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S'))
os.makedirs(export_tmp, exist_ok=True)

for coll in cols:
    outpath = os.path.join(export_tmp, f"{coll}.jsonl.gz")
    print('Exporting', coll, '->', outpath)
    # spawn mongosh and gzip the stdout
    eval_js = f"db.getSiblingDB('meteor').getCollection(\"{coll}\").find().forEach(doc => {{ print(JSON.stringify(doc)) }})"
    with subprocess.Popen(['mongosh','--port',str(port),'--quiet','--eval',eval_js], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as proc:
        with open(outpath, 'wb') as fh:
            import gzip
            with gzip.GzipFile(fileobj=fh, mode='wb', compresslevel=9) as gz:
                for line in proc.stdout:
                    gz.write(line.encode('utf-8'))
        stderr = proc.stderr.read()
        ret = proc.wait()
        if ret != 0:
            print('mongosh export failed for', coll, 'stderr:', stderr, file=sys.stderr)
            # continue to next collection

# package into tar.gz
outname = f"meteor_mongo_export_{datetime.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.tar.gz"
outpath = os.path.abspath(os.path.join('exports', outname))
with tarfile.open(outpath, 'w:gz') as tf:
    for f in sorted(os.listdir(export_tmp)):
        tf.add(os.path.join(export_tmp,f), arcname=f)

print('Created export:', outpath)
print('Tip: import each <collection>.jsonl.gz using mongoimport --gzip --uri mongodb://host:port/meteor --collection <name> --drop --file -')

# done

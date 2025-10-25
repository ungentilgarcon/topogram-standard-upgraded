trixie_top5000.csv — Debian Trixie top-5000 reverse-dependency counts

This file accompanies `samples/trixie_top5000.csv` which lists the top 5000 Debian source packages in the Trixie distribution (component `main`, architecture `amd64`) ordered by reverse-dependency count.

Format
- CSV with two columns: `source_package,count`
- `source_package` — Debian source package name
- `count` — number of binary packages (aggregated by source) that Depend or Recommend this package (parsed from `Depends` and `Recommends` fields in the Debian Packages index)

How the data was produced
1. The script `scripts/compute_reverse_deps.py` fetches the `Packages.gz` file from the Debian archive for the selected suite/component/arch (for example: `http://ftp.debian.org/debian/dists/trixie/main/binary-amd64/Packages.gz`).
2. It parses each binary package entry, maps binary packages back to their source package names using the `Source:` field when available, and parses `Depends` and `Recommends` to extract dependency names.
3. Alternative dependency forms (a | b) are treated by counting all alternatives individually toward reverse-dependency totals (i.e., the script increments the count for each named alternative encountered).
4. Counts are aggregated by source package and sorted descending. The top 5000 entries were written to `samples/trixie_top5000.csv`.

Regenerating the CSV
Run the script locally (requires Python 3 and internet access):

```bash
chmod +x scripts/compute_reverse_deps.py
python3 scripts/compute_reverse_deps.py --suite trixie --component main --arch amd64 --top 5000 > /tmp/trixie_top5000.csv 2> /tmp/trixie_compute.log
cp /tmp/trixie_top5000.csv samples/trixie_top5000.csv
```

Notes and caveats
- The script counts occurrences in both `Depends` and `Recommends`. If you prefer a different metric (e.g., only `Depends`, or include `Suggests`), edit the script accordingly.
- Multi-arch and transitional packages can affect counts; mapping is done to the source package where available but some binary-only packages without `Source:` fields may be left as-is.
- This is a snapshot in time; package indexes change as the archive updates.

License
- The CSV is generated from Debian archive metadata which is CC-by-SA/DFSG-compatible. Use according to Debian archive policies.

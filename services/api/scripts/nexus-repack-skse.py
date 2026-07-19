#!/usr/bin/env python3
"""Download a Nexus zip and rewrite SKSE/ → Data/SKSE/ for Skyrim root install."""
import sys
import zipfile
import urllib.request
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: nexus-repack-skse.py <source_url> <out_zip>", file=sys.stderr)
        return 2
    url, out_path = sys.argv[1], sys.argv[2]
    req = urllib.request.Request(url, headers={"User-Agent": "VisionsOfAetherius/0.1"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    tmp_in = Path(out_path + ".src.zip")
    tmp_in.write_bytes(data)
    out = Path(out_path)
    with zipfile.ZipFile(tmp_in, "r") as zin, zipfile.ZipFile(
        out, "w", compression=zipfile.ZIP_DEFLATED
    ) as zout:
        for info in zin.infolist():
            name = info.filename.replace("\\", "/")
            if name.endswith("/"):
                continue
            # Strip leading junk / folder wrappers if any
            parts = name.split("/")
            # If path starts with SKSE/, prefix Data/
            if parts[0].lower() == "skse":
                new_name = "Data/" + "/".join(parts)
            elif len(parts) >= 2 and parts[0].lower() == "data" and parts[1].lower() == "skse":
                new_name = "/".join(parts)
            else:
                # Keep as-is under Data/SKSE/Plugins if it's a bare .bin
                if name.lower().endswith(".bin") and "/" not in name.rstrip("/"):
                    new_name = "Data/SKSE/Plugins/" + parts[-1]
                else:
                    new_name = name
            zout.writestr(new_name, zin.read(info))
    tmp_in.unlink(missing_ok=True)
    print(out.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""Stable release ZIP: sorted entries, fixed timestamps, no credentials or source maps."""
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo
root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
out = root / 'artifacts'
out.mkdir(exist_ok=True)
archive = out / f'cr4wler-{version}.zip'
with ZipFile(archive, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
    for path in sorted((root / 'dist').rglob('*')):
        if not path.is_file():
            continue
        info = ZipInfo(str(path.relative_to(root / 'dist')), date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        z.writestr(info, path.read_bytes(), compress_type=ZIP_DEFLATED, compresslevel=9)
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(archive.with_suffix('.zip.sha256')).write_text(f'{digest}  {archive.name}\n')
print(f'{archive}\nSHA256 {digest}')

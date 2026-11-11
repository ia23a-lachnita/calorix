"""Restore pinned raw JSON evidence; this performs no model inference or downloads."""
import gzip, hashlib, json, sys
from pathlib import Path
source=Path(__file__).resolve().parent
target=Path(sys.argv[1]).resolve()
target.mkdir()
entries=json.loads((source/'raw-records.json').read_text())['records']+json.loads((source/'support-records.json').read_text())['records']
for row in entries:
 path=source/row['path']
 if not path.resolve().is_relative_to(source):raise ValueError('Invalid evidence source path')
 packed=path.read_bytes()
 if hashlib.sha256(packed).hexdigest()!=row['gzipSha256']:raise ValueError('Compressed evidence hash mismatch')
 raw=gzip.decompress(packed)
 if len(raw)!=row['uncompressedBytes'] or hashlib.sha256(raw).hexdigest()!=row['uncompressedSha256']:raise ValueError('Raw evidence hash mismatch')
 relative=row.get('destination',row['path'][:-3]);dest=target/relative
 if not dest.resolve().is_relative_to(target):raise ValueError('Invalid evidence destination')
 dest.parent.mkdir(parents=True,exist_ok=True)
 with dest.open('xb') as f:f.write(raw)
print('Restored',len(entries),'exact evidence files. Add the frozen assets/ directory before running independent_audit.py.')

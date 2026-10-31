"""Developer-only stage of pinned archives into NEW directories; no downloads."""
from pathlib import Path
import hashlib, json, shutil, sys, zipfile

native_zip, wasi_zip, wheel, destination = (Path(x).resolve() for x in sys.argv[1:5])
host, guest = destination / 'code-host', destination / 'wasi'
if host.exists() or guest.exists(): raise RuntimeError('Preserve existing runtime; use a fresh staging directory')
host.mkdir(parents=True); guest.mkdir()
def extract(source,target):
 with zipfile.ZipFile(source) as z:
  for entry in z.infolist():
   path=(target/entry.filename).resolve()
   if not path.is_relative_to(target) or '\\' in entry.filename: raise RuntimeError('Unsafe archive entry')
   z.extract(entry,target)
extract(native_zip,host)
site=host/'site-packages';site.mkdir();extract(wheel,site)
(host/'python313._pth').write_text('python313.zip\n.\nsite-packages\n',encoding='utf-8')
shutil.copyfile(Path(__file__).with_name('execute-wasi.py'),host/'execute_wasi.py')
extract(wasi_zip,guest)
pins={}
for root,kind in [(host,'code-host'),(guest,'wasi')]:
 files=[{'path':p.relative_to(root).as_posix(),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(root.rglob('*')) if p.is_file()]
 data=(json.dumps({'schemaVersion':1,'kind':kind,'files':files},indent=2)+'\n').encode()
 (root/'runtime.json').write_bytes(data);pins[kind]=hashlib.sha256(data).hexdigest()
print(json.dumps(pins))

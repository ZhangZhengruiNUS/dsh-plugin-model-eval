"""Developer build: compile only pinned stdlib sources with their own WASI Python.
The sole writable capability is a newly created cache directory. Never model code.
"""
from pathlib import Path
import hashlib
import json
import sys
import wasmtime

runtime, destination = (Path(arg).resolve() for arg in sys.argv[1:3])
manifest_bytes = (runtime / 'runtime.json').read_bytes()
if hashlib.sha256(manifest_bytes).hexdigest() != sys.argv[3]:
    raise RuntimeError('BASE_WASI_HASH_MISMATCH')
if destination.is_relative_to(runtime):
    raise RuntimeError('CACHE_CANNOT_MUTATE_BASE')
manifest = json.loads(manifest_bytes)
sources = []
for file in manifest['files']:
    if file['path'].startswith('lib/python3.13/') and file['path'].endswith('.py'):
        path = runtime / file['path']
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != file['sha256']:
            raise RuntimeError('STDLIB_SOURCE_HASH_MISMATCH')
        sources.append('/python/' + file['path'])
destination.mkdir(parents=True, exist_ok=False)
program = r'''
import sys, json, py_compile, importlib.util
sys.pycache_prefix='/bytecode'
paths=json.loads(sys.argv[1])
for path in paths:
 if not path.startswith('/python/lib/python3.13/') or not path.endswith('.py') or '..' in path.split('/'):
  raise RuntimeError('UNTRUSTED_SOURCE_PATH')
 py_compile.compile(path,cfile=importlib.util.cache_from_source(path),dfile=path,doraise=True,optimize=0,invalidation_mode=py_compile.PycInvalidationMode.CHECKED_HASH)
print(json.dumps({'version':sys.version,'magic':importlib.util.MAGIC_NUMBER.hex(),'cacheTag':sys.implementation.cache_tag,'optimization':sys.flags.optimize,'hashMode':'checked-hash','files':len(paths)}))
'''
config = wasmtime.Config()
config.consume_fuel = True
engine = wasmtime.Engine(config)
module = wasmtime.Module.from_file(engine, str(runtime / 'python.wasm'))
linker = wasmtime.Linker(engine)
linker.define_wasi()
with wasmtime.Store(engine) as store:
    store.set_limits(memory_size=536870912, instances=1, memories=1, tables=4, table_elements=100000)
    # Bounded developer compiler work; this never changes the scoring budget.
    store.set_fuel(6_000_000_000_000)
    wasi = wasmtime.WasiConfig()
    wasi.argv = ['python', '-B', '-c', program, json.dumps(sorted(sources))]
    wasi.env = [('PYTHONHOME', '/python'), ('PYTHONUTF8', '1'), ('PYTHONHASHSEED', '0')]
    wasi.preopen_dir(str(runtime), '/python', fs_mutable=False)
    wasi.preopen_dir(str(destination), '/bytecode', fs_mutable=True)
    wasi.stdout_custom = lambda chunk: (sys.stdout.buffer.write(chunk), sys.stdout.buffer.flush(), len(chunk))[-1]
    wasi.stderr_custom = lambda chunk: (sys.stderr.buffer.write(chunk), sys.stderr.buffer.flush(), len(chunk))[-1]
    store.set_wasi(wasi)
    instance = linker.instantiate(store, module)
    try:
        instance.exports(store)['_start'](store)
    except wasmtime.ExitTrap as error:
        if error.code != 0:
            raise

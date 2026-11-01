"""Trusted stdio driver. No expected output or verdict code enters a WASI guest.

Each test is a fresh Store, interpreter and immutable capability set. The engine
and compiled module are shared only to avoid repeated trusted compilation.
"""
import base64
import errno
import json
from pathlib import Path
import sys
import threading
import time
import wasmtime

GUEST = r'''
import os, stat, sys
_solution, _stdin_size = sys.argv[1], int(sys.argv[2])
_original_fstat, _original_read = os.fstat, os.read
# WASI stdin is exposed as a stream and reports st_size=0. Each benchmark
# case is a complete immutable input file; expose its known length for the
# usual competitive-programming io.BytesIO(os.read(0, os.fstat(0).st_size)).
# This is an environment adapter, never a rewrite of the submitted program.
def _input_fstat(fd):
 if fd == 0:
  return os.stat_result((stat.S_IFREG | stat.S_IRUSR, 0, 0, 1, 0, 0, _stdin_size, 0, 0, 0))
 return _original_fstat(fd)
def _input_read(fd, size):
 if fd == 0 and size == 0: return b''
 return _original_read(fd, size)
os.fstat, os.read = _input_fstat, _input_read
sys.argv = ['solution.py']
exec(compile(_solution, 'solution.py', 'exec'), {'__name__':'__main__', '__file__':'solution.py'})
'''


def main():
    request = json.load(sys.stdin)
    start = time.monotonic()
    config = wasmtime.Config()
    config.consume_fuel = True
    config.epoch_interruption = True
    engine = wasmtime.Engine(config)
    module = wasmtime.Module.from_file(engine, str(Path(request['runtimeRoot']) / 'python.wasm'))
    linker = wasmtime.Linker(engine)
    linker.define_wasi()
    inputs = json.loads(Path(request['inputPath']).read_text(encoding='utf-8'))
    remaining_fuel = request['computeBudget']
    total = 0
    for index, stdin in enumerate(inputs['inputs']):
        remaining_ms = request['wallMs'] - (time.monotonic() - start) * 1000
        if remaining_ms <= 0:
            return {'failure': 'timeout'}
        if remaining_fuel <= 0:
            return {'failure': 'resource'}
        stdin_path = Path(request['inputPath']).parent / ('stdin-' + str(index))
        stdin_path.write_bytes(stdin.encode('utf-8'))
        with wasmtime.Store(engine) as store:
            store.set_limits(memory_size=request['memoryBytes'], instances=1, memories=1, tables=4, table_elements=100_000)
            store.set_fuel(remaining_fuel)
            store.set_epoch_deadline(1)
            wasi = wasmtime.WasiConfig()
            wasi.argv = ['python', '-B', '-c', GUEST, inputs['solution'], str(len(stdin.encode('utf-8')))]
            wasi.env = [('PYTHONHOME', '/python'), ('PYTHONUTF8', '1'), ('PYTHONPYCACHEPREFIX', '/bytecode')]
            wasi.preopen_dir(request['runtimeRoot'], '/python', fs_mutable=False)
            wasi.preopen_dir(request['cacheRoot'], '/bytecode', fs_mutable=False)
            wasi.stdin_file = str(stdin_path)
            chunks = []
            case_total = 0
            limited = False

            def capture(chunk):
                nonlocal total, case_total, limited
                total += len(chunk)
                case_total += len(chunk)
                if case_total > 2 * 1024 * 1024 or total > 16 * 1024 * 1024:
                    limited = True
                    engine.increment_epoch()
                    return -errno.ENOSPC
                chunks.append(chunk)
                return len(chunk)

            wasi.stdout_custom = capture
            wasi.stderr_custom = lambda chunk: len(chunk)
            store.set_wasi(wasi)
            timer = threading.Timer(remaining_ms / 1000, engine.increment_epoch)
            timer.daemon = True
            timer.start()
            try:
                instance = linker.instantiate(store, module)
                instance.exports(store)['_start'](store)
            except wasmtime.ExitTrap as error:
                if error.code != 0:
                    return {'failure': 'assertion'}
            except wasmtime.Trap as error:
                if limited or 'fuel' in str(error):
                    return {'failure': 'resource'}
                if 'interrupt' in str(error):
                    return {'failure': 'timeout'}
                return {'failure': 'assertion'}
            finally:
                timer.cancel()
            if limited:
                return {'failure': 'resource'}
            remaining_fuel = store.get_fuel()
            output = base64.b64encode(b''.join(chunks)).decode('ascii')
        # Emit only after fuel accounting and Store cleanup; comparisons stay in Host.
        sys.stdout.write(json.dumps({'case': index, 'output': output}) + '\n')
        sys.stdout.flush()
    return {'complete': True}


try:
    result = main()
except BaseException:
    result = {'environmentError': 'WASI_CONTEST_DRIVER_FAILED'}
sys.stdout.write(json.dumps(result) + '\n')
sys.stdout.flush()

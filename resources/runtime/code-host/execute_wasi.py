"""Trusted Host driver. Model code runs only inside the WASI instance.

The WASI guest receives inputs but no expected outputs or grading functions.
All preopened paths are immutable; no guest filesystem write capability exists.
"""
import errno
import json
import math
from fractions import Fraction
from pathlib import Path
import sys
import threading
import wasmtime

GUEST = r'''
import hashlib, json, sys
sys.set_int_max_str_digits(0)
data=json.load(sys.stdin)
def decode(x):
 t,v=x['t'],x['v']
 if t=='int': return int(v)
 if t=='float': return float(v)
 if t=='tuple': return tuple(decode(y) for y in v)
 if t=='list': return [decode(y) for y in v]
 if t=='set': return set(decode(y) for y in v)
 if t=='dict': return {decode(k):decode(y) for k,y in v}
 return v
def encode(x):
 t=type(x).__name__
 if t=='int' and x.bit_length()>4096:
  return {'t':'large-int','v':hashlib.sha256(x.to_bytes((x.bit_length()+8)//8,'big',signed=True)).hexdigest()}
 if t in ('int','float'): return {'t':t,'v':str(x)}
 if t in ('NoneType','str','bool'): return {'t':t,'v':x}
 if t in ('list','tuple','set'): return {'t':t,'v':[encode(y) for y in x]}
 if t=='dict': return {'t':t,'v':[[encode(k),encode(v)] for k,v in x.items()]}
 raise TypeError('unsupported output type')
def compressed(x, encoding):
 if encoding=='large-str' and type(x)==str:
  return {'t':'large-str','v':hashlib.sha256(x.encode('utf-8',errors='surrogatepass')).hexdigest()}
 if encoding in ('large-int-list','large-int-tuple') and type(x) in (list,tuple):
  if all(type(v) in (int,bool) or (type(v)==float and v.is_integer()) for v in x):
   digest=hashlib.sha256()
   for v in x:
    v=int(v);part=v.to_bytes((v.bit_length()+8)//8,'big',signed=True)
    digest.update(len(part).to_bytes(8,'big'));digest.update(part)
   return {'t':'large-int-'+type(x).__name__,'v':digest.hexdigest()}
 return encode(x)
ns={'__name__':'__main__'}
try:
 exec(compile(data['solution'],'solution.py','exec'),ns)
 fn=ns[data['entryPoint']]
 outputs=[]
 for index,args in enumerate(data['inputs']): outputs.append(compressed(fn(*[decode(x) for x in args]),data['encodings'][index]))
 print('\n__DSH_VALUES__'+json.dumps({'items':outputs},ensure_ascii=True),flush=True)
except MemoryError:
 print('\n__DSH_VALUES__'+json.dumps({'failure':'resource'}),flush=True)
except SyntaxError:
 print('\n__DSH_VALUES__'+json.dumps({'failure':'syntax'}),flush=True)
except BaseException:
 print('\n__DSH_VALUES__'+json.dumps({'failure':'assertion'}),flush=True)
'''

def main():
    config_data = json.load(sys.stdin)
    config = wasmtime.Config()
    config.consume_fuel = True
    config.epoch_interruption = True
    engine = wasmtime.Engine(config)
    store = wasmtime.Store(engine)
    store.set_limits(memory_size=config_data['memoryBytes'], instances=1, memories=1, tables=4, table_elements=100_000)
    store.set_fuel(config_data['computeBudget'])
    store.set_epoch_deadline(1)
    wasi = wasmtime.WasiConfig()
    wasi.argv = ['python', '-B', '-c', GUEST]
    wasi.env = [('PYTHONHOME', '/python'), ('PYTHONUTF8', '1')]
    wasi.preopen_dir(config_data['runtimeRoot'], '/python', fs_mutable=False)
    wasi.stdin_file = config_data['inputPath']
    chunks = []
    total = 0
    output_limited = False
    def capture(chunk):
        nonlocal total, output_limited
        total += len(chunk)
        if total > 16 * 1024 * 1024:
            output_limited = True
            engine.increment_epoch()
            return -errno.ENOSPC
        chunks.append(chunk)
        return len(chunk)
    wasi.stdout_custom = capture
    wasi.stderr_custom = lambda chunk: len(chunk)
    store.set_wasi(wasi)
    linker = wasmtime.Linker(engine)
    linker.define_wasi()
    module = wasmtime.Module.from_file(engine, str(Path(config_data['runtimeRoot']) / 'python.wasm'))
    timer = threading.Timer(config_data['wallMs'] / 1000, engine.increment_epoch)
    timer.daemon = True
    timer.start()
    try:
        instance = linker.instantiate(store, module)
        instance.exports(store)['_start'](store)
    except wasmtime.ExitTrap as err:
        if err.code != 0:
            return {'failure': 'assertion'}
    except wasmtime.Trap as err:
        if output_limited or 'fuel' in str(err): return {'failure': 'resource'}
        if 'interrupt' in str(err): return {'failure': 'timeout'}
        return {'failure': 'assertion'}
    finally:
        timer.cancel()
    if output_limited: return {'failure': 'resource'}
    text = b''.join(chunks).decode('utf-8', errors='replace').rstrip()
    last = text.rsplit('\n', 1)[-1]
    if not last.startswith('__DSH_VALUES__'): return {'failure': 'assertion'}
    try:
        frame = json.loads(last[len('__DSH_VALUES__'):])
    except (ValueError, RecursionError):
        return {'failure': 'assertion'}
    if not isinstance(frame, dict): return {'failure': 'assertion'}
    if isinstance(frame.get('items'), list):
        result={'items':frame['items']}
        if config_data.get('oracle')=='find-zero-stable-v1':
            try:
                inputs=json.loads(Path(config_data['inputPath']).read_text(encoding='utf-8'))['inputs']
                if len(inputs)!=len(frame['items']):return {'failure':'assertion'}
                checks=[]
                for args,output in zip(inputs,frame['items']):
                    if output.get('t') not in ('int','float'):return {'failure':'assertion'}
                    x_float=float(output['v'])
                    if not math.isfinite(x_float):return {'failure':'assertion'}
                    x=Fraction.from_float(x_float)
                    coefficients=[]
                    for value in args[0]['v']:
                        if value['t']=='int':coefficients.append(Fraction(int(value['v'])))
                        elif value['t']=='float':coefficients.append(Fraction.from_float(float(value['v'])))
                        else:return {'failure':'assertion'}
                    while len(coefficients)>1 and coefficients[-1]==0:coefficients.pop()
                    degree=len(coefficients)-1
                    p=Fraction(0);scale=Fraction(0)
                    for c in reversed(coefficients):p=p*x+c;scale=scale*abs(x)+abs(c)
                    u=Fraction(1,2**53)
                    gamma=degree*u/(1-degree*u)
                    allowed=Fraction(str(config_data['absoluteTolerance']))+gamma*scale
                    checks.append(abs(p)<=allowed)
                result['rootChecks']=checks
            except (ValueError,TypeError,KeyError,OverflowError,IndexError,AttributeError):
                return {'failure':'assertion'}
        return result
    if frame.get('failure') in ('resource', 'syntax', 'assertion'):
        return {'failure': frame['failure']}
    return {'failure': 'assertion'}

try:
    result = main()
except BaseException:
    result = {'environmentError': 'WASI_DRIVER_FAILED'}
sys.stdout.write(json.dumps(result))

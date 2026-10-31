"""Developer-only trusted oracle build from the EXACT official release asset.

Never accepts model solutions. Integers are strings to retain Python precision.
"""
from pathlib import Path
import copy, gzip, hashlib, json, random, sys, time
sys.set_int_max_str_digits(0)
source, destination = (Path(x).resolve() for x in sys.argv[1:3])
raw = source.read_bytes()
if hashlib.sha256(raw).hexdigest() != '272720b90ac375502c8ed23cd791c2a93dfb22a911641a494da74a426c09f101':
    raise RuntimeError('Unpinned release asset; canonical code will not execute')
if destination.exists(): raise RuntimeError('Preserve existing goldens; use a new output')
tasks = [json.loads(line) for line in gzip.decompress(raw).decode().splitlines()]
assert len(tasks) == 164
def typed(v, compress=False):
    tag = type(v).__name__
    if compress and tag=='str' and len(v)>1024:
        return {'t':'large-str','v':hashlib.sha256(v.encode('utf-8',errors='surrogatepass')).hexdigest()}
    if compress and tag in ('list','tuple') and len(v)>128 and not all(type(x)==float for x in v) and all(type(x) in (int,bool) or (type(x)==float and x.is_integer()) for x in v):
        digest=hashlib.sha256()
        for x in v:
            x=int(x);part=x.to_bytes((x.bit_length()+8)//8,'big',signed=True)
            digest.update(len(part).to_bytes(8,'big'));digest.update(part)
        return {'t':'large-int-'+tag,'v':digest.hexdigest()}
    if compress and tag == 'int' and v.bit_length()>4096:
        return {'t':'large-int','v':hashlib.sha256(v.to_bytes((v.bit_length()+8)//8,'big',signed=True)).hexdigest()}
    if tag in ('int', 'float'): return {'t':tag,'v':str(v)}
    if tag in ('NoneType', 'str', 'bool'): return {'t':tag,'v':v}
    if tag in ('list', 'tuple', 'set'): return {'t':tag,'v':[typed(x,compress) for x in v]}
    if tag == 'dict': return {'t':tag,'v':[[typed(k,compress),typed(x,compress)] for k,x in v.items()]}
    raise TypeError(tag)
start=time.monotonic(); output=[]
for task in tasks:
    namespace={};random.seed(0)
    exec(compile(task['prompt']+task['canonical_solution'],'pinned-trusted-canonical.py','exec'),namespace)
    fn=namespace[task['entry_point']]
    row={'id':task['task_id'],'prompt':task['prompt'],'canonical':task['canonical_solution'],
         'entryPoint':task['entry_point'],'atol':task['atol'],'cases':[]}
    if row['entryPoint']=='find_zero':row['oracle']='find-zero'
    for group in ['base','plus']:
        for args in task[group+'_input']:
            row['cases'].append({'group':group,'args':[typed(x) for x in args], 'expected':typed(fn(*copy.deepcopy(args)),True)})
    output.append(row)
    row_bytes=len(json.dumps(row,ensure_ascii=False,separators=(',',':')).encode())
    if row_bytes>5_000_000:print('Large reference task:',row['id'],'serialized bytes:',row_bytes,flush=True)
    if len(output)%25==0:print('Trusted oracle tasks:',len(output),flush=True)
data=(json.dumps({'releaseSha256':hashlib.sha256(raw).hexdigest(),'tasks':output},ensure_ascii=False,separators=(',',':'))+'\n').encode()
print('Reference payload bytes:',len(data),flush=True)
if len(data)>100_000_000:raise RuntimeError('Reference payload exceeds offline budget; inspect large task rows before writing')
destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(data)
print('Golden tasks:',len(output),'bytes:',len(data),'seconds:',round(time.monotonic()-start,2),'sha256:',hashlib.sha256(data).hexdigest())

"""Reproduce the pinned upstream reference defect; no model answers execute."""
from pathlib import Path
from fractions import Fraction as F
import gzip, hashlib, json, math, sys
source, destination = (Path(x).resolve() for x in sys.argv[1:3])
raw=source.read_bytes();sha=hashlib.sha256(raw).hexdigest()
assert sha=='272720b90ac375502c8ed23cd791c2a93dfb22a911641a494da74a426c09f101'
task=next(json.loads(x) for x in gzip.decompress(raw).decode().splitlines() if json.loads(x)['task_id']=='HumanEval/32')
ns={};exec(compile(task['prompt']+task['canonical_solution'],'pinned-trusted-reference.py','exec'),ns)
inputs=[('base',x) for x in task['base_input']]+[('plus',x) for x in task['plus_input']]
failures=[]
def poly(a,x):return sum(c*math.pow(x,i) for i,c in enumerate(a))
for i,(group,args) in enumerate(inputs):
    x=ns['find_zero'](*args);residual=poly(args[0],x)
    if not abs(residual)<=task['atol']:failures.append({'index':i,'group':group,'output':x,'officialResidual':residual})
def trim(p):
    while len(p)>1 and p[-1]==0:p.pop()
    return p
def remainder(a,b):
    a=a[:]
    while len(a)>=len(b) and any(a):
        k=len(a)-len(b);c=a[-1]/b[-1]
        for j in range(len(b)):a[j+k]-=c*b[j]
        trim(a)
    return a
def sturm(p):
    p=trim(p[:]);d=[F(i)*c for i,c in enumerate(p)][1:];seq=[p,trim(d)]
    while any(seq[-1]):
        r=[-c for c in remainder(seq[-2],seq[-1])]
        if not any(r):break
        seq.append(r)
    return seq
def evaluate(p,x):
    v=F(0)
    for c in reversed(p):v=v*x+c
    return v
def variations(seq,x):
    signs=[]
    for p in seq:
        value=p[-1]*((-1)**(len(p)-1) if x=='-inf' else 1) if isinstance(x,str) else evaluate(p,x)
        if value:signs.append(1 if value>0 else -1)
    return sum(a!=b for a,b in zip(signs,signs[1:]))
proofs=[]
for index,left,right in [(219,17.3124550475086,17.312455047508603),(499,13.091719521058346,13.091719521058348),(794,5.466421282858953,5.466421282858954)]:
    coefficients=[F(x) for x in inputs[index][1][0]];lo,hi=F.from_float(left),F.from_float(right)
    assert math.nextafter(left,math.inf)==right
    checks=[]
    for shift in [F(0),-F(1,10000),F(1,10000)]:
        p=coefficients[:];p[0]+=shift;seq=sturm(p)
        total=variations(seq,'-inf')-variations(seq,'+inf')
        inside=variations(seq,lo)-variations(seq,hi)
        checks.append({'constantShift':str(shift),'totalRealRoots':total,'rootsBetweenAdjacentFloats':inside})
    assert all(x['totalRealRoots']==1 and x['rootsBetweenAdjacentFloats']==1 for x in checks)
    proofs.append({'index':index,'coefficients':[int(x) for x in coefficients],'adjacentBinary64':[left,right],
        'exactPolynomialAtEndpoints':[float(evaluate(coefficients,lo)),float(evaluate(coefficients,hi))],'sturm':checks})
report={'schemaVersion':1,'sourceRelease':'v0.1.10','sourceSha256':sha,'taskId':task['task_id'],'python':sys.version,
    'baseInputs':len(task['base_input']),'plusInputs':len(task['plus_input']),'absoluteTolerance':task['atol'],
    'canonicalFailures':failures,'exactPolynomialProofs':proofs,
    'finding':'Reference fails 7 unchanged plus inputs. For 3 inputs the exact-polynomial acceptable interval lies strictly between adjacent binary64 values.',
    'limit':'This proves the exact-polynomial binary64 limitation, not global unsatisfiability of every rounded math.pow predicate.',
    'status':'pending-protocol-decision'}
destination.parent.mkdir(parents=True,exist_ok=True);destination.write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('Reference failures:',len(failures),'exact rational proofs:',len(proofs),'report:',destination.name)

"""Trusted simulator adapter. Model inputs are JSON values, never Python source.
Upstream classes/checker retain their Apache-2.0 license in LICENSE.
"""
import ast, builtins, copy, datetime, importlib.util, inspect, json, math, os, pathlib, random, socket, subprocess, sys, types

ROOT = pathlib.Path(__file__).parent
PREFIX = 'bfcl_eval.eval_checker.multi_turn_eval.'
for name in ['bfcl_eval', 'bfcl_eval.eval_checker', 'bfcl_eval.eval_checker.multi_turn_eval', PREFIX+'func_source_code']:
    mod = types.ModuleType(name); mod.__path__ = []; sys.modules[name] = mod

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT/filename)
    module = importlib.util.module_from_spec(spec); sys.modules[name] = module; spec.loader.exec_module(module)
    return module

load(PREFIX+'func_source_code.long_context', 'eval_checker__multi_turn_eval__func_source_code__long_context.py')
mapping = {'GorillaFileSystem':'gorilla_file_system','TwitterAPI':'posting_api','TicketAPI':'ticket_api','MessageAPI':'message_api','TradingBot':'trading_bot','TravelAPI':'travel_booking','VehicleControlAPI':'vehicle_control'}
modules = {name:load(PREFIX+'func_source_code.'+file, 'eval_checker__multi_turn_eval__func_source_code__'+file+'.py') for name,file in mapping.items()}
classes = {name:getattr(modules[name], name) for name in mapping}
value_classes = {**classes, **{name:getattr(modules['GorillaFileSystem'], name) for name in ['File','Directory']}}
documents = {name:[json.loads(line) for line in (ROOT/('doc__'+file+'.json')).read_text(encoding='utf8').splitlines() if line.strip()] for name,file in mapping.items()}

def bind_json(value, schema):
    kind=schema.get('type')
    if kind in ('float','number'):
        if type(value) not in (int,float) or not math.isfinite(value):raise TypeError('expected finite number')
        return float(value) if kind=='float' else value
    if kind in ('int','integer') and type(value) is not int:raise TypeError('expected integer')
    if kind in ('str','string') and type(value) is not str:raise TypeError('expected string')
    if kind in ('bool','boolean') and type(value) is not bool:raise TypeError('expected boolean')
    if kind in ('list','array'):
        if not isinstance(value,list):raise TypeError('expected array')
        return [bind_json(v,schema.get('items',{})) for v in value]
    if kind in ('dict','object'):
        if not isinstance(value,dict):raise TypeError('expected object')
        if any(k not in value for k in schema.get('required',[])):raise TypeError('missing required argument')
        return {k:bind_json(v,schema.get('properties',{}).get(k,{})) for k,v in value.items()}
    return value

def new_group(scenario):
    group = {}
    for name in scenario['involved_classes']:
        obj = classes[name](); obj._load_scenario(copy.deepcopy(scenario['initial_config'].get(name, {})), long_context=False); group[name] = obj
    return group

def methods_for(group, scenario):
    methods = {}
    for name,obj in group.items():
        for doc in documents[name]:
            method = doc['name']
            if method.startswith('_') or method in scenario.get('excluded_function', []): continue
            if method in methods: raise RuntimeError('AMBIGUOUS_TOOL')
            methods[method] = getattr(obj, method)
    return methods

def execute(group, scenario, call):
    methods = methods_for(group, scenario)
    # Only fixed public method identifiers can reach the simulator.
    if not isinstance(call, dict) or call.get('name') not in methods: return 'Error during execution: UNKNOWN_TOOL', True
    try:
        args = copy.deepcopy(call.get('arguments', {}))
        if not isinstance(args, dict): raise TypeError('arguments must be an object')
        schema=next(doc['parameters'] for name in group for doc in documents[name] if doc['name']==call['name'])
        args=bind_json(args,schema)
        bound = inspect.signature(methods[call['name']]).bind(**args); bound.apply_defaults()
        result = methods[call['name']](**copy.deepcopy(dict(bound.arguments)))
        if isinstance(result, str): text = result
        elif isinstance(result, dict):
            try: text = json.dumps(result)
            except TypeError: text = str(result)
        else: text = str(result)
        return text, isinstance(result, dict) and any(k in result for k in ['error','error_message'])
    except (TypeError, ValueError, KeyError, IndexError, AttributeError) as error:
        return 'Error during execution: '+str(error), True

def reference_call(expression, group, scenario):
    # Expressions come exclusively from the pinned reference file, not the model.
    node = ast.parse(expression, mode='eval').body
    if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name) or any(k.arg is None for k in node.keywords): raise ValueError('UNSUPPORTED_REFERENCE')
    methods = methods_for(group, scenario)
    if node.func.id not in methods: raise ValueError('UNSUPPORTED_REFERENCE_TOOL')
    bound = inspect.signature(methods[node.func.id]).bind(*[ast.literal_eval(a) for a in node.args], **{k.arg:ast.literal_eval(k.value) for k in node.keywords})
    return {'name':node.func.id,'arguments':dict(bound.arguments)}

def pack(value):
    nodes = []; seen = {}
    def visit(v):
        if type(v) is float:
            if not math.isfinite(v):raise ValueError('NONFINITE_STATE')
            return {'f':repr(v)}
        if v is None or type(v) in (str, bool, int): return {'v':v}
        key = id(v)
        if key in seen: return {'r':seen[key]}
        if len(nodes)>=100000: raise RuntimeError('STATE_TOO_LARGE')
        index=len(nodes); seen[key]=index; nodes.append(None)
        if isinstance(v, dict): node={'t':'dict','v':[[visit(k),visit(x)] for k,x in v.items()]}
        elif isinstance(v, (list, tuple, set)): node={'t':type(v).__name__,'v':[visit(x) for x in v]}
        elif isinstance(v, random.Random): node={'t':'random','v':visit(v.getstate())}
        elif isinstance(v, datetime.datetime): node={'t':'datetime','v':v.isoformat()}
        elif type(v).__name__ in value_classes and type(v) is value_classes[type(v).__name__]: node={'t':'object','c':type(v).__name__,'v':visit(vars(v))}
        else: raise RuntimeError('UNSUPPORTED_STATE_TYPE:'+type(v).__name__)
        nodes[index]=node; return {'r':index}
    root=visit(value);return {'root':root,'nodes':nodes}

def unpack(snapshot):
    nodes=snapshot['nodes']; cache={}
    if len(nodes)>100000: raise ValueError('STATE_TOO_LARGE')
    def visit(ref):
        if 'f' in ref:
            value=float(ref['f'])
            if not math.isfinite(value):raise ValueError('NONFINITE_STATE')
            return value
        if 'v' in ref:return ref['v']
        i=ref['r']
        if i in cache:return cache[i]
        n=nodes[i];t=n['t']
        if t=='dict':
            out={};cache[i]=out
            for k,v in n['v']:out[visit(k)]=visit(v)
        elif t=='list':out=[];cache[i]=out;out.extend(visit(v) for v in n['v'])
        elif t=='set':out=set();cache[i]=out;out.update(visit(v) for v in n['v'])
        elif t=='tuple':out=tuple(visit(v) for v in n['v']);cache[i]=out
        elif t=='random':out=random.Random();cache[i]=out;out.setstate(visit(n['v']))
        elif t=='datetime':out=datetime.datetime.fromisoformat(n['v']);cache[i]=out
        elif t=='object':out=value_classes[n['c']].__new__(value_classes[n['c']]);cache[i]=out;out.__dict__.update(visit(n['v']))
        else:raise ValueError('INVALID_STATE_TYPE')
        return out
    return visit(snapshot['root'])

instances={}
def checker_execute(func_call_list, initial_config, involved_classes, model_name, test_entry_id, **unused):
    scenario={'initial_config':initial_config,'involved_classes':involved_classes,'excluded_function':request['scenario'].get('excluded_function', [])}
    key=(model_name,test_entry_id)
    if key not in instances:instances[key]=new_group(scenario)
    group=instances[key];results=[]
    for call in func_call_list:
        data=reference_call(call,group,scenario) if isinstance(call,str) else call
        results.append(execute(group,scenario,data)[0])
    return results,group
stub=types.ModuleType(PREFIX+'multi_turn_utils');stub.execute_multi_turn_func_call=checker_execute;stub.is_empty_execute_response=lambda x:not x or (len(x)==1 and not x[0]);sys.modules[stub.__name__]=stub
checker=load(PREFIX+'multi_turn_checker','eval_checker__multi_turn_eval__multi_turn_checker.py')

request=json.load(sys.stdin)
def deny(*args,**kwargs):raise RuntimeError('EXTERNAL_IO_DISABLED')
# Imports and JSON loading complete before sealing. There is no model-code runner.
socket.socket.connect=deny;socket.socket.connect_ex=deny;subprocess.Popen=deny;os.system=deny;os.open=deny;builtins.open=deny
scenario=request['scenario'];action=request['action']
if action=='initialize':result={'snapshot':pack(new_group(scenario))}
elif action=='execute':
    group=unpack(request['snapshot']);text,error=execute(group,scenario,request['call']);result={'snapshot':pack(group),'text':text,'isError':error}
elif action=='grade':
    calls=request['callsByTurn'];reference=request['reference']
    result=checker.multi_turn_checker([[turn] for turn in calls],reference,scenario,'multi_turn_base','candidate')
    result={'passed':bool(result['valid']),'reason':result.get('error_type','passed')}
elif action=='reference':
    group=new_group(scenario);turns=[]
    for turn in request['reference']:
        calls=[]
        for expr in turn:
            call=reference_call(expr,group,scenario);execute(group,scenario,call);calls.append(call)
        turns.append(calls)
    result={'turns':turns}
else:raise ValueError('INVALID_ACTION')
print(json.dumps(result,allow_nan=False))

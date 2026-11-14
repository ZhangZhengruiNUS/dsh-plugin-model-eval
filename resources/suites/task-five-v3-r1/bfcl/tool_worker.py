"""Trusted simulator adapter. Model inputs are JSON values, never Python source.
Upstream classes/checker retain their Apache-2.0 license in LICENSE.
"""
import ast, builtins, copy, datetime, importlib.util, inspect, json, math, os, pathlib, random, socket, subprocess, sys, types

ROOT = pathlib.Path(__file__).parents[2]/'task-five-v1'/'bfcl'
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


# Only these two reviewed filesystem tasks use the correction. All other tasks
# retain the original pinned checker. No model-written code is evaluated.
import re

def same_text(a,b):
    try:return json.loads(a)==json.loads(b)
    except (ValueError,TypeError):return a==b

def final_text(message):
    return '\n'.join(b['text'] for b in message.get('content',[]) if b.get('type')=='text')

def evidence_replay(calls,messages):
    if not isinstance(messages,list):raise ValueError('TOOL_EVIDENCE_REQUIRED')
    group=new_group(scenario);turn=-1;pending=[];observed=[[] for _ in calls];finals=['' for _ in calls];states=[];actual=[[] for _ in calls];seen=set()
    for message in messages:
        role=message.get('role');blocks=message.get('content',[])
        if role=='user':
            if pending or (turn>=0 and not finals[turn]):raise ValueError('TOOL_EVIDENCE_UNFINISHED')
            if turn>=0:states.append(copy.deepcopy(group))
            turn+=1
            if turn>=len(calls) or final_text(message)!=scenario['question'][turn][0]['content']:raise ValueError('TOOL_USER_MISMATCH')
        elif turn<0:raise ValueError('TOOL_EVIDENCE_ORDER')
        elif role=='assistant':
            if pending or finals[turn]:raise ValueError('TOOL_EVIDENCE_ORDER')
            tool_blocks=[b for b in blocks if b.get('type')=='tool-call']
            if tool_blocks:
                for block in tool_blocks:
                    cid=block.get('id')
                    if not cid or cid in seen:raise ValueError('TOOL_DUPLICATE_CALL')
                    seen.add(cid);data={'name':block['name'],'arguments':json.loads(block['arguments'])};actual[turn].append(data);pending.append((cid,data))
            else:finals[turn]=final_text(message)
        elif role=='tool':
            if not pending or message.get('toolCallId')!=pending[0][0]:raise ValueError('TOOL_RESULT_ORDER')
            _,data=pending.pop(0);text,error=execute(group,scenario,data)
            if not same_text(text,final_text(message)) or error!=message.get('isError',False):raise ValueError('TOOL_RESULT_MISMATCH')
            observed[turn].append((copy.deepcopy(data),text,error))
        else:raise ValueError('TOOL_EVIDENCE_ROLE')
    if pending or turn!=len(calls)-1 or not finals[-1] or actual!=calls:raise ValueError('TOOL_EVIDENCE_INCOMPLETE')
    states.append(copy.deepcopy(group));return states,observed,finals

def state_valid(model,expected,check_cwd=True):
    if not checker.state_checker(model,expected)['valid']:return False
    return not check_cwd or all(model[c].pwd()==expected[c].pwd() for c in model if c=='GorillaFileSystem')

def display_content(text,content):
    # Accept a complete displayed value, never an occurrence inside a claim.
    blocks=re.findall(r'```[^\n]*\n([\s\S]*?)\n```',text)
    plain=text.replace('`','').replace('*','')
    shown=content in blocks or any(line.strip()==content for line in plain.splitlines())
    remainder=plain.replace(content,'')
    return shown and not re.search(r"\b(incorrect|wrong|instead)\b|\b(?:not|doesn't|cannot)\s+contain\b|\bnot\s+(?:the\s+)?(?:correct|content)\b",remainder,re.I)

def second_answer(text,names):
    text=text.split('If you meant')[0].split('if you meant')[0]
    plain=text.replace('`','').replace('*','').strip()
    if re.search(r'\b(maybe|perhaps|not|either|incorrect|actually|statement)\b',plain,re.I):return False
    found=re.findall(r'\bsecond\b[^\n.!?:]{0,180}\bis\s+([\w.-]+)',plain,re.I)
    if found and any(x.rstrip('.')!=names[1] for x in found):return False
    ordered=re.findall(r'^\s*[123][.)]\s+([\w.-]+)',plain,re.M)
    if ordered and ordered!=names:return False
    if ordered==names:
        remainder=re.sub(r'^\s*[123][.)].*$', '',plain,flags=re.M)
        return all(n==names[1] for n in re.findall(r'\b(?:'+ '|'.join(re.escape(n) for n in names)+r')\b',remainder))
    if plain.rstrip('.')==names[1]:return True
    return bool(re.match(r'^(?:The\s+)?second\b',plain,re.I) and found and all(n==names[1] for n in re.findall(r'\b(?:'+ '|'.join(re.escape(n) for n in names)+r')\b',plain)))

def filesystem_grade(calls,messages,reference):
    states,observed,finals=evidence_replay(calls,messages);expected=new_group(scenario);all_results=[]
    is39=scenario['id']=='multi_turn_base_39'
    for index,ref in enumerate(reference):
        expected_results=[]
        for expression in ref:
            expected_results.append(execute(expected,scenario,reference_call(expression,expected,scenario))[0])
        model=states[index]
        if not state_valid(model,expected,is39 or index==1):return {'passed':False,'reason':'filesystem-state-or-directory'}
        all_results.extend(row[1] for row in observed[index])
        if is39 and index>=2:
            fs=model['GorillaFileSystem'];names=fs.ls(a=False)['current_directory_content']
            if len(names)!=3:return {'passed':False,'reason':'filesystem-order'}
            if index==2:
                if any(err or data['name']!='ls' or data['arguments'].get('a',False) for data,txt,err in observed[index]):return {'passed':False,'reason':'filesystem-unrelated-query'}
                # A fresh listing OR the complete successful creation trace in
                # this newly created directory proves the observable order.
                listed=any(not err and data['name']=='ls' and json.loads(txt).get('current_directory_content')==names for rows in observed[:3] for data,txt,err in rows)
                created=[data['arguments'].get('file_name') for data,txt,err in observed[1] if not err and data['name']=='touch']
                if not (listed or created==names) or not second_answer(finals[index],names):return {'passed':False,'reason':'filesystem-second-answer'}
            else:
                first=names[0];content=fs.cat(first)['file_content']
                if any(err or data['name'] not in ('ls','cat') or data['name']=='cat' and data['arguments'].get('file_name')!=first or data['name']=='ls' and data['arguments'].get('a',False) for data,txt,err in observed[index]):return {'passed':False,'reason':'filesystem-unrelated-query'}
                reads=[data['arguments'].get('file_name') for data,txt,err in observed[index] if not err and data['name']=='cat']
                if first not in reads or not display_content(finals[index],content) or any(fs.cat(n)['file_content'] in finals[index] for n in names[1:]):return {'passed':False,'reason':'filesystem-first-content'}
            continue
        proof=list(all_results)
        if not is39 and index==1:
            if any(err or data['name'] not in ('cat','sort','cd') or data['name'] in ('cat','sort') and data['arguments'].get('file_name')!='archive_summary.txt' for data,txt,err in observed[index]):return {'passed':False,'reason':'filesystem-unrelated-query'}
            fs=model['GorillaFileSystem'];original=fs.cat('archive_summary.txt').get('file_content');sorted_value=fs.sort('archive_summary.txt').get('sorted_content')
            sorts=[(data,txt) for data,txt,err in observed[index] if not err and data['name']=='sort' and data['arguments'].get('file_name')=='archive_summary.txt']
            cats=[data for data,txt,err in observed[index] if not err and data['name']=='cat' and data['arguments'].get('file_name')=='archive_summary.txt']
            if not sorts or original is None or not display_content(finals[index],original) or not display_content(finals[index],sorted_value):return {'passed':False,'reason':'filesystem-original-and-sort-answer'}
            if not cats:
                if original!=sorted_value:return {'passed':False,'reason':'filesystem-sort-not-original'}
                proof.append(json.dumps({'file_content':original}))
        if ref and not checker.response_checker(proof,expected_results,index)['valid']:return {'passed':False,'reason':'filesystem-required-response'}
    return {'passed':True,'reason':'filesystem-evidence-v2'}

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
    if scenario['id'] not in ('multi_turn_base_39','multi_turn_base_5'):raise ValueError('INVALID_CORRECTION_SCENARIO')
    result=filesystem_grade(calls,request.get('messages'),reference)
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

import {spawn} from 'node:child_process';import {readFile} from 'node:fs/promises';import {join,resolve} from 'node:path';
import type {JsonValue,NativeTool,Question,ToolCall} from '../contracts.ts';
import {verifyRuntime} from './integrity.ts';import {RUNTIME_PINS} from './pins.ts';import {TOOL_RUNTIME_SHA256} from './tool-pin.ts';
export interface ToolDispatchResult {snapshot:JsonValue;text:string;isError:boolean}
export interface ToolDispatcher {tools:readonly NativeTool[];userTurns:readonly (readonly {role:string;content:string}[])[];initialize(signal:AbortSignal):Promise<JsonValue>;execute(snapshot:JsonValue,call:ToolCall,signal:AbortSignal):Promise<ToolDispatchResult>;grade(calls:readonly (readonly ToolCall[])[],signal:AbortSignal):Promise<{passed:boolean;reason:string}>}
const classFiles:Record<string,string>={GorillaFileSystem:'gorilla_file_system',TwitterAPI:'posting_api',TicketAPI:'ticket_api',MessageAPI:'message_api',TradingBot:'trading_bot',TravelAPI:'travel_booking',VehicleControlAPI:'vehicle_control'};
function projectSchema(value:any):JsonValue {
 if(value===null||typeof value!=='object')return value as JsonValue;
 if(Array.isArray(value))return value.map(projectSchema);
 const result:Record<string,JsonValue>={};for(const [key,v]of Object.entries(value)){
  if(key==='type'){const aliases:Record<string,string>={dict:'object',float:'number',int:'integer',str:'string',bool:'boolean'};if(v==='any')continue;result[key]=typeof v==='string'?aliases[v]??v:v as JsonValue;}
  else result[key]=v&&typeof v==='object'?projectSchema(v):v as JsonValue;
 }
 return result;
}
/** Only pinned Python simulator methods receive JSON arguments. No shell or eval. */
export async function createToolDispatcher(resourcesRoot:string,question:Question):Promise<ToolDispatcher> {
 const root=resolve(resourcesRoot),runtime=join(root,'runtime','rules'),simulator=join(root,'suites','task-five-v1','bfcl');
 if(question.datasetId!=='bfcl-v4-multi-turn-selected')throw Error('INVALID_TOOL_SCENARIO');
 await verifyRuntime(runtime,'trusted-ifeval',RUNTIME_PINS['trusted-ifeval']);await verifyRuntime(simulator,'sealed-bfcl',TOOL_RUNTIME_SHA256);
 const raw=question.grading as any,scenario=raw.scenario;
 if(!scenario||question.sourceId!==scenario.id||!Array.isArray(scenario.involved_classes)||scenario.involved_classes.some((c:string)=>!Object.hasOwn(classFiles,c)))throw Error('INVALID_TOOL_SCENARIO');
 const docs=(await Promise.all(scenario.involved_classes.map(async(c:string)=>(await readFile(join(simulator,'doc__'+classFiles[c]+'.json'),'utf8')).split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line))))).flat();
 const tools:NativeTool[]=docs.filter(d=>!scenario.excluded_function?.includes(d.name)).map(d=>({name:d.name,description:d.description,parameters:projectSchema(d.parameters)}));
 if(new Set(tools.map(t=>t.name)).size!==tools.length||tools.some(t=>!/^\w+$/.test(t.name)||t.name.startsWith('_')))throw Error('INVALID_TOOL_SCHEMA');
 const invoke=async(action:string,payload:Record<string,unknown>,signal:AbortSignal):Promise<any>=>{
  if(signal.aborted)throw Error('ABORTED');
  const input=JSON.stringify({action,scenario,...payload});if(Buffer.byteLength(input)>16*1024*1024)throw Error('TOOL_INPUT_LIMIT');
  return new Promise((done,reject)=>{
   const child=spawn(join(runtime,'python.exe'),['-I','-B','-X','utf8',join(simulator,'tool_worker.py')],{shell:false,windowsHide:true,cwd:simulator,env:{},stdio:['pipe','pipe','pipe']});
   let text='',bytes=0,stopped=false;const stop=()=>{stopped=true;child.kill('SIGKILL');},timer=setTimeout(stop,15000);signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
   child.on('error',()=>{stopped=true;});child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>8*1024*1024)stop();else text+=b.toString('utf8');});child.stderr.on('data',()=>{});child.stdin.on('error',()=>{});
   child.on('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',stop);if(signal.aborted)return reject(Error('ABORTED'));if(stopped||code!==0)return reject(Error('TOOL_SIMULATOR_FAILED'));try{done(JSON.parse(text));}catch{reject(Error('INVALID_TOOL_SIMULATOR_RESULT'));}});child.stdin.end(input);
  });
 };
 const data=(call:ToolCall)=>{let args:unknown;try{args=JSON.parse(call.argumentsJson);}catch{return {name:'__invalid_json__',arguments:{}};}return {name:call.name,arguments:args};};
 return {tools,userTurns:structuredClone(scenario.question),async initialize(signal){return (await invoke('initialize',{},signal)).snapshot;},async execute(snapshot,call,signal){
  const result=await invoke('execute',{snapshot,call:data(call)},signal);if(typeof result.text!=='string'||typeof result.isError!=='boolean'||!result.snapshot)throw Error('INVALID_TOOL_SIMULATOR_RESULT');return result;
 },async grade(calls,signal){const result=await invoke('grade',{callsByTurn:calls.map(turn=>turn.map(data)),reference:raw.reference},signal);if(typeof result.passed!=='boolean'||typeof result.reason!=='string')throw Error('INVALID_TOOL_GRADE');return result;}};
}

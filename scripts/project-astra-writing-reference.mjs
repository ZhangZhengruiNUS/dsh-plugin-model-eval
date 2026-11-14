import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {admittedNativeWritingReference} from '../src/client/comparison/native-reference.ts';
import {loadProtocolSet} from '../src/evaluation/protocols.ts';
import {currentWritingEdition} from '../src/evaluation/writing-edition.ts';
import {readRecord} from '../src/history/atomic.ts';
import {activeMilliseconds} from '../src/jobs/metrics.ts';
import {summarizeTaskTiming} from '../src/jobs/task-duration.ts';
import {createWritingGrader} from '../src/writing/judge.ts';
import {DIMENSIONS,scoreWritingDimensions} from '../src/writing/score.ts';

const [captureArg,outputArg]=process.argv.slice(2);
if(!captureArg||!outputArg)throw Error('Usage: node scripts/project-astra-writing-reference.mjs CAPTURE OUTPUT_JSON');
const source=resolve(captureArg);
const output=resolve(outputArg);
const packageRoot=fileURLToPath(new URL('../',import.meta.url));
const read=async name=>JSON.parse(await readFile(join(source,name),'utf8'));
const hash=data=>createHash('sha256').update(data).digest('hex');
const hashJSON=value=>hash(JSON.stringify(value));
const modelId='gpt-6-astra';
const execution={concurrency:4,callTimeoutMs:300000,failurePolicy:'output-idle-v1'};
const edition=currentWritingEdition;
const count=edition.questionCount;

const [plan,batch,report,proof]=await Promise.all(
  ['writing-plan','writing-batch','writing-report','writing-timing-proof'].map(name=>read(name+'.json')));
assert.equal(proof.offline,false,'Only a real capture may become a built-in reference');
assert.deepEqual([plan.writingId,proof.writingId],[edition.id,edition.id]);
assert.deepEqual([plan.model,plan.judgeModel,plan.effort,plan.channel],[modelId,modelId,'max','ChatGPT 订阅']);
assert.deepEqual(plan.execution,execution);
assert.deepEqual(report.execution,execution);
for(const path of ['protocols/writing.json','protocols/rubric-writing-v1.json']){
  assert.equal(hash(await readFile(join(packageRoot,'resources',path))),plan.pins[path]);
}
const original=report.summary;
assert.match(original.runId,/^[a-f0-9-]{36}$/);
assert.match(original.batchId,/^[a-f0-9-]{36}$/);
assert.deepEqual(batch.runIds,[original.runId]);
assert.equal(original.runId,proof.runId);
assert.equal(original.batchId,batch.batchId);
assert.equal(original.target.modelId,modelId);
assert.equal(original.target.providerId,'openai-chatgpt-plan');
assert.equal(original.target.controls.reasoningEffort.value,'max');
assert(!original.regradeOrigin&&!original.reuse&&!original.executionChanges?.length);
assert(!original.tracks.general&&!original.generalDefinition);
assert.equal(hashJSON(original),proof.summarySha256);

const runDir=join(source,'evaluation','history','runs',original.runId);
const manifest=await readRecord(join(runDir,'run.json'));
assert.equal(manifest.runId,original.runId);
assert.equal(manifest.batchId,original.batchId);
assert.deepEqual(manifest.target,original.target);
assert.deepEqual(manifest.protocols,original.protocols);
assert.equal(original.protocols.writingId,edition.id);
// A writing-only result is identified by the pinned writing edition and rubric.
// The archived general selection was not part of this run.
const protocol=await loadProtocolSet(join(packageRoot,'resources'));
assert.equal(protocol.writingId,edition.id);
const questions=protocol.items.filter(q=>q.track==='writing');
const required=questions.map(({id,datasetId,track})=>({id,datasetId,track}));
assert.equal(required.length,count);
assert.deepEqual(manifest.requiredItems,required);
assert.deepEqual(report.questions.map(({id,datasetId,track})=>({id,datasetId,track})),required);
assert.equal(hashJSON(required),proof.requiredSha256);

const rubric=JSON.parse(await readFile(join(packageRoot,'resources','protocols','rubric-writing-v1.json'),'utf8'));
const grader=createWritingGrader(rubric);
const judge={target:original.target,rubricId:rubric.id,promptId:rubric.promptId};
assert.equal(original.judges.length,1);
assert.deepEqual(original.judges[0].snapshot,judge);
assert.deepEqual([...original.judges[0].itemIds].sort(),required.map(q=>q.id).sort());
const events=(await readFile(join(source,'writing-requests.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const completed=events.filter(e=>e.status==='completed');
const starts=events.filter(e=>e.startedAt);
assert(completed.length>=2*count);
assert.equal(new Set(completed.map(e=>e.attemptId)).size,completed.length);
assert.equal(new Set(starts.map(e=>e.attemptId)).size,starts.length);
assert(completed.every(e=>e.model===modelId&&e.effort==='max'));
const records=[];
const timings=[];
for(const question of questions){
  const item=await readRecord(join(runDir,'details','items',hash(question.id)+'.json'));
  assert.equal(item.itemId,question.id);
  assert(item.answer?.complete&&!item.answer.truncated&&item.answer.text.trim()&&!item.reuse&&!item.regradedFrom);
  assert(item.grade?.kind==='scored'&&item.grade.assessment.method==='model');
  assert.deepEqual(item.grade.assessment.judge,judge);
  assert.equal(item.grade.score,scoreWritingDimensions(item.grade.dimensions));
  const phaseTimings={};
  for(const phase of ['answer','judge']){
    const attempts=item.attempts.filter(a=>a.phase===phase);
    const successful=attempts.filter(a=>a.status==='completed'&&!a.validationError);
    assert.equal(successful.length,1);
    const [attempt]=successful;
    const verified=completed.filter(e=>e.itemId===question.id&&e.phase===phase&&e.attemptId===attempt.attemptId);
    assert.equal(verified.length,1);
    assert.deepEqual([verified[0].model,verified[0].effort],[modelId,'max']);
    const start=starts.find(e=>e.attemptId===attempt.attemptId);
    assert.equal(start?.startedAt,attempt.observations.startedAt);
    const callMs=attempts.reduce((sum,a)=>{
      const duration=a.observations?.timing?.totalMs;
      assert(a.status!=='started'&&Number.isFinite(duration)&&duration>0);
      return sum+duration;
    },0);
    phaseTimings[phase]={calls:attempts.length,callMs};
    if(phase==='judge')assert.deepEqual(grader.parse(question,{complete:true,text:attempt.rawText},judge,item.answer),item.grade);
  }
  records.push(item);
  timings.push({itemId:question.id,score:item.grade.score,answerTaskMs:summarizeTaskTiming([question],[item]).writing.meanMs,...phaseTimings});
}
assert.equal(hashJSON(records),proof.itemsSha256);
assert.deepEqual(timings,proof.timings);
const timing=summarizeTaskTiming(required,records).writing;
const observed=original.metrics.tracks.writing;
const persistedAttempts=new Map(records.flatMap(item=>item.attempts.map(attempt=>[attempt.attemptId,attempt])));
assert(completed.every(event=>{
  const attempt=persistedAttempts.get(event.attemptId);
  return attempt?.itemId===event.itemId&&attempt.phase===event.phase;
}));
assert.deepEqual(timing,proof.timing);
assert.deepEqual(timing,observed.answer.taskTiming);
assert.equal(proof.elapsedMs,Date.parse(original.completedAt)-Date.parse(original.createdAt));
assert.equal(proof.activeMs,activeMilliseconds(original.metrics));
assert(proof.elapsedMs>0&&proof.activeMs>0&&proof.activeMs<=proof.elapsedMs);
const average=values=>values.reduce((sum,value)=>sum+value,0)/count;
const score=average(records.map(item=>item.grade.score));
const completedAt=original.tracks.writing.completedAt;
const measures=Object.fromEntries(DIMENSIONS.map(key=>[key,{required:count,graded:count,score:average(records.map(item=>item.grade.dimensions[key]))}]));
const track={status:'completed',required:count,answered:count,graded:count,measures,score,completedAt};
assert.deepEqual(original.tracks.writing,track);
assert.equal(proof.score,score);

const target={scopeId:'built-in-reference',providerId:'OpenAI',modelId,routeTarget:{state:'unknown'},
  controls:{reasoningEffort:{state:'known',value:'max',source:'override'}}};
function phaseMetrics(phase){
  const {calls,failures,usageCoverage}=phase;
  const values={calls,failures,usageCoverage};
  if(usageCoverage===1&&calls>0)
    for(const key of ['inputTokens','outputTokens','totalTokens','reasoningTokens','cacheReadTokens','cacheWriteTokens'])
      if(Number.isFinite(phase[key]))values[key]=phase[key];
  return values;
}
const summary={
  runId:'openai-gpt-6-astra-max-writing-v1-0',batchId:'built-in-reference',revision:1,target,
  protocols:original.protocols,details:'cleared',resumeAllowed:false,tracks:{writing:track},
  judges:[{snapshot:{target,rubricId:judge.rubricId,promptId:judge.promptId},itemIds:required.map(q=>q.id)}],
  metrics:{tracks:{writing:{answer:{...phaseMetrics(observed.answer),taskTiming:timing},
    judge:phaseMetrics(observed.judge),gradingMs:0}},activeIntervals:[],incompleteTiming:true},
  createdAt:original.createdAt,completedAt:original.completedAt,
};
const nativeRun={schema:'native-run-reference-v1',summarySha256:proof.summarySha256,itemsSha256:proof.itemsSha256,requiredSha256:proof.requiredSha256};
const reference={summary,execution:{state:'known',...execution},channel:plan.channel,nativeRun};
assert(admittedNativeWritingReference(summary,reference.execution,nativeRun));
await writeFile(output,JSON.stringify(reference,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({score,graded:count,measures,elapsedMs:proof.elapsedMs,activeMs:proof.activeMs,
  answerMeanMs:timing.meanMs,completedAt:summary.completedAt,output}));

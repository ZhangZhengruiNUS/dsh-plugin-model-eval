/** Reproduces the failed admission gate. Public data only; code executes in WASI. */
import {register} from 'tsx/esm/api';register();
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createContestRunner} from '../src/runtime/contest-runner.ts';
import {identityHash} from '../src/evaluation/protocol-identity.ts';
import {CONTEST_RUNTIME_SHA256} from '../src/runtime/contest-pin.ts';
const args=process.argv.slice(2),reportPath=args[args.indexOf('--report')+1];
if(!args.includes('--report')||!reportPath)throw Error('Usage: audit-contest-quality.mjs --report <json>; first project coding-negatives with tier-parquet.py');
const rows=JSON.parse(await readFile('.local/tier-candidates/sources/code-contests-test.json','utf8'));
const negatives=JSON.parse(await readFile('.local/tier-candidates/artifacts/negative-references.json','utf8'));
const question=rows[19],negative=negatives.find(r=>r.index===19),negativeCode=negative.incorrectPython3[1];
if(negative._source_record_sha256!==question.sourceRecordHash)throw Error('NEGATIVE_SOURCE_MISMATCH');
const values=[919,262,337,976,347,18,805],walks=[];
// Independent exhaustive oracle: every one of the 2^7 legal orientations.
for(let mask=0;mask<2**values.length;mask++){
 let x=0,lo=0,hi=0;const endpoints=[0];
 for(let i=0;i<values.length;i++){x+=((mask>>i)&1?1:-1)*values[i];endpoints.push(x);lo=Math.min(lo,x);hi=Math.max(hi,x);}
 walks.push({width:hi-lo,endpoints});
}
walks.sort((a,b)=>a.width-b.width);const exact=walks[0].width;
const counterexample={stdin:'1\n'+values.length+'\n'+values.join(' ')+'\n',expected:String(exact)+'\n'};
const runner=createContestRunner(resolve('resources/runtime')),limits={wallMs:30000,memoryBytes:536870912,computeBudget:200000000000};
const test=cases=>({id:question.id,cases,limits}),run=(code,cases)=>runner.runContest(test(cases),code,new AbortController().signal);
const full=await run(negativeCode,question.cases);process.stdout.write(JSON.stringify({fixedTests:full})+'\n');
const wrongCounter=await run(negativeCode,[counterexample]);
const reference=[...question.raw.python3_references].sort((a,b)=>a.length-b.length)[0],correctCounter=await run(reference,[counterexample]);
const report={schemaVersion:1,status:full.kind==='passed'&&wrongCounter.kind==='failed'&&correctCounter.kind==='passed'?'failed':'investigate',releaseAllowed:false,
 scope:'Resource quality gate; not model capability or a proof that fewer than 100 usable questions exist',
 source:{dataset:'deepmind/code_contests',revision:'802411c3010cb00d1b05bad57ca77365a3c699d6',index:19,name:question.raw.name,recordHash:question.sourceRecordHash},
 runtime:{contestManifestSha256:CONTEST_RUNTIME_SHA256,limits,memoryScope:'512 MiB per-instance WASI linear memory, not whole-host RSS',timingScope:'end-to-end scoring deadline including integrity and setup; forced cleanup may complete later'},
 negative:{publisherClassification:'incorrect_solutions/PYTHON3',index:1,codeHash:identityHash(negativeCode),fixedTestCount:question.cases.length,fixedOutcome:full,counterexampleOutcome:wrongCounter},
 counterexample:{...counterexample,oracle:'exhaustive 2^7 orientation enumeration; no model or external judge',arrangements:walks.length,minimum:exact,minimizingEndpoints:walks[0].endpoints,correctReferenceHash:identityHash(reference),correctReferenceOutcome:correctCounter},
 illegalInput:{sourceIndex:0,sourceName:rows[0].raw.name,caseIndex:166,sourceRecordHash:rows[0].sourceRecordHash,stdin:rows[0].cases[166].stdin,expected:rows[0].cases[166].expected,reason:'n=2,m=1 but declared first two titles AB and CA both have length 2. The problem guarantees length m.'},
 action:'Stop runtime release. Do not change original tests, source records, denominator or installed plugin without an explicit protocol amendment.'};
await mkdir(dirname(resolve(reportPath)),{recursive:true});await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');process.stdout.write(JSON.stringify({status:report.status,releaseAllowed:false,counterexample:report.counterexample})+'\n');process.exitCode=report.status==='failed'?1:2;

import test from 'node:test';
import assert from 'node:assert/strict';
import {ContestFrames} from '../../src/runtime/contest-frames.ts';
const frame=(i:number,s:string)=>JSON.stringify({case:i,output:Buffer.from(s).toString('base64')})+'\n';
test('only_all_ordered_matching_case_frames_and_complete_can_pass',()=>{
  const decoder=new ContestFrames([{expected:'3'},{expected:'4'}]);
  const text=frame(0,'3 \n')+frame(1,'4')+'{"complete":true}\n';
  for(const char of text)assert.equal(decoder.push(char),false);
  assert.deepEqual(decoder.finish(),{kind:'passed'});
  for(const data of ['{"complete":true}\n',frame(1,'3'),frame(0,'3')+frame(0,'3'),frame(0,'3')]){
    const invalid=new ContestFrames([{expected:'3'},{expected:'4'}]);assert.throws(()=>{invalid.push(data);invalid.finish();},/INVALID_HOST_FRAME/);
  }
});
test('wrong_output_stops_without_accepting_forged_or_trailing_credit',()=>{
  const wrong=new ContestFrames([{expected:'3'},{expected:'4'}]);
  assert.equal(wrong.push(frame(0,'{"complete":true}')+'{"complete":true}\n'),true);
  assert.deepEqual(wrong.finish(),{kind:'failed',reason:'assertion'});
  for(const data of ['{"case":0,"output":"%%%"}\n','{"case":0,"output":"Mw==","complete":true}\n',frame(0,'3')+'{"complete":true}\n'+frame(1,'4')]){
    const d=new ContestFrames([{expected:'3'}]);assert.throws(()=>{d.push(data);d.finish();},/INVALID_HOST_FRAME/);
  }
});
test('trusted_failure_frames_cannot_look_like_success',()=>{
  for(const reason of ['resource','timeout','syntax','assertion']){const d=new ContestFrames([{expected:'3'}]);d.push(JSON.stringify({failure:reason})+'\n');assert.deepEqual(d.finish(),{kind:'failed',reason});}
  const d=new ContestFrames([{expected:'3'}]);d.push('{"environmentError":"WASI_CONTEST_DRIVER_FAILED"}\n');assert.deepEqual(d.finish(),{kind:'environment-error',code:'WASI_CONTEST_DRIVER_FAILED'});
});
test('partial_eof_duplicate_terminal_unknown_fields_and_unbounded_lines_are_rejected',()=>{
  for(const data of [frame(0,'3')+'{"complete":true}',frame(0,'3')+'{"complete":true}\n{"complete":true}\n','{"failure":"unknown"}\n','{"environmentError":"other"}\n','{"case":0,"output":"Mx=="}\n','{"case":0,"output":"Mw==","extra":0}\n','[]\n','x'.repeat(3*1024*1024)]){
    const d=new ContestFrames([{expected:'3'}]);assert.throws(()=>{d.push(data);d.finish();},/INVALID_HOST_FRAME/);
  }
  const d=new ContestFrames([{expected:'3'}]);assert.equal(d.push(frame(0,'2')+'cut off during kill'),true);assert.equal(d.push('more teardown debris'),true);assert.deepEqual(d.finish(),{kind:'failed',reason:'assertion'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {captureUpstreamDiagnostic} from '../../src/host/upstream-error.ts';
import {timeoutFailure} from '../../src/jobs/timeout-policy.ts';

test('preserves structured HTTP evidence and the real connect timeout cause',()=>{
  const cause=Object.assign(Error('Connect Timeout Error (attempted address: private.example:443)'),{code:'UND_ERR_CONNECT_TIMEOUT'});
  const error=Object.assign(Error('fetch failed at https://private.example/?token=fixture-secret',{cause}),{
    status:504,headers:new Headers({'x-tt-logid':'0123456789abcdef0123456789abcdef','set-cookie':'session=fixture-secret'})
  });
  const upstream=captureUpstreamDiagnostic(error);
  assert.deepEqual(upstream,{codes:['UND_ERR_CONNECT_TIMEOUT'],httpStatus:504,requestId:'0123456789abcdef0123456789abcdef',
    detail:'fetch failed · Connect Timeout Error',detailFiltered:true});
  const reclassified=timeoutFailure({policy:'output-idle-v1',phase:'answer',observation:{timing:{firstOutputMs:42}},upstream});
  assert.equal(reclassified.code,'OBSERVED_OUTPUT_TIMEOUT');
  assert.equal(reclassified.retryable,false);
  assert.deepEqual(reclassified.upstream,upstream);
});

test('extracts only explicit fields from formatted provider errors',()=>{
  const message='502: {"ResponseMetadata":{"RequestId":"01234567-0123-0123-0123-0123456789ab","Error":{"Code":"BadGateway","Message":"Bad gateway from https://private.example/credential?api_key=fixture-secret"}}}';
  assert.deepEqual(captureUpstreamDiagnostic({code:'SERVER',message}),{codes:['SERVER','BadGateway'],httpStatus:502,statusFromMessage:true,
    requestId:'01234567-0123-0123-0123-0123456789ab',detail:'Bad gateway',detailFiltered:true});
  assert.deepEqual(captureUpstreamDiagnostic('Error 502 Bad Gateway (request ID: req_fixture_example_123)'),{
    httpStatus:502,statusFromMessage:true,requestId:'req_fixture_example_123',detail:'Bad Gateway',detailFiltered:true
  });
  assert.equal(captureUpstreamDiagnostic('502 {"error":{"code":"BadGateway"}} (request ID: req_fixture_example_123)')?.requestId,
    'req_fixture_example_123');
  const echo='400 Invalid request. request body: prompt: Request ID: req_PRIVATE_PAYLOAD_12345678';
  assert.equal(captureUpstreamDiagnostic(echo)?.requestId,undefined);
  assert.deepEqual(captureUpstreamDiagnostic({code:'TIMEOUT',message:'timeout at https://private.example/secret'}),{
    codes:['TIMEOUT'],detailFiltered:true
  });
});

test('keeps known provider finish reasons and rejects untrusted prose',()=>{
  assert.deepEqual(captureUpstreamDiagnostic({code:'PI_AI_ERROR',message:'Provider finish_reason: content_filter'}),{
    codes:['PI_AI_ERROR'],finishReason:'content_filter',detailFiltered:true,
  });
  assert.equal(captureUpstreamDiagnostic({message:'Provider finish_reason: network_error'})?.finishReason,'network_error');
  assert.equal(captureUpstreamDiagnostic({error:{finish_reason:'network_error'}})?.finishReason,'network_error');
  for(const message of ['Request prompt: Provider finish_reason: content_filter',
    'Provider finish_reason: network_error\nAuthorization: fixture-secret','Provider finish_reason: fixture-secret']){
    assert.deepEqual(captureUpstreamDiagnostic({code:'PI_AI_ERROR',message}),{codes:['PI_AI_ERROR'],detailFiltered:true});
  }
});

test('unknown data, unrelated IDs, getters, stacks and large bodies never enter history',()=>{
  const input={code:'UND_ERR_SECRET_CREDENTIAL',type:'UnknownClientSecret',requestId:'sk-fake-private-key',id:'req_unrelated_id_123',
    message:'Bearer fixture-secret, Cookie: private-session, https://private.example/CREDENTIAL, prompt: copy this text',
    stack:'fixture-private-stack',headers:{authorization:'private-authorization'},cause:{}};
  input.cause=input;
  Object.defineProperty(input,'status',{get(){assert.fail('read untrusted getter');}});
  assert.deepEqual(captureUpstreamDiagnostic(input),{detailFiltered:true});
  assert.deepEqual(captureUpstreamDiagnostic({status:502,message:'x'.repeat(17_000)+' UND_ERR_CONNECT_TIMEOUT'}),{
    httpStatus:502,detailFiltered:true
  });
  assert.equal(captureUpstreamDiagnostic(undefined),undefined);
});

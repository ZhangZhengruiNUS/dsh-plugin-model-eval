/** Explicit developer reference execution chain; changing any file invalidates this snapshot. */
export const REQUIRED_EXECUTION_FILES:readonly string[]=[
  'scripts/verify-contest-adaptation.mjs','scripts/verify-tier-runtime.mjs','scripts/verify-runtime.mjs',
  'src/runtime/contest-runner.ts','src/runtime/contest-frames.ts','src/runtime/runner.ts','src/runtime/values.ts',
  'src/runtime/rule-grader.ts','src/runtime/integrity.ts','src/runtime/pins.ts','src/runtime/contest-pin.ts','src/runtime/contest-cache-pin.ts',
  'src/evaluation/numeric-answer.ts','src/evaluation/grade-general.ts','src/evaluation/protocol-identity.ts',
  'tests/fixtures/find-zero-reference.py',
  'resources/runtime/contest/execute_contest_wasi.py','resources/runtime/contest/runtime.json',
  'resources/runtime/contest-cache/runtime.json','resources/runtime/wasi/runtime.json',
  'resources/runtime/code-host/runtime.json','resources/runtime/rules/runtime.json'
];
export function assertExecutionIdentities(snapshot:{schemaVersion:number;files:readonly {path:string;sha256:string}[]},actual:Readonly<Record<string,string>>):void{
  if(snapshot.schemaVersion!==1||snapshot.files.length!==REQUIRED_EXECUTION_FILES.length||new Set(snapshot.files.map(f=>f.path)).size!==REQUIRED_EXECUTION_FILES.length||REQUIRED_EXECUTION_FILES.some(path=>!snapshot.files.some(f=>f.path===path)))throw Error('EXECUTION_IDENTITY_INCOMPLETE');
  for(const file of snapshot.files)if(!/^[a-f0-9]{64}$/.test(file.sha256)||actual[file.path]!==file.sha256)throw Error('EXECUTION_IMPLEMENTATION_CHANGED:'+file.path);
}

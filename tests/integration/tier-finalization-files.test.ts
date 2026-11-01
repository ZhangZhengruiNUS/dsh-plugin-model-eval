import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,access,mkdir,symlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {withTempRoot} from '../support/temp.ts';
import {commitFileSet,recoverFileSet} from '../../scripts/support/file-set-transaction.ts';

test('finalization_recovers_every_rename_failure_without_leaving_half_a_catalog',async()=>{
  for(let failure=0;failure<4;failure++)await withTempRoot(async root=>{
    const paths=['questions','registry','pin','evidence'].map(x=>join(root,x)),journal=join(root,'journal.json');
    await writeFile(paths[1]!,'old-registry');await writeFile(paths[2]!,'old-pin');
    const changes=paths.map((path,i)=>({path,bytes:Buffer.from('new-'+i)}));
    await assert.rejects(commitFileSet(root,journal,changes,{afterStep:index=>{if(index===failure)throw Error('INJECTED_WRITE_FAILURE');}}),/INJECTED_WRITE_FAILURE/);
    assert.equal(await readFile(paths[1]!,'utf8'),'old-registry');assert.equal(await readFile(paths[2]!,'utf8'),'old-pin');
    for(const index of [0,3])await assert.rejects(access(paths[index]!));
    await commitFileSet(root,journal,changes);
    for(let i=0;i<4;i++)assert.equal(await readFile(paths[i]!,'utf8'),'new-'+i);
  });
});

test('finalization_rejects_linked_destinations_before_replacing_any_existing_file',async()=>{
  await withTempRoot(async parent=>{
    const root=join(parent,'workspace'),outside=join(parent,'outside');await mkdir(root);await mkdir(outside);
    await writeFile(join(outside,'protected'),'keep');await symlink(outside,join(root,'linked'),'junction');
    await assert.rejects(commitFileSet(root,join(root,'journal.json'),[{path:join(root,'linked','protected'),bytes:Buffer.from('replace')}]),/FILESET_LINK_REJECTED/);
    assert.equal(await readFile(join(outside,'protected'),'utf8'),'keep');
    await assert.rejects(access(join(root,'journal.json')));
  });
});

test('durable_journal_recovers_after_process_exit_and_refuses_unrelated_edits',async()=>{
  await withTempRoot(async root=>{
    const paths=['questions','registry','pin','evidence'].map(x=>join(root,x)),journal=join(root,'journal.json');
    await writeFile(paths[1]!,'old-registry');await writeFile(paths[2]!,'old-pin');
    const module=pathToFileURL(resolve('scripts/support/file-set-transaction.ts')).href;
    const code=`import {commitFileSet} from ${JSON.stringify(module)};await commitFileSet(${JSON.stringify(root)},${JSON.stringify(journal)},${JSON.stringify(paths)}.map((path,i)=>({path,bytes:Buffer.from('new-'+i)})),{afterStep:i=>{if(i===1)process.exit(23)}});`;
    const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',code],{encoding:'utf8',windowsHide:true});assert.equal(child.status,23,child.stderr);
    assert.equal(await readFile(paths[1]!,'utf8'),'new-1');assert.equal(await readFile(paths[2]!,'utf8'),'old-pin');
    await writeFile(paths[2]!,'unrelated-user-edit');
    await assert.rejects(recoverFileSet(root,journal,paths),/FILESET_UNEXPECTED_CONTENT/);
    assert.equal(await readFile(paths[1]!,'utf8'),'new-1','preflight checks every path before any recovery write');
    assert.equal(await readFile(paths[2]!,'utf8'),'unrelated-user-edit');
    await writeFile(paths[2]!,'old-pin'); // Restore this test fixture only, then recover from the real journal.
    await recoverFileSet(root,journal,paths);
    assert.equal(await readFile(paths[1]!,'utf8'),'old-registry');assert.equal(await readFile(paths[2]!,'utf8'),'old-pin');
    for(const index of [0,3])await assert.rejects(access(paths[index]!));
  });
});

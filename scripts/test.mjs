import {readdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';
const [group,...args]=process.argv.slice(2),folders=group==='all'?['unit','integration']:[group];
const files=args.length?args:folders.flatMap(folder=>readdirSync(`tests/${folder}`).filter(x=>x.endsWith('.test.ts')).map(x=>`tests/${folder}/${x}`));
const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1',...files],{stdio:'inherit',windowsHide:true});process.exitCode=result.status??1;

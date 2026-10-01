import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const source='scripts/engineering-runner.mjs';
const task=process.argv[2];
if(task==='build'){
  fs.mkdirSync('build',{recursive:true});
  const file='build/claims.bundle.mjs';
  fs.writeFileSync(file,`// verified source snapshot ${request.runId}\n${fs.readFileSync('src/claims.mjs','utf8')}`);
  console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source,artifact:{path:file,sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex')}}));
}else if(task==='unit'){
  const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
  const result=spawnSync(process.execPath,['--test','--test-reporter=tap',path.join('tests','claims.test.mjs')],{encoding:'utf8',windowsHide:true,env:childEnv});
  const count=name=>Number(new RegExp(`^# ${name} (\\d+)$`,'m').exec(result.stdout)?.[1]);
  const counts={total:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped')};
  if(Object.values(counts).some(value=>!Number.isInteger(value)))throw new Error(result.stdout+result.stderr);
  console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source,...counts}));
}else throw new Error(`Unknown task: ${task}`);

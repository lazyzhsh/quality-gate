import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {git,project} from './change-scope-helpers.mjs';

test('Git scope compares requested paths with tracked and untracked changes',t=>{
 const f=project(t);fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 let result=run(f.root);assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.overScope,['scope.json']);
 f.spec.allowedPaths.push('scope.json');f.save();result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.files.some(x=>x.path==='src/app.mjs'),true);
 fs.writeFileSync(path.join(f.root,'README.md'),'unexpected\n');result=run(f.root);
 assert.equal(result.status,'FAIL');assert.deepEqual(result.evidence[0].details.overScope,['README.md']);
});

test('protected dependency change requires explicit acknowledgement',t=>{
 const f=project(t);f.spec.allowedPaths.push('scope.json','package.json');f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');fs.writeFileSync(path.join(f.root,'package.json'),'{}');
 let result=run(f.root);assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.unacknowledgedProtected,[{path:'package.json',ruleId:'dependency',reason:'not-acknowledged'}]);
 f.spec.protectedPaths[0].acknowledged=true;f.save();result=run(f.root);assert.equal(result.status,'PASS');
});

test('missing required scope and invalid Git baseline fail closed',t=>{
 const f=project(t);f.spec.allowedPaths.push('scope.json');f.save();
 let result=run(f.root);assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.missingRequired,['src/**']);
 f.spec.baseRef='not-a-ref';f.save();result=run(f.root);assert.equal(result.status,'ERROR');
});

test('acknowledgement binds to the Git baseline it was made against',t=>{
 const f=project(t);
 const head=git(f.root,'rev-parse','HEAD');
 f.spec.allowedPaths.push('scope.json','package.json');
 f.spec.protectedPaths[0].acknowledged=true;f.spec.protectedPaths[0].acknowledgedBase='0000000';f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');fs.writeFileSync(path.join(f.root,'package.json'),'{}');
 let result=run(f.root);
 assert.equal(result.status,'FAIL');
 assert.deepEqual(result.evidence[0].details.unacknowledgedProtected,[{path:'package.json',ruleId:'dependency',reason:'stale-base'}]);
 f.spec.protectedPaths[0].acknowledgedBase=head;f.save();result=run(f.root);
 assert.equal(result.status,'PASS');
 assert.equal(result.evidence[0].details.files.find(x=>x.path==='package.json').protected[0].effective,true);
});

test('file evidence records added, modified and deleted change types',t=>{
 const f=project(t);
 f.spec.allowedPaths.push('scope.json','**');f.save();
 fs.writeFileSync(path.join(f.root,'src','app.mjs'),'export const n=2;\n');
 fs.writeFileSync(path.join(f.root,'notes.txt'),'new\n');
 fs.rmSync(path.join(f.root,'README.md'));
 const details=run(f.root).evidence[0].details;
 const byPath=new Map(details.files.map(x=>[x.path,x.changeType]));
 assert.equal(byPath.get('src/app.mjs'),'M');
 assert.equal(byPath.get('notes.txt'),'A');
 assert.equal(byPath.get('README.md'),'D');
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
export function git(root,...args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();}
export function project(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-scope-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.email','test@example.invalid');git(root,'config','user.name','Test');
 fs.mkdirSync(path.join(root,'src'));fs.writeFileSync(path.join(root,'src','app.mjs'),'export const n=1;\n');
 fs.writeFileSync(path.join(root,'README.md'),'original\n');
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'Actual changes match requested scope'}],gates:[{id:'scope',kind:'change-scope',level:'L0',enabled:true,stages:['close'],claimId:'C0',file:'scope.json'}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 git(root,'add','.');git(root,'commit','-qm','baseline');
 const spec={baseRef:'HEAD',allowedPaths:['src/**'],requiredPaths:['src/**'],protectedPaths:[{id:'dependency',patterns:['package.json'],acknowledged:false}]};
 const save=()=>fs.writeFileSync(path.join(root,'scope.json'),JSON.stringify(spec));save();
 return {root,spec,save};
}

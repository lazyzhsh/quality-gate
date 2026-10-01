import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {leanFixture} from './fixture.mjs';
import {run} from '../lib/kernel.mjs';

const hook=fileURLToPath(new URL('../hooks/adapter.mjs',import.meta.url));
const hooksJson=fileURLToPath(new URL('../hooks/hooks.json',import.meta.url));
function invoke(input){const r=spawnSync(process.execPath,[hook],{input:JSON.stringify(input)+'\n',encoding:'utf8',windowsHide:true});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout);}

const register={taskId:'refund-cap',statement:'为退款增加可退余额上限校验',scope:['src/**'],createdAt:'2026-10-01T09:00:00.000Z',confirmedBy:'user'};
function armed(t,{configIntent}={}){
 const f=leanFixture(t);
 if(configIntent!==undefined){f.c.intent=configIntent;f.save();}
 fs.mkdirSync(path.join(f.root,'.quality-gate','registries'),{recursive:true});
 fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify(register));
 return f;
}

test('UserPromptSubmit injects the intent baseline line once a register exists',t=>{
 const f=armed(t);
 const out=invoke({cwd:f.root,hook_event_name:'UserPromptSubmit',prompt:'继续做退款上限'});
 assert.equal(out.hookSpecificOutput.hookEventName,'UserPromptSubmit');
 assert.match(out.hookSpecificOutput.additionalContext,/任务意图基准: refund-cap/);
 assert.match(out.hookSpecificOutput.additionalContext,/src\/\*\*/);
 assert.match(out.hookSpecificOutput.additionalContext,/--revise/);
});

test('UserPromptSubmit stays silent without a register (register-as-opt-in, OD-105)',t=>{
 const f=leanFixture(t);
 assert.deepEqual(invoke({cwd:f.root,hook_event_name:'UserPromptSubmit',prompt:'随便聊聊'}),{});
});

test('UserPromptSubmit capture guidance only when explicitly enabled',t=>{
 const f=leanFixture(t);
 assert.deepEqual(invoke({cwd:f.root,hook_event_name:'UserPromptSubmit',prompt:'开始做新功能'}),{});
 const g=armed(t,{configIntent:{capture:true}});
 fs.rmSync(path.join(g.root,'.quality-gate','registries','task-intent.json'));
 const out=invoke({cwd:g.root,hook_event_name:'UserPromptSubmit',prompt:'开始做新功能'});
 assert.match(out.hookSpecificOutput.additionalContext,/quality-gate-intent/);
});

test('intent.hooks:false silences the soft forms even with a register',t=>{
 const f=armed(t,{configIntent:{hooks:false}});
 assert.deepEqual(invoke({cwd:f.root,hook_event_name:'UserPromptSubmit',prompt:'继续'}),{});
 assert.deepEqual(invoke({cwd:f.root,hook_event_name:'PreToolUse',tool_name:'Write',tool_input:{file_path:path.join(f.root,'docs','x.md')}}),{});
});

test('PreToolUse softly warns when a Write target is outside the intent scope',t=>{
 const f=armed(t);
 const out=invoke({cwd:f.root,hook_event_name:'PreToolUse',tool_name:'Write',tool_input:{file_path:path.join(f.root,'docs','note.md')}});
 assert.match(out.systemMessage,/docs[\\/]note\.md/);
 assert.match(out.systemMessage,/refund-cap/);
 assert.match(out.systemMessage,/outside-task-scope/);
 assert.equal(out.decision,undefined);
 assert.equal(out.permissionDecision,undefined);
});

test('PreToolUse stays silent for in-scope writes, other tools and missing paths',t=>{
 const f=armed(t);
 const call=(name,toolInput)=>invoke({cwd:f.root,hook_event_name:'PreToolUse',tool_name:name,tool_input:toolInput});
 assert.deepEqual(call('Write',{file_path:path.join(f.root,'src','app.mjs')}),{});
 assert.match(call('Edit',{file_path:path.join(f.root,'docs','note.md')}).systemMessage,/docs[\\/]note\.md/);
 assert.deepEqual(call('Read',{file_path:path.join(f.root,'docs','note.md')}),{});
 assert.deepEqual(call('Write',{}),{});
});

test('a corrupt register makes the soft forms fail silently (never noisy, close still judges)',t=>{
 const f=armed(t);
 fs.writeFileSync(path.join(f.root,'.quality-gate','registries','task-intent.json'),JSON.stringify({taskId:'broken'}));
 assert.deepEqual(invoke({cwd:f.root,hook_event_name:'UserPromptSubmit',prompt:'继续'}),{});
 assert.deepEqual(invoke({cwd:f.root,hook_event_name:'PreToolUse',tool_name:'Write',tool_input:{file_path:path.join(f.root,'docs','note.md')}}),{});
});

test('hooks.json registers all four lifecycle events on the shared adapter',()=>{
 const h=JSON.parse(fs.readFileSync(hooksJson,'utf8'));
 assert.deepEqual(Object.keys(h.hooks).sort(),['PreToolUse','SessionStart','Stop','UserPromptSubmit']);
 for(const event of ['SessionStart','Stop','UserPromptSubmit','PreToolUse']){
  assert.equal(h.hooks[event][0].hooks[0].command,'node');
  assert.match(h.hooks[event][0].hooks[0].args[0],/adapter\.mjs$/);
 }
});

test('kernel validate accepts the intent block and rejects bad shapes',t=>{
 const f=armed(t,{configIntent:{capture:true}});
 assert.equal(run(f.root,'close').status,'PASS');
 f.c.intent={capture:'yes'};f.save();
 assert.equal(run(f.root,'close').status,'ERROR');
 f.c.intent={unknown:true};f.save();
 assert.equal(run(f.root,'close').status,'ERROR');
});

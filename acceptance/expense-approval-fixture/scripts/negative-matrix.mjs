import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository=path.resolve(project,'..','..');
const qgate=process.env.QGATE_CLI||path.join(repository,'plugins','quality-gate','bin','qgate.mjs');
const registries='.quality-gate/registries';
// 逐门禁负例：每例在临时副本注入一个真实缺陷，断言目标门禁 FAIL 且整体退出码 1（不要求其他门禁同时失败）
const mutations=[
  {gate:'rtm',kind:'traceability',domain:'L0',description:'AC-01 source link points to a missing file',apply:root=>editJson(root,`${registries}/requirements.json`,doc=>{doc.requirements[0].acceptanceCriteria[0].codeFiles[0]='src/missing.mjs';})},
  {gate:'rtm',kind:'traceability',domain:'L0',description:'AC-02 case binding names a case the run never reports (acCaseMissing)',apply:root=>editJson(root,`${registries}/requirements.json`,doc=>{const ac=doc.requirements[0].acceptanceCriteria.find(a=>a.id==='AC-02');ac.cases[0].caseIds[0]='never-reported';})},
  {gate:'design-decisions',kind:'decisions',domain:'L0',description:'Reopen resolved decision D-01',apply:root=>editJson(root,`${registries}/decisions.json`,doc=>{doc.decisions[0].status='open';})},
  {gate:'syntax',kind:'command',domain:'L1',description:'Break source syntax with an unclosed paren',apply:root=>append(root,'src/claims.mjs','\nconst broken = (;\n')},
  {gate:'engineering',kind:'engineering',domain:'L1',description:'Accept zero amount by weakening validation (unit F2P fails)',apply:root=>replace(root,'src/claims.mjs','input.amountCents <= 0','input.amountCents < 0')},
  {gate:'profile',kind:'semantic-profile',domain:'L2',description:'Golden record currency violates allowedValues CNY',apply:root=>editJson(root,`${registries}/records.json`,doc=>{doc.records[0].properties.currency='USD';})},
  {gate:'ledger-invariant',kind:'invariant',domain:'L2',description:'Persist a one-cent credit shortfall',apply:root=>replace(root,'src/claims.mjs',"{side: 'credit', amountCents: claim.amountCents}","{side: 'credit', amountCents: claim.amountCents-1}")},
  {gate:'behavior',kind:'behavior',domain:'L3',description:'Remove self-approval guard',apply:root=>replace(root,'src/claims.mjs','actor.id === claim.employeeId','false')},
  {gate:'metrics',kind:'metrics',domain:'L4',description:'Introduce one eval occurrence (threshold max 0)',apply:root=>append(root,'src/claims.mjs',"\nif (globalThis.__never) eval('1');\n")},
  {gate:'api-authz',kind:'scan',domain:'L4',description:'Drop security declaration from POST /claims',apply:root=>editJson(root,'openapi.json',doc=>{doc.paths['/claims'].post.security=[];})},
  {gate:'timeout-budget',kind:'budget',domain:'L4',description:'Lower caller budget below required 1600 ms',apply:root=>editJson(root,`${registries}/budget.json`,doc=>{doc.budgets['claim-api']=1000;})},
  {gate:'rerun-evidence',kind:'rerun',domain:'L4',description:'Tamper the second run hash (outputDivergence)',apply:root=>editJson(root,`${registries}/rerun.json`,doc=>{doc.jobs[0].runs[1].outputSha256=doc.jobs[0].runs[1].outputSha256.replace(/^6/,'7');})},
  {gate:'rollback-drill',kind:'command',domain:'L5',description:'Sabotage the rollback comparison to always throw',apply:root=>replace(root,'scripts/rollback-drill.mjs','!fs.readFileSync(file).equals(before)','true')},
  {gate:'technical-debt',kind:'debt',domain:'L5',description:'Move known debt item into overdue',apply:root=>editJson(root,`${registries}/debt.json`,doc=>{doc.items[0].dueDate='2020-01-01';})}
];
function replace(root,file,before,after){const target=path.join(root,file);const text=fs.readFileSync(target,'utf8');if(!text.includes(before))throw new Error(`Missing mutation target: ${before}`);fs.writeFileSync(target,text.replace(before,after));}
function append(root,file,extra){fs.appendFileSync(path.join(root,file),extra);}
function editJson(root,file,mutate){const target=path.join(root,file);const doc=JSON.parse(fs.readFileSync(target,'utf8'));mutate(doc);fs.writeFileSync(target,JSON.stringify(doc,null,2));}
const pluginVersion=process.env.QGATE_CLI?JSON.parse(fs.readFileSync(path.join(process.env.QGATE_CLI,'..','..','.zcode-plugin','plugin.json'),'utf8')).version:JSON.parse(fs.readFileSync(path.join(repository,'marketplace.json'),'utf8')).plugins[0].version;
const results=[];
for(const mutation of mutations){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'expense-qgate-negative-'));
  try{
    fs.cpSync(project,dir,{recursive:true,filter:source=>{
      const relative=path.relative(project,source).replaceAll('\\','/');
      return relative!=='build'&&relative!=='.quality-gate/runs';
    }});
    mutation.apply(dir);
    const run=spawnSync(process.execPath,[qgate,dir,'close'],{cwd:repository,encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:4_000_000});
    if(run.error)throw run.error;
    const report=JSON.parse(run.stdout);
    const evidence=report.evidence.find(item=>item.gateId===mutation.gate);
    const failedGates=report.evidence.filter(item=>item.status==='FAIL').map(item=>item.gateId);
    const entry={domain:mutation.domain,gate:mutation.gate,kind:mutation.kind,description:mutation.description,exitCode:run.status,overall:report.status,gateStatus:evidence?.status,failedGates,erroredGates:report.evidence.filter(item=>item.status==='ERROR').map(item=>item.gateId),reportId:report.id};
    // 语法级缺陷会级联（import 崩溃→关联门禁 ERROR/FAIL，fail-closed）：断言目标门禁 FAIL、退出非零、整体非 PASS
    if(run.status===0||report.status==='PASS'||evidence?.status!=='FAIL')throw new Error(`Negative case failed to detect ${mutation.gate}: ${JSON.stringify(entry)}`);
    results.push(entry);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify({schemaVersion:'0.1',project,pluginVersion,cases:results,summary:{gates:mutations.length,allDetected:true}},null,2));
console.error(`负例矩阵 ${mutations.length}/${mutations.length} 全部检出（目标门禁 FAIL、退出非零、整体非 PASS；语法级缺陷按 fail-closed 级联，见各例 failedGates/erroredGates）；插件版本 ${pluginVersion}。`);

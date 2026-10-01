import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseRawOutput} from '../lib/raw-evidence.mjs';
import {run} from '../lib/kernel.mjs';

const adaptersDir=fileURLToPath(new URL('../adapters/',import.meta.url));
const tempProject=t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-adapters-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 return root;
};
const runIdEcho='11111111-2222-3333-4444-555555555555';

test('python reference runner round-trips pytest junitxml through kernel parsing',t=>{
 // 本机无 pytest 时跳过（安装指引：https://docs.pytest.org/en/stable/getting-started/）
 const probe=spawnSync('python',['-m','pytest','--version'],{encoding:'utf8',windowsHide:true});
 if(probe.status!==0)return t.skip(`pytest not installed (probe exit ${probe.status}); install guidance: python -m pip install pytest`);
 const root=tempProject(t);
 fs.copyFileSync(path.join(adaptersDir,'python','test_sample.py'),path.join(root,'test_sample.py'));
 // 真实用法：argv 指向插件树内的 runner 原位执行，cwd=项目根；stdin 请求 → stdout 观察 JSON
 //（回显 runId），退出码恒 0（含失败用例）
 const result=spawnSync('python',[path.join(adaptersDir,'python','unit_runner.py'),'test_sample.py'],{cwd:root,input:JSON.stringify({schemaVersion:'0.1',runId:runIdEcho,checkId:'unit'})+'\n',encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,`runner stderr: ${result.stderr}`);
 const observation=JSON.parse(result.stdout);
 assert.equal(observation.runId,runIdEcho);
 assert.deepEqual([observation.total,observation.passed,observation.failed,observation.skipped],[4,2,1,1]);
 assert.deepEqual(observation.rawOutput,{format:'junit',file:'build/qgate-junit.xml'});
 // 内核侧独立解析同一文件并交叉核验（B1 语义）
 const parsed=parseRawOutput('junit',fs.readFileSync(path.join(root,'build','qgate-junit.xml'),'utf8'));
 assert.deepEqual([parsed.total,parsed.passed,parsed.failed,parsed.skipped],[4,2,1,1]);
 assert.equal(parsed.cases.find(item=>item.name==='test_sample.test_cap_enforcement').status,'failed');
});

test('java merge runner aggregates surefire reports and self-verifies via kernel parser',t=>{
 const root=tempProject(t);
 fs.cpSync(path.join(adaptersDir,'java','sample-reports'),path.join(root,'sample-reports'),{recursive:true});
 // 真实用法：argv 指向插件树内 runner 原位执行（脚本自插件 lib/ 导入解析器），cwd=项目根
 const result=spawnSync(process.execPath,[path.join(adaptersDir,'java','merge-junit.mjs'),'sample-reports'],{cwd:root,input:JSON.stringify({schemaVersion:'0.1',runId:runIdEcho,checkId:'unit'})+'\n',encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,`runner stderr: ${result.stderr}`);
 const observation=JSON.parse(result.stdout);
 assert.equal(observation.runId,runIdEcho);
 assert.deepEqual([observation.total,observation.passed,observation.failed,observation.skipped],[5,3,1,1]);
 assert.deepEqual(observation.rawOutput,{format:'junit',file:'build/qgate-junit-merged.xml'});
 // 内核侧独立解析合并文件（跨 testsuite 求和）并交叉核验
 const parsed=parseRawOutput('junit',fs.readFileSync(path.join(root,'build','qgate-junit-merged.xml'),'utf8'));
 assert.deepEqual([parsed.total,parsed.passed,parsed.failed,parsed.skipped],[5,3,1,1]);
 assert.equal(parsed.cases.find(item=>item.name==='com.example.SettlementBatchTest.testCapEnforcement').status,'failed');
 assert.equal(parsed.cases.find(item=>item.name==='com.example.SettlementBatchTest.testIdempotentReplay').status,'skipped');
});

test('merge runner fails closed on report dirs without TEST-*.xml',t=>{
 const root=tempProject(t);
 fs.mkdirSync(path.join(root,'empty-reports'));
 const result=spawnSync(process.execPath,[path.join(adaptersDir,'java','merge-junit.mjs'),'empty-reports'],{cwd:root,input:JSON.stringify({runId:runIdEcho})+'\n',encoding:'utf8',windowsHide:true});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/no TEST-\*\.xml reports/);
});

test('python ORM persistence reference satisfies E3 snapshot protocol via kernel gate',t=>{
 // 本机无 SQLAlchemy 时跳过（安装指引：python -m pip install sqlalchemy）
 const probe=spawnSync('python',['-c','import sqlalchemy'],{encoding:'utf8',windowsHide:true});
 if(probe.status!==0)return t.skip(`sqlalchemy not installed; install guidance: python -m pip install sqlalchemy`);
 const root=tempProject(t);
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify({
  schemaVersion:'0.2',
  claims:[{id:'C1',statement:'ORM persistence verified via independent readback'}],
  gates:[{id:'pay',kind:'persistence',level:'L2',enabled:true,stages:['close'],claimId:'C1',timeoutMs:20000,
   expectedHttpStatus:201,correlationField:'id',
   expected:{id:'$RUN_ID',amount:12500,currency:'USD',note:'orm reference'},
   argv:['python',path.join(adaptersDir,'python','persistence_orm.py')]}],
  risks:[],exceptions:[]}));
 const result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence[0],null,1));
 const details=result.evidence[0].details;
 assert.equal(details.persistenceSource.includes('SQLAlchemy'),true);
 assert.equal(details.recordCount,1);
 assert.equal(details.requireSnapshots,true);
 assert.equal(details.snapshots.before.recordCount,0);
 assert.deepEqual(details.snapshots.delta.map(item=>item.field),['amount','currency','id','note']);
 assert.equal(result.evidence[0].details.fields.every(field=>field.status==='PASS'),true);
});

// 浏览器截图参考 runner（v1.13 T4）：无浏览器环境 skip 带安装指引（不入烟测集合的原因）。
// 正例经真实内核 visual 门禁全链路：同机 pin 基线 → close PASS（字节一致）→ 页面变更 FAIL。
const browserDemo=fileURLToPath(new URL('../examples/visual-browser-demo/',import.meta.url));
import {findBrowser} from '../adapters/visual/screenshot.mjs';

test('browser screenshot runner exits 2 with install guidance when no browser resolves',()=>{
 const result=spawnSync(process.execPath,[path.join(adaptersDir,'visual','screenshot.mjs')],{
  cwd:browserDemo,encoding:'utf8',
  input:JSON.stringify({schemaVersion:'0.1',runId:runIdEcho})+'\n',
  env:{...process.env,QGATE_BROWSER:path.join('Z:','nonexistent','browser.exe')},
  windowsHide:true
 });
 assert.equal(result.status,2);
 assert.match(result.stderr,/QGATE_BROWSER|未找到系统浏览器/);
 assert.match(result.stderr,/chrome\.com|microsoft\.com\/edge/);
});

test('browser screenshot reference passes the kernel visual gate byte-exact and fails on page change',t=>{
 const browser=findBrowser();
 if(!browser)return t.skip('no system browser found; install guidance: https://www.google.com/chrome/ or https://www.microsoft.com/edge (or set QGATE_BROWSER)');
 const root=tempProject(t);
 fs.cpSync(browserDemo,root,{recursive:true});
 fs.rmSync(path.join(root,'.quality-gate'),{recursive:true,force:true});
 fs.rmSync(path.join(root,'build'),{recursive:true,force:true});
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].argv[1]=path.join(adaptersDir,'visual','screenshot.mjs');
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 // 同机 pin 基线（参考 scripts/pin-baseline.mjs 的路径）
 const pin=spawnSync(process.execPath,[path.join(adaptersDir,'visual','screenshot.mjs')],{
  cwd:root,encoding:'utf8',
  input:JSON.stringify({schemaVersion:'0.1',runId:'pin'})+'\n',windowsHide:true
 });
 assert.equal(pin.status,0,pin.stderr);
 fs.copyFileSync(path.join(root,JSON.parse(pin.stdout).actualFile),path.join(root,'baseline.png'));
 let result=run(root);
 assert.equal(result.status,'PASS',JSON.stringify(result.evidence.map(e=>e.details)));
 assert.equal(result.evidence[0].details.comparison,'exact-bytes');
 assert.match(result.evidence[0].details.source,/browser-headless-cli:/);
 // 负例：页面渲染面变更后字节比较 FAIL 指名
 fs.writeFileSync(path.join(root,'page.html'),fs.readFileSync(path.join(root,'page.html'),'utf8').replace('#4a90d9','#4a90d8'));
 result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].status,'FAIL');
});

// consumer-usage 适配器（v1.13 T5）：Pact 归一与调用面扫描的纯函数 + CLI 反例。
import {pactToUsage} from '../adapters/consumer-usage/pact-normalize.mjs';
import {scanUsage} from '../adapters/consumer-usage/scan-usage.mjs';

test('pact-normalize turns a pact artifact into contract-test usage with dedupe and query strip',()=>{
 const entry=pactToUsage({consumer:{name:'orders-web'},provider:{name:'payment-api'},interactions:[
  {request:{method:'post',path:'/payments'}},
  {request:{method:'POST',path:'/payments'}},
  {request:{method:'GET',path:'/payments?page=2'}}
 ]});
 assert.deepEqual(entry,{consumer:'orders-web',usage:'contract-test',items:[{path:'/payments',method:'POST'},{path:'/payments',method:'GET'}]});
});
test('pact-normalize fails closed on malformed pact artifacts',()=>{
 assert.throws(()=>pactToUsage({provider:{name:'p'}}),/consumer\.name/);
 assert.throws(()=>pactToUsage({consumer:{name:'c'},interactions:[]}),/no interactions/);
 assert.throws(()=>pactToUsage({consumer:{name:'c'},interactions:[{request:{method:'GET'}}]}),/method\/path/);
 assert.throws(()=>pactToUsage({consumer:{name:'c'},interactions:[{request:{method:'GET',path:'payments'}}]}),/must start with \//);
});
test('pact-normalize extracts request body field paths as field-level usage (v1.15)',()=>{
 // 平铺字段 + 嵌套点连接 + 数组取元素字段 + 跨 interaction 字段并集去重；非对象 body 只产端点条目
 const entry=pactToUsage({consumer:{name:'orders-web'},interactions:[
  {request:{method:'POST',path:'/payments',body:{amount:100,currency:'USD'}}},
  {request:{method:'POST',path:'/payments',body:{amount:250,currency:'EUR',refundFirst:true,metadata:{idempotencyKey:'k'},lines:[{sku:'a',qty:1}]}}}
 ]});
 assert.deepEqual(entry.items,[
  {path:'/payments',method:'POST'},
  {path:'/payments',method:'POST',field:'amount'},
  {path:'/payments',method:'POST',field:'currency'},
  {path:'/payments',method:'POST',field:'lines.qty'},
  {path:'/payments',method:'POST',field:'lines.sku'},
  {path:'/payments',method:'POST',field:'metadata.idempotencyKey'},
  {path:'/payments',method:'POST',field:'refundFirst'}
 ]);
 // 字符串 body 与缺失 body 只产端点条目；深度超过 4 层不虚构截断叶子（第 4 层为对象时
 // 不再下钻，仅同级真实叶子入列——如实截断，不虚报深层）
 const shallow=pactToUsage({consumer:{name:'c'},interactions:[
  {request:{method:'POST',path:'/x',body:'raw-string'}},
  {request:{method:'GET',path:'/y'}},
  {request:{method:'PUT',path:'/z',body:{a:{b:{c:{deep:{e:1},leaf:7}}}}}}
 ]});
 assert.deepEqual(shallow.items,[
  {path:'/x',method:'POST'},
  {path:'/y',method:'GET'},
  {path:'/z',method:'PUT'},
  {path:'/z',method:'PUT',field:'a.b.c.leaf'}
 ]);
});
test('scan-usage extracts fetch and axios call surfaces with method detection and origin strip',()=>{
 const source=[
  "const a=await fetch('/orders',{method:'POST'});",
  "const b=await fetch(`https://api.example.com/payments`);",
  "const c=axios.get('/refunds');",
  "const d=axios('/settlements',{method:'delete'});",
  "const e=await fetch('data:application/json,{}');"
 ].join('\n');
 const entry=scanUsage([source],{consumer:'orders-cli'});
 assert.deepEqual(entry,{consumer:'orders-cli',usage:'scanned',items:[
  {path:'/orders',method:'POST'},
  {path:'/payments',method:'GET'},
  {path:'/refunds',method:'GET'},
  {path:'/settlements',method:'DELETE'}
 ]});
});
test('scan-usage CLI walks directories and fails closed without sources or consumer',t=>{
 const root=tempProject(t);
 fs.mkdirSync(path.join(root,'src'),{recursive:true});
 fs.writeFileSync(path.join(root,'src','client.ts'),"export const go=()=>fetch('/health',{method:'HEAD'});\n");
 const ok=spawnSync(process.execPath,[path.join(adaptersDir,'consumer-usage','scan-usage.mjs'),'--consumer','orders-cli',path.join(root,'src')],{encoding:'utf8',windowsHide:true});
 assert.equal(ok.status,0,ok.stderr);
 assert.deepEqual(JSON.parse(ok.stdout),{consumer:'orders-cli',usage:'scanned',items:[{path:'/health',method:'HEAD'}]});
 const noConsumer=spawnSync(process.execPath,[path.join(adaptersDir,'consumer-usage','scan-usage.mjs'),path.join(root,'src')],{encoding:'utf8',windowsHide:true});
 assert.notEqual(noConsumer.status,0);
 assert.match(noConsumer.stderr,/--consumer/);
 const empty=spawnSync(process.execPath,[path.join(adaptersDir,'consumer-usage','scan-usage.mjs'),'--consumer','x',path.join(root,'empty-dir-does-not-exist')],{encoding:'utf8',windowsHide:true});
 assert.notEqual(empty.status,0);
});
test('scan-usage recognizes python, go and java call shapes (v1.15)',t=>{
 const sources=[
  // python：requests/httpx 动词形状（f-string 动态 URL 如实漏过）
  "import requests, httpx\nr1=requests.post('https://api.example.com/payments', json=payload)\nr2=requests.get('/payments?status=paid')\nr3=httpx.put('/refunds')\nr4=requests.get(f'{BASE}/settlements')\n",
  // go：http.Get/Post 与 http.NewRequest(http.MethodX, url)
  "package main\nimport \"net/http\"\nfunc main(){\n a,_:=http.Get(\"https://api.example.com/payments\")\n b,_:=http.Post(\"/refunds\", \"application/json\", body)\n req,_:=http.NewRequest(http.MethodDelete, \"/settlements\", nil)\n _=a;_=b;_=req\n}\n",
  // java：RestTemplate getXxxForEntity/postForObject 与 OkHttp builder 链
  "class C { void run() {\n var a=restTemplate.getForEntity(\"/payments\", String.class);\n var b=restTemplate.postForObject(\"https://api.example.com/refunds\", req, String.class);\n var c=new Request.Builder().url(\"/settlements\").delete().build();\n}}"
 ].join('\n');
 const entry=scanUsage([sources],{consumer:'polyglot'});
 assert.deepEqual(entry.items,[
  {path:'/payments',method:'POST'},
  {path:'/payments',method:'GET'},
  {path:'/refunds',method:'PUT'},
  {path:'/refunds',method:'POST'},
  {path:'/settlements',method:'DELETE'}
 ]);
 // CLI 目录递归含新扩展名（.py/.go/.java）
 const root=tempProject(t);
 fs.mkdirSync(path.join(root,'py'),{recursive:true});
 fs.writeFileSync(path.join(root,'py','client.py'),"import requests\ndef go():\n return requests.get('/health')\n");
 const ok=spawnSync(process.execPath,[path.join(adaptersDir,'consumer-usage','scan-usage.mjs'),'--consumer','x',path.join(root,'py')],{encoding:'utf8',windowsHide:true});
 assert.equal(ok.status,0,ok.stderr);
 assert.deepEqual(JSON.parse(ok.stdout).items,[{path:'/health',method:'GET'}]);
});

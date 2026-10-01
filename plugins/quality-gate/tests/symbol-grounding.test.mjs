import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run} from '../lib/kernel.mjs';
import {failureReasons} from '../lib/summary.mjs';
import {extractImports,resolveSpecifier,prepareSource,enumerateExports,extractEndpointReferences,extractConfigKeyReferences,preparePythonSource,extractForeignImports} from '../lib/symbol-grounding.mjs';
import {git} from './change-scope-helpers.mjs';

const specifiers=source=>extractImports(source).imports.map(entry=>entry.specifier).sort();

test('lexical extraction recognizes the four static specifier forms with line numbers',()=>{
 const source=[
  "import fs from 'node:fs';",
  "import 'side-effect.css';",
  "import {x} from './local.mjs';",
  "export {y} from './other.mjs';",
  "const cfg=require('./config.json');",
  "const lazy=await import('./lazy.mjs');",
  "import {x as z} from './local.mjs';"
 ].join('\n');
 const imports=extractImports(source).imports;
 assert.deepEqual(imports.map(entry=>entry.specifier).sort(),['./config.json','./lazy.mjs','./local.mjs','./other.mjs','node:fs','side-effect.css']);
 assert.deepEqual(imports.find(entry=>entry.specifier==='./local.mjs').lines,[3,7]);
});

test('string and comment contents are never mistaken for imports',()=>{
 const source=[
  'const sql="select from \'users\' where x=1";',
  '// import ghost from \'ghost.mjs\';',
  '/* export {y} from \'blocked.mjs\'; */',
  'const tpl=`import \'tpl.mjs\'`;',
  "import fs from 'node:fs';"
 ].join('\n');
 assert.deepEqual(specifiers(source),['node:fs']);
});

test('dynamic specifiers are counted as uncovered, not silently ignored',()=>{
 const {imports,dynamicForms}=extractImports([
  'const a=require(name);',
  'const b=await import(path);',
  "const c=await import(`./dyn-${x}.mjs`);",
  'const s="require(ghost)";'
 ].join('\n'));
 assert.equal(imports.length,0);
 assert.equal(dynamicForms,3);
});

test('prepareSource keeps both variants length-aligned for position checks',()=>{
 const {code,masked}=prepareSource("const s='abc'; /* c */ import x from 'mod';");
 assert.equal(code.length,masked.length);
 assert.match(code,/import x from 'mod'/);
 assert.equal(masked.replace(/['"`\s]/g,'').length>0,true);
});

test('resolution classifies project modules with Node-style completion',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-ground-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'src','utils'),{recursive:true});
 fs.writeFileSync(path.join(root,'src','utils','normalize.ts'),'export {};\n');
 fs.writeFileSync(path.join(root,'src','utils','legacy.js'),'export {};\n');
 fs.mkdirSync(path.join(root,'src','utils','group'),{recursive:true});
 fs.writeFileSync(path.join(root,'src','utils','group','index.mjs'),'export {};\n');
 const manifest={name:'demo-pkg',dependencies:{leftpad:'^1.0.0','@scope/pkg':'^2.0.0'}};
 const extensionless=resolveSpecifier('./normalize','src/utils/x.ts',manifest,root);
 assert.equal(extensionless.resolution,'project');
 assert.equal(extensionless.target,'src/utils/normalize.ts');
 assert.equal(resolveSpecifier('./legacy.js','src/utils/x.ts',manifest,root).resolution,'project');
 assert.equal(resolveSpecifier('./group','src/utils/x.ts',manifest,root).target,'src/utils/group/index.mjs');
 assert.equal(resolveSpecifier('../utils/normalize','src/deep/y.ts',manifest,root).resolution,'project');
 assert.equal(resolveSpecifier('./missing','src/utils/x.ts',manifest,root).resolution,'unresolved');
});

test('resolution classifies builtins, manifest dependencies, subpaths and self-references',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-ground-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const manifest={name:'demo-pkg',dependencies:{leftpad:'^1.0.0','@scope/pkg':'^2.0.0'}};
 assert.equal(resolveSpecifier('node:fs','',manifest,root).resolution,'builtin');
 assert.equal(resolveSpecifier('node:fs/promises','',manifest,root).resolution,'builtin');
 assert.equal(resolveSpecifier('node:teleport','',manifest,root).resolution,'unresolved');
 assert.deepEqual(resolveSpecifier('leftpad','src/x.mjs',manifest,root),{resolution:'dependency-manifest',target:'leftpad'});
 assert.deepEqual(resolveSpecifier('@scope/pkg/sub','src/x.mjs',manifest,root),{resolution:'dependency-manifest',target:'@scope/pkg'});
 assert.deepEqual(resolveSpecifier('demo-pkg/util','src/x.mjs',manifest,root),{resolution:'dependency-manifest',target:'demo-pkg (self-reference)'});
 const unknown=resolveSpecifier('never-declared','src/x.mjs',{},root);
 assert.equal(unknown.resolution,'unresolved');
 assert.equal(unknown.attempts.includes('never-declared'),true);
});

function groundingProject(t,{check='changed-files',include}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-ground-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 git(root,'init','-q');git(root,'config','user.email','test@example.invalid');git(root,'config','user.name','Test');
 const gate={id:'ground',kind:'symbol-grounding',level:'L1',enabled:true,stages:['close'],claimId:'C0'};
 if(check)gate.check=check;
 if(include)gate.include=include;
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'Imports resolve'}],gates:[gate],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 fs.mkdirSync(path.join(root,'src'));
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify({name:'proj',dependencies:{leftpad:'^1.0.0'}}));
 fs.writeFileSync(path.join(root,'src','app.mjs'),"import fs from 'node:fs';\nimport leftpad from 'leftpad';\nexport const n=fs.existsSync('.')?1:0;\n");
 git(root,'add','.');git(root,'commit','-qm','baseline');
 return root;
}

test('changed-files mode scans only the diff and passes on resolvable imports',t=>{
 const root=groundingProject(t);
 fs.writeFileSync(path.join(root,'src','app.mjs'),"import fs from 'node:fs';\nimport leftpad from 'leftpad';\nexport const n=2;\n");
 const result=run(root);
 assert.equal(result.status,'PASS');
 const details=result.evidence[0].details;
 assert.equal(details.mode,'changed-files');
 assert.equal(details.scannedFiles,1);
 assert.equal(details.importCount,2);
 assert.equal(details.files[0].imports.some(item=>item.resolution==='dependency-manifest'&&item.target==='leftpad'),true);
});

test('an import of a nonexistent module fails naming file, specifier and attempts',t=>{
 const root=groundingProject(t);
 fs.writeFileSync(path.join(root,'src','broken.mjs'),"import {ghost} from './missing.mjs';\nexport const g=ghost;\n");
 const result=run(root);
 assert.equal(result.status,'FAIL');
 const entry=result.evidence[0].details.unresolved[0];
 assert.equal(entry.path,'src/broken.mjs');
 assert.equal(entry.specifier,'./missing.mjs');
 assert.equal(entry.lines[0],1);
 assert.equal(entry.attempts.includes('src/missing.mjs'),true);
 const reasons=failureReasons(result.evidence[0]);
 assert.equal(reasons.some(reason=>reason.includes('src/broken.mjs:1')&&reason.includes('./missing.mjs')&&reason.includes('无法对账')),true);
});

test('all mode walks the repository and include restricts the scan face',t=>{
 const root=groundingProject(t,{check:'all',include:['src/**']});
 fs.writeFileSync(path.join(root,'broken.js'),"require('never-declared');\n");
 assert.equal(run(root).status,'PASS');
 fs.writeFileSync(path.join(root,'src','broken.mjs'),"require('never-declared');\n");
 const result=run(root);
 assert.equal(result.status,'FAIL');
 assert.equal(result.evidence[0].details.unresolved[0].path,'src/broken.mjs');
});

test('changed-files mode fails closed outside a Git repository; all mode does not need Git',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-ground-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'Imports resolve'}],gates:[{id:'ground',kind:'symbol-grounding',level:'L1',enabled:true,stages:['close'],claimId:'C0'}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
 const all={...config,gates:[{...config.gates[0],check:'all'}]};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(all));
 assert.equal(run(root).status,'PASS');
});

test('invalid option shapes fail closed at validation',t=>{
 const root=groundingProject(t);
 const config={schemaVersion:'0.2',claims:[{id:'C0',statement:'Imports resolve'}],gates:[{id:'ground',kind:'symbol-grounding',level:'L3',enabled:true,stages:['close'],claimId:'C0'}],risks:[],exceptions:[]};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 assert.equal(run(root).status,'ERROR');
 const badCheck={...config,gates:[{...config.gates[0],level:'L1',check:'yolo'}]};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(badCheck));
 const result=run(root);
 assert.equal(result.status,'ERROR');
 assert.match(result.error,/check must be changed-files or all/);
});

test('symbol-grounding-demo passes as shipped and fails on an injected phantom import',t=>{
 const demoDir=fileURLToPath(new URL('../examples/symbol-grounding-demo/',import.meta.url));
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-ground-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.cpSync(demoDir,root,{recursive:true});
 const passing=run(root);
 assert.equal(passing.status,'PASS');
 assert.equal(passing.evidence[0].details.scannedFiles,2);
 fs.writeFileSync(path.join(root,'src','phantom.ts'),"import {helper} from './helpers/phantom.mjs';\nexport const h=helper;\n");
 const failing=run(root);
 assert.equal(failing.status,'FAIL');
 assert.equal(failing.evidence[0].details.unresolved[0].specifier,'./helpers/phantom.mjs');
});

test('named import members are extracted with aliases and statement lines',()=>{
 const {imports}=extractImports(["import {normalize, toCase as upper} from './utils/normalize.mjs';","import * as all from './utils/normalize.mjs';"].join('\n'));
 const entry=imports.find(item=>item.specifier==='./utils/normalize.mjs');
 assert.deepEqual(entry.members,[{name:'normalize',line:1},{name:'toCase',alias:'upper',line:1}]);
});

test('export enumeration covers declarations, aliased clauses and marks opaque faces',()=>{
 const esm=enumerateExports(['export const version=1;','export declare function publish(){};','export interface Row{id:1}','export {legacy as heritage};','export default function main(){}'].join('\n'));
 assert.deepEqual(esm.names,['Row','heritage','main','publish','version']);
 assert.equal(esm.opaque,false);
 assert.equal(esm.defaultExport,true);
 assert.equal(enumerateExports('export * from "./others.mjs";').opaque,true);
 assert.equal(enumerateExports('module.exports={a:1};').opaque,true);
});

test('endpoint and config key extraction only recognizes call-position path forms',()=>{
 const source=[
  "fetch('/users?page=2');",
  "axios.get('/users/42');",
  "axios.post('/users', body);",
  'fetch(fullUrl);',
  "const u='https://api.example.com/users';",
  'const env=process.env.HOST;',
  "const port=process.env['PORT'];",
  'const ghost=process.env.GHOST_KEY;'
 ].join('\n');
 const {code,masked}=prepareSource(source);
 const endpoints=extractEndpointReferences(code,masked);
 assert.deepEqual(endpoints.map(entry=>entry.reference),['/users','/users/42','/users']);
 assert.equal(endpoints.find(entry=>entry.reference==='/users/42').method,'GET');
 assert.deepEqual(extractConfigKeyReferences(code,masked).map(entry=>entry.key),['HOST','PORT','GHOST_KEY']);
});

test('named members reconcile against the target export face, opaque targets are exempt and counted',t=>{
 const root=groundingProject(t,{check:'all'});
 fs.writeFileSync(path.join(root,'src','util.mjs'),'export function real(){}\n');
 fs.writeFileSync(path.join(root,'src','opaque.mjs'),'export * from "./util.mjs";\n');
 fs.writeFileSync(path.join(root,'src','app.mjs'),"import {real, phantom} from './util.mjs';\nimport {anything} from './opaque.mjs';\nreal();\n");
 const report=run(root);
 assert.equal(report.status,'FAIL');
 const details=report.evidence[0].details;
 assert.deepEqual(details.unresolvedMember,[{path:'src/app.mjs',line:1,target:'src/util.mjs',member:'phantom'}]);
 assert.equal(details.memberOpaqueTargets,1);
 fs.writeFileSync(path.join(root,'src','app.mjs'),"import {real} from './util.mjs';\nreal();\n");
 assert.equal(run(root).status,'PASS');
});

test('apiSurface binding reconciles endpoints and config keys against declared faces',t=>{
 const root=groundingProject(t,{check:'all'});
 fs.mkdirSync(path.join(root,'.quality-gate','registries'),{recursive:true});
 fs.writeFileSync(path.join(root,'openapi.json'),JSON.stringify({paths:{'/users':{get:{}},'/users/{id}':{delete:{}}}}));
 fs.writeFileSync(path.join(root,'config.schema.json'),JSON.stringify({properties:{HOST:{type:'string'},PORT:{type:'number'}}}));
 fs.writeFileSync(path.join(root,'.quality-gate','registries','api-surface.json'),JSON.stringify({surfaces:[
  {id:'api',type:'openapi',file:'openapi.json',source:{file:'docs/api.md'}},
  {id:'cfg',type:'json-schema',file:'config.schema.json',source:{file:'docs/cfg.md'}}
 ]}));
 fs.writeFileSync(path.join(root,'src','client.mjs'),[
  "const r=await fetch('/users?page=2');",
  "await axios.delete('/users/42');",
  "await fetch('/ghosts');",
  'const h=process.env.HOST;',
  "const g=process.env['GHOST_KEY'];"
 ].join('\n'));
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].apiSurface={file:'.quality-gate/registries/api-surface.json'};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const report=run(root);
 assert.equal(report.status,'FAIL');
 const references=report.evidence[0].details.unresolvedReference;
 assert.deepEqual(references.map(entry=>`${entry.kind}:${entry.reference}`),['endpoint:/ghosts','config-key:GHOST_KEY']);
 const evidence=report.evidence[0].details.apiSurface;
 assert.equal(evidence.surfaces.length,2);
 assert.match(evidence.contentSha256,/^[0-9a-f]{64}$/);
 assert.equal(evidence.endpointReferenceCount,3);
 assert.equal(evidence.configKeyReferenceCount,2);
});

test('apiSurface binding fails closed on missing registry and invalid binding shape',t=>{
 const root=groundingProject(t,{check:'all'});
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].apiSurface={file:'.quality-gate/registries/absent.json'};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const missing=run(root);
 assert.equal(missing.status,'ERROR');
 assert.match(String(missing.evidence[0].details),/api surface registry missing/);
 config.gates[0].apiSurface={file:'../escape.json'};
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const invalid=run(root);
 assert.equal(invalid.status,'ERROR');
 assert.match(invalid.error,/Invalid apiSurface binding/);
});

test('foreign import extraction covers python and java lexical forms, strings and comments are immune',()=>{
 const py=preparePythonSource(['import os, json','from .helpers import parse','from package.module import Thing','# import ghost.comment',"s='import fake'"].join('\n'));
 assert.deepEqual(extractForeignImports(py.code,py.masked,'python').map(entry=>entry.module),['os','json','.helpers','package.module']);
 const java=prepareSource(['import com.example.Order;','import static java.util.Objects.requireNonNull;','// import ghost.Fake;','/* import old.Legacy; */','import com.example.*;'].join('\n'));
 assert.deepEqual(extractForeignImports(java.code,java.masked,'java').map(entry=>entry.module),['com.example.Order','java.util.Objects.requireNonNull']);
});

test('import observations reconcile bidirectionally: coverage gaps, unresolved reports and audit-only extras',t=>{
 const root=groundingProject(t,{check:'all'});
 fs.writeFileSync(path.join(root,'src','app.py'),'import os\nimport requests\nfrom .helpers import parse\n');
 fs.writeFileSync(path.join(root,'src','Main.java'),'import com.example.Order;\n');
 fs.mkdirSync(path.join(root,'.quality-gate','observations'),{recursive:true});
 fs.writeFileSync(path.join(root,'.quality-gate','observations','py.json'),JSON.stringify({schemaVersion:'0.1',language:'python',tool:'probe',entries:[
  {module:'os',resolution:'stdlib'},
  {module:'requests',resolution:'third-party',detail:'requests 2.31'},
  {module:'.helpers',resolution:'project'}
 ]}));
 fs.writeFileSync(path.join(root,'.quality-gate','observations','java.json'),JSON.stringify({schemaVersion:'0.1',language:'java',tool:'scan',entries:[
  {module:'com.example.Order',resolution:'project'},
  {module:'com.legacy.Ghost',resolution:'unresolved',detail:'not in dependency manifest'}
 ]}));
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].importObservations=[{language:'python',file:'.quality-gate/observations/py.json'},{language:'java',file:'.quality-gate/observations/java.json'}];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const report=run(root);
 assert.equal(report.status,'FAIL');
 const languages=report.evidence[0].details.importObservations.languages;
 assert.deepEqual(languages.python.coverageGaps,[]);
 assert.deepEqual(languages.java.unresolved,[{module:'com.legacy.Ghost',detail:'not in dependency manifest'}]);
 assert.deepEqual(languages.java.extraReported,['com.legacy.Ghost']);
 const trimmed={schemaVersion:'0.1',language:'python',tool:'probe',entries:[{module:'requests',resolution:'third-party'},{module:'.helpers',resolution:'project'}]};
 fs.writeFileSync(path.join(root,'.quality-gate','observations','py.json'),JSON.stringify(trimmed));
 const trimmedReport=run(root);
 assert.equal(trimmedReport.status,'FAIL');
 assert.deepEqual(trimmedReport.evidence[0].details.importObservations.languages.python.coverageGaps,[{module:'os',locations:['src/app.py:1']}]);
 fs.writeFileSync(path.join(root,'.quality-gate','observations','py.json'),JSON.stringify({schemaVersion:'0.1',language:'python',tool:'probe',entries:[{module:'os',resolution:'stdlib'},{module:'requests',resolution:'third-party'},{module:'.helpers',resolution:'project'}]}));
 fs.writeFileSync(path.join(root,'.quality-gate','observations','java.json'),JSON.stringify({schemaVersion:'0.1',language:'java',tool:'scan',entries:[{module:'com.example.Order',resolution:'project'},{module:'com.legacy.Ghost',resolution:'third-party'}]}));
 assert.equal(run(root).status,'PASS');
});

test('import observation files fail closed on missing file, malformed shape and language mismatch',t=>{
 const root=groundingProject(t,{check:'all'});
 fs.writeFileSync(path.join(root,'src','app.py'),'import os\n');
 const config=JSON.parse(fs.readFileSync(path.join(root,'.quality-gate.json'),'utf8'));
 config.gates[0].importObservations=[{language:'python',file:'.quality-gate/observations/absent.json'}];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const missing=run(root);
 assert.equal(missing.status,'ERROR');
 assert.match(String(missing.evidence[0].details),/import observation file missing/);
 fs.mkdirSync(path.join(root,'.quality-gate','observations'),{recursive:true});
 config.gates[0].importObservations=[{language:'python',file:'.quality-gate/observations/py.json'}];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 fs.writeFileSync(path.join(root,'.quality-gate','observations','py.json'),JSON.stringify({schemaVersion:'0.1',language:'python',tool:'probe',entries:[{module:'os',resolution:'weird'}]}));
 const malformed=run(root);
 assert.equal(malformed.status,'ERROR');
 assert.match(String(malformed.evidence[0].details),/resolution must be/);
 fs.writeFileSync(path.join(root,'.quality-gate','observations','py.json'),JSON.stringify({schemaVersion:'0.1',language:'java',tool:'probe',entries:[]}));
 const mismatched=run(root);
 assert.equal(mismatched.status,'ERROR');
 assert.match(String(mismatched.evidence[0].details),/language mismatch/);
 config.gates[0].importObservations=[{language:'go',file:'.quality-gate/observations/py.json'}];
 fs.writeFileSync(path.join(root,'.quality-gate.json'),JSON.stringify(config));
 const invalid=run(root);
 assert.equal(invalid.status,'ERROR');
 assert.match(invalid.error,/Invalid importObservations/);
});

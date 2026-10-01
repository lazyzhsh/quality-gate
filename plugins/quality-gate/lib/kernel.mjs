import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {validatePersistence,runPersistence} from './persistence.mjs';
import {runOntologyMap} from './ontology-map.mjs';
import {runTraceability} from './traceability.mjs';
import {runSemanticProfile} from './semantic-profile.mjs';
import {validateBehavior,runBehavior} from './behavior.mjs';
import {validateMetrics,runMetrics} from './metrics.mjs';
import {runDecisions} from './decisions.mjs';
import {runChangeScope} from './change-scope.mjs';
import {validateEngineering,runEngineering} from './engineering.mjs';
import {validateAlignment,runAlignment} from './alignment.mjs';
import {validateConsumerMatrix,runConsumerMatrix} from './consumer-matrix.mjs';
import {validateInvariant,runInvariant} from './invariant.mjs';
import {validateJourney,runJourney} from './journey.mjs';
import {validateVisual,runVisual} from './visual.mjs';
import {validateProperty,runProperty} from './property.mjs';
import {validateSemanticAlignment,runSemanticAlignment} from './semantic-alignment.mjs';
import {validateTerminology,runTerminology} from './terminology.mjs';
import {validateSemanticRelation,runSemanticRelation} from './semantic-relation.mjs';
import {validateSemanticConstraint,runSemanticConstraint} from './semantic-constraint.mjs';
import {validateSemanticState,runSemanticState} from './semantic-state.mjs';
import {validateSemanticInstance,runSemanticInstance} from './semantic-instance.mjs';
import {validateSemanticExposure,runSemanticExposure} from './semantic-exposure.mjs';
import {validateSemanticConsistency,runSemanticConsistency} from './semantic-consistency.mjs';
import {validateScan,runScan} from './scan.mjs';
import {validateResilience,runResilience} from './resilience.mjs';
import {validateConfiguration,runConfiguration} from './configuration.mjs';
import {validateDocumentation,runDocumentation} from './documentation.mjs';
import {runDebt} from './debt.mjs';
import {validateConsistency,runConsistency} from './consistency.mjs';
import {validateBudget,runBudget} from './budget.mjs';
import {validateRerun,runRerun} from './rerun.mjs';
import {validateTopology,runTopology} from './topology.mjs';
import {runAssumptions} from './assumptions.mjs';
import {validateSymbolGrounding,runSymbolGrounding} from './symbol-grounding.mjs';
import {runConventionAlignment} from './convention-alignment.mjs';
import {validateTraceContinuity,runTraceContinuity} from './trace-continuity.mjs';
import {dependencyReport} from './dependencies.mjs';
import {inputSnapshot,changedInputs} from './freshness.mjs';

export const STAGE_BUDGET_MS={edit:60000,close:60000,pr:300000,release:300000};
export const stageBudget=(c,stage)=>c.gates.filter(g=>g.enabled&&Array.isArray(g.stages)&&g.stages.includes(stage)).reduce((sum,g)=>sum+(g.timeoutMs??0)+(g.coverage?.timeoutMs??0)+(g.reasoner?.timeoutMs??0)+(g.shacl?.timeoutMs??0),0);

const assert = (ok, message) => { if (!ok) throw new Error(message); };
export const GATE_KINDS=['command','assumptions','persistence','ontology-map','traceability','semantic-profile','behavior','metrics','decisions','change-scope','engineering','alignment','consumer-matrix','invariant','journey','visual','property','semantic-alignment','terminology','semantic-relation','semantic-constraint','semantic-state','semantic-instance','semantic-exposure','semantic-consistency','scan','resilience','configuration','documentation','debt','consistency','budget','rerun','topology','symbol-grounding','convention-alignment','trace-continuity'];
const text = v => typeof v === 'string' && v.trim().length > 0;
export function projectFile(root, name) {
  assert(text(name) && !path.isAbsolute(name), 'Expected project-relative file');
  const real = fs.realpathSync(path.resolve(root, name));
  const rel = path.relative(fs.realpathSync(root), real);
  assert(rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel), 'File escapes project');
  return real;
}
export function validate(c) {
  assert(c?.schemaVersion === '0.2', 'Unsupported schemaVersion (config schema is 0.2 since v1.16; 0.1 configs must migrate domain->level / requiredDomains->requiredLevels, see RELEASE-1.16.0)');
  assert(Array.isArray(c.claims) && c.claims.length > 0, 'claims required');
  assert(c.claims.every(x => text(x.id) && text(x.statement)), 'Invalid claim');
  assert(new Set(c.claims.map(x=>x.id)).size === c.claims.length, 'Duplicate claim');
  assert(Array.isArray(c.gates) && c.gates.length > 0 && c.gates.length <= 32, 'Expected 1..32 gates');
  assert(new Set(c.gates.map(x=>x.id)).size === c.gates.length, 'Duplicate gate');
  assert(Array.isArray(c.risks) && c.risks.every(r=>text(r.id)&&text(r.description)&&c.gates.some(g=>g.id===r.gateId)), 'Invalid risks');
  assert(new Set(c.risks.map(x=>x.id)).size === c.risks.length, 'Duplicate risk');
  assert(Array.isArray(c.exceptions) && c.exceptions.length <= 20, 'Invalid exceptions');
  assert(c.exceptions.every(x=>text(x.id)&&text(x.gateId)&&text(x.riskId)&&text(x.reason)&&text(x.owner)&&/^\d{4}-\d{2}-\d{2}$/.test(x.expiresAt)&&['proposed','approved'].includes(x.status)&&c.risks.some(r=>r.id===x.riskId&&r.gateId===x.gateId)), 'Invalid exception');
  assert(c.exceptions.every(x=>x.status!=='approved'||(text(x.approvedBy)&&/^\d{4}-\d{2}-\d{2}$/.test(x.approvedAt)&&x.approvedAt<=x.expiresAt)),'Approved exception requires approvedBy and approvedAt (not after expiresAt)');
  assert(new Set(c.exceptions.map(x=>x.id)).size===c.exceptions.length,'Duplicate exception');
  if(c.requiredDomains!==undefined)throw new Error('legacy key requiredDomains was renamed to requiredLevels in v1.16 (config schemaVersion 0.2)');
  if(c.requiredLevels!==undefined){
    assert(c.requiredLevels&&typeof c.requiredLevels==='object'&&!Array.isArray(c.requiredLevels),'Invalid requiredLevels');
    for(const [stage,levels] of Object.entries(c.requiredLevels)){
      assert(['edit','close','pr','release'].includes(stage)&&Array.isArray(levels)&&levels.length>0&&levels.length<=6&&levels.every(x=>/^L[0-5]$/.test(x))&&new Set(levels).size===levels.length,'Invalid requiredLevels stage');
    }
  }
  // Stop Hook 行为（v1.14）：blockMode all=非 PASS 一律阻断（默认）；new-only=会话开始前
  // 既有且声明输入未变的 FAIL 降级为非阻断警告。inputs 按门禁声明输入 glob，是降级的
  // 必要条件——未声明输入的既有 FAIL 仍阻断（fail-safe，不误降级）。
  if(c.stop!==undefined){
    assert(c.stop&&typeof c.stop==='object'&&!Array.isArray(c.stop)&&Object.keys(c.stop).every(k=>k==='blockMode'||k==='inputs'),'Invalid stop');
    assert(['all','new-only'].includes(c.stop.blockMode),'stop.blockMode must be all or new-only');
    if(c.stop.inputs!==undefined){
      assert(c.stop.inputs&&typeof c.stop.inputs==='object'&&!Array.isArray(c.stop.inputs),'Invalid stop.inputs');
      for(const [gateId,patterns] of Object.entries(c.stop.inputs)){
        assert(c.gates.some(g=>g.id===gateId),'stop.inputs references unknown gate '+gateId);
        assert(Array.isArray(patterns)&&patterns.length>0&&patterns.length<=20&&patterns.every(p=>typeof p==='string'&&p.trim().length>0&&p.length<=200&&!path.isAbsolute(p)&&!p.startsWith('../')&&!p.includes('\\')),'Invalid stop.inputs patterns');
      }
    }
  }
  // 任务意图软形态（v1.17.1，OD-105 裁决=登记即激活）：hooks:false 整体关闭软形态（即使已登记）；
  // capture:true 开启未登记时的引导提示（默认关——未接入意图纪律的项目零感知）。基准行注入与
  // 范围软提示随意图登记存在自动激活，不设其他开关
  if(c.intent!==undefined){
    assert(c.intent&&typeof c.intent==='object'&&!Array.isArray(c.intent)&&Object.keys(c.intent).every(key=>key==='capture'||key==='hooks'),'Invalid intent');
    assert(c.intent.capture===undefined||typeof c.intent.capture==='boolean','intent.capture must be boolean');
    assert(c.intent.hooks===undefined||typeof c.intent.hooks==='boolean','intent.hooks must be boolean');
  }
  // 可选溯源（v1.7.1）：init 写入、update 刷新；供 inspect/update 识别模板来源与漂移
  if(c.template!==undefined){
    assert(c.template&&typeof c.template==='object'&&!Array.isArray(c.template)&&typeof c.template.id==='string'&&c.template.id.trim().length>0&&!Number.isNaN(Date.parse(c.template.generatedAt)),'Invalid template provenance');
  }
  for (const g of c.gates) {
    assert(text(g.id) && GATE_KINDS.includes(g.kind), 'Unknown gate kind or id');
    assert(typeof g.enabled === 'boolean', 'enabled must be boolean');
    assert(!('domain' in g),'legacy gate key domain was renamed to level in v1.16 (config schemaVersion 0.2)');
    assert(/^L[0-5]$/.test(g.level), 'Invalid level');
    assert(c.claims.some(x=>x.id===g.claimId), 'Unknown claim reference');
    assert(Array.isArray(g.stages) && g.stages.length && g.stages.every(x=>['edit','close','pr','release'].includes(x)), 'Invalid stages');
    if(g.kind==='engineering'){
      validateEngineering(g);
    } else if(g.kind==='configuration'){
      validateConfiguration(g);
    } else if(g.kind==='consistency'){
      validateConsistency(g);
    } else if(g.kind==='budget'){
      validateBudget(g);
    } else if(g.kind==='rerun'){
      validateRerun(g);
    } else if(g.kind==='topology'){
      validateTopology(g);
    } else if(g.kind==='symbol-grounding'){
      validateSymbolGrounding(g);
    } else if(g.kind==='terminology'){
      validateTerminology(g,c);
    } else if(g.kind==='semantic-instance'){
      validateSemanticInstance(g,c);
    } else if(g.kind==='semantic-consistency'){
      validateSemanticConsistency(g,c);
    } else if (g.kind==='command'||g.kind==='persistence'||g.kind==='behavior'||g.kind==='metrics'||g.kind==='alignment'||g.kind==='consumer-matrix'||g.kind==='invariant'||g.kind==='journey'||g.kind==='visual'||g.kind==='property'||g.kind==='semantic-alignment'||g.kind==='semantic-relation'||g.kind==='semantic-constraint'||g.kind==='semantic-state'||g.kind==='semantic-exposure'||g.kind==='scan'||g.kind==='resilience'||g.kind==='documentation'||g.kind==='trace-continuity') {
      assert(Array.isArray(g.argv) && g.argv.length && g.argv.every(text), 'argv required');
      const ceiling=g.kind==='command'&&g.stages.every(s=>s==='pr'||s==='release')?300000:60000;
      assert(Number.isInteger(g.timeoutMs) && g.timeoutMs>0 && g.timeoutMs<=ceiling, `timeoutMs must be 1..${ceiling}`);
      if(g.kind==='persistence')validatePersistence(g);
      if(g.kind==='behavior')validateBehavior(g);
      if(g.kind==='metrics')validateMetrics(g);
      if(g.kind==='alignment')validateAlignment(g);
      if(g.kind==='consumer-matrix')validateConsumerMatrix(g);
      if(g.kind==='invariant')validateInvariant(g);
      if(g.kind==='journey')validateJourney(g);
      if(g.kind==='visual')validateVisual(g);
      if(g.kind==='property')validateProperty(g);
      if(g.kind==='semantic-alignment')validateSemanticAlignment(g,c);
      if(g.kind==='semantic-relation')validateSemanticRelation(g,c);
      if(g.kind==='semantic-constraint')validateSemanticConstraint(g,c);
      if(g.kind==='semantic-state')validateSemanticState(g,c);
      if(g.kind==='semantic-exposure')validateSemanticExposure(g,c);
      if(g.kind==='scan')validateScan(g);
      if(g.kind==='resilience')validateResilience(g);
      if(g.kind==='documentation')validateDocumentation(g);
      if(g.kind==='trace-continuity')validateTraceContinuity(g);
    } else {
      assert(text(g.file), 'Gate input file required');
      if(g.kind==='ontology-map')assert(g.level==='L2'&&c.ontology&&typeof c.ontology.type==='string','L2 ontology-map requires ontology provider');
      if(g.kind==='traceability')assert(g.level==='L0'&&(!('requirePrdRefs'in g)||typeof g.requirePrdRefs==='boolean')&&(g.defaultRequiredTypes===undefined||Array.isArray(g.defaultRequiredTypes)&&g.defaultRequiredTypes.length>0&&g.defaultRequiredTypes.length<=5&&g.defaultRequiredTypes.every(type=>['normal','boundary','negative','exception','state-transition'].includes(type))&&new Set(g.defaultRequiredTypes).size===g.defaultRequiredTypes.length),'traceability requires L0, boolean requirePrdRefs and valid unique defaultRequiredTypes');
      if(g.kind==='semantic-profile')assert(g.level==='L2'&&text(g.dataFile)&&c.ontology&&typeof c.ontology.type==='string'&&(g.shacl===undefined||(g.shacl!==null&&typeof g.shacl==='object'&&!Array.isArray(g.shacl)&&Object.keys(g.shacl).length===2&&Array.isArray(g.shacl.argv)&&g.shacl.argv.length>0&&g.shacl.argv.every(text)&&Number.isInteger(g.shacl.timeoutMs)&&g.shacl.timeoutMs>0&&g.shacl.timeoutMs<=60000)),'L2 semantic-profile requires dataFile and ontology; shacl (optional) is exactly {argv, timeoutMs 1..60000}');
      if(g.kind==='debt')assert(g.level==='L5','debt requires L5');
      if(g.kind==='decisions')assert(['L0','L5'].includes(g.level)&&(!('allowDeferred'in g)||typeof g.allowDeferred==='boolean')&&(!('requireProvenance'in g)||typeof g.requireProvenance==='boolean')&&(!('requireAdrRefs'in g)||typeof g.requireAdrRefs==='boolean'),'decisions requires L0/L5 and boolean allowDeferred/requireProvenance/requireAdrRefs');
      if(g.kind==='change-scope')assert(g.level==='L0','change-scope requires L0');
      if(g.kind==='convention-alignment')assert(g.level==='L0','convention-alignment requires L0');
      if(g.kind==='assumptions')assert(g.level==='L0'&&(!('requireProvenance'in g)||typeof g.requireProvenance==='boolean'),'assumptions requires L0 and boolean requireProvenance');
    }
  }
  for(const stage of ['edit','close','pr','release'])assert(stageBudget(c,stage)<=STAGE_BUDGET_MS[stage],`Stage execution budget exceeds ${STAGE_BUDGET_MS[stage]}ms`);
  return c;
}
export function run(root, stage='close', reportDir=path.join(root,'.quality-gate','runs'),{budgetMs}={}) {
  root=fs.realpathSync(root);
  const report={schemaVersion:'0.2',id:randomUUID(),root,stage,startedAt:new Date().toISOString(),evidence:[]};
  const before=inputSnapshot(root,{reportDir});
  try {
    assert(['edit','close','pr','release'].includes(stage),'Invalid stage');
    let raw;
    // 缺配置给出可行动文案（指向引导初始化），其余读取错误原样抛出（fail-closed 不变）
    try{raw=fs.readFileSync(projectFile(root,'.quality-gate.json'),'utf8');}
    catch(err){if(err.code==='ENOENT')throw new Error('missing .quality-gate.json: run onboarding first (qgate.mjs templates lists presets; qgate.mjs init <project-root> <answers.json> writes the config)');throw err;}
    report.configSha256=createHash('sha256').update(raw).digest('hex');
    const c=validate(JSON.parse(raw.replace(/^\uFEFF/,'')));
    if(budgetMs!==undefined)assert(stageBudget(c,stage)<=budgetMs,`Host execution budget exceeds ${budgetMs}ms; run long checks with CLI pr/release`);
    const dependencies=dependencyReport(c);
    if(dependencies.required.length)report.dependencies=dependencies;
    // 审批/到期豁免评估（D2）：已审批且在有效期内 → WAIVED 呈现（不改变任何门禁判定）；
    // proposed、审批不全、已过期或未生效仍按登记阻断。豁免不豁免任何 FAIL 门禁（X1 不变）。
    const today=new Date().toISOString().slice(0,10);
    const exceptions=c.exceptions.map(x=>{
      const approved=x.status==='approved';
      const waived=approved&&x.approvedAt<=today&&x.expiresAt>=today;
      return {...x,waiver:{status:waived?'waived':'blocking',...(approved&&!waived?{reason:x.expiresAt<today?'expired':'not-yet-effective'}:{})}};
    });
    Object.assign(report,{claims:c.claims,risks:c.risks,exceptions});
    for(const g of c.gates) {
      const e={id:randomUUID(),gateId:g.id,claimId:g.claimId,kind:g.kind,level:g.level,startedAt:new Date().toISOString(),status:'SKIP',details:'Disabled or stage not selected'};
      if(g.enabled && g.stages.includes(stage)) {
        try {
          if(g.kind==='command') {
            const argv=g.argv.map(a=>a==='$NODE'?process.execPath:a);
            const r=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
            e.status=r.error||r.signal?'ERROR':r.status===0?'PASS':'FAIL';
            e.details={argv,exitCode:r.status,signal:r.signal,error:r.error?.message,stdout:r.stdout,stderr:r.stderr};
          } else if(g.kind==='persistence') {
            Object.assign(e,runPersistence(g,root));
          } else if(g.kind==='behavior') {
            Object.assign(e,runBehavior(g,root));
          } else if(g.kind==='metrics') {
            Object.assign(e,runMetrics(g,root));
          } else if(g.kind==='ontology-map') {
            Object.assign(e,runOntologyMap(g,c,root));
          } else if(g.kind==='semantic-profile') {
            Object.assign(e,runSemanticProfile(g,c,root));
          } else if(g.kind==='decisions') {
            e.status='PENDING';
            e.details='Evaluating after linked gates';
          } else if(g.kind==='change-scope') {
            Object.assign(e,runChangeScope(g,root));
          } else if(g.kind==='engineering') {
            Object.assign(e,runEngineering(g,root));
          } else if(g.kind==='alignment') {
            Object.assign(e,runAlignment(g,root));
          } else if(g.kind==='consumer-matrix') {
            Object.assign(e,runConsumerMatrix(g,root));
          } else if(g.kind==='invariant') {
            Object.assign(e,runInvariant(g,root));
          } else if(g.kind==='journey') {
            Object.assign(e,runJourney(g,root));
          } else if(g.kind==='visual') {
            Object.assign(e,runVisual(g,root));
          } else if(g.kind==='property') {
            Object.assign(e,runProperty(g,root));
          } else if(g.kind==='semantic-alignment') {
            Object.assign(e,runSemanticAlignment(g,c,root));
          } else if(g.kind==='semantic-relation') {
            Object.assign(e,runSemanticRelation(g,c,root));
          } else if(g.kind==='semantic-constraint') {
            Object.assign(e,runSemanticConstraint(g,c,root));
          } else if(g.kind==='semantic-state') {
            Object.assign(e,runSemanticState(g,c,root));
          } else if(g.kind==='semantic-instance') {
            Object.assign(e,runSemanticInstance(g,c,root));
          } else if(g.kind==='semantic-exposure') {
            Object.assign(e,runSemanticExposure(g,c,root));
          } else if(g.kind==='semantic-consistency') {
            Object.assign(e,runSemanticConsistency(g,c,root));
          } else if(g.kind==='terminology') {
            Object.assign(e,runTerminology(g,c,root));
          } else if(g.kind==='scan') {
            Object.assign(e,runScan(g,root));
          } else if(g.kind==='resilience') {
            Object.assign(e,runResilience(g,root));
          } else if(g.kind==='configuration') {
            Object.assign(e,runConfiguration(g,root));
          } else if(g.kind==='documentation') {
            Object.assign(e,runDocumentation(g,root));
          } else if(g.kind==='debt') {
            e.status='PENDING';
            e.details='Evaluating after linked gates';
          } else if(g.kind==='consistency') {
            Object.assign(e,runConsistency(g,root));
          } else if(g.kind==='budget') {
            Object.assign(e,runBudget(g,root));
          } else if(g.kind==='rerun') {
            Object.assign(e,runRerun(g,root));
          } else if(g.kind==='topology') {
            Object.assign(e,runTopology(g,root));
          } else if(g.kind==='symbol-grounding') {
            Object.assign(e,runSymbolGrounding(g,root));
          } else if(g.kind==='convention-alignment') {
            Object.assign(e,runConventionAlignment(g,root));
          } else if(g.kind==='trace-continuity') {
            Object.assign(e,runTraceContinuity(g,root));
          } else if(g.kind==='traceability') {
            e.status='PENDING';
            e.details='Evaluating after linked gates';
          } else {
            e.status='PENDING';
            e.details='Evaluating after linked gates';
          }
        } catch(err) {e.status='ERROR';e.details=err.message;}
      }
      e.finishedAt=new Date().toISOString(); report.evidence.push(e);
    }
    for(const g of c.gates.filter(g=>g.kind==='assumptions'&&g.enabled&&g.stages.includes(stage))){
      const e=report.evidence.find(item=>item.gateId===g.id);
      try {Object.assign(e,runAssumptions(g,root,c,report.evidence));}
      catch(err){e.status='ERROR';e.details=err.message;}
      e.finishedAt=new Date().toISOString();
    }
    for(const g of c.gates.filter(g=>g.kind==='decisions'&&g.enabled&&g.stages.includes(stage))){
      const e=report.evidence.find(item=>item.gateId===g.id);
      try {Object.assign(e,runDecisions(g,root,c,report.evidence));}
      catch(err){e.status='ERROR';e.details=err.message;}
      e.finishedAt=new Date().toISOString();
    }
    for(const g of c.gates.filter(g=>g.kind==='debt'&&g.enabled&&g.stages.includes(stage))){
      const e=report.evidence.find(item=>item.gateId===g.id);
      try {Object.assign(e,runDebt(g,root,c,report.evidence));}
      catch(err){e.status='ERROR';e.details=err.message;}
      e.finishedAt=new Date().toISOString();
    }
    for(const g of c.gates.filter(g=>g.kind==='traceability'&&g.enabled&&g.stages.includes(stage))){
      const e=report.evidence.find(item=>item.gateId===g.id);
      try {Object.assign(e,runTraceability(g,root,c,report.evidence));}
      catch(err){e.status='ERROR';e.details=err.message;}
      e.finishedAt=new Date().toISOString();
    }
    const active=report.evidence.filter(e=>e.status!=='SKIP');
    report.status=active.some(e=>e.status==='ERROR')?'ERROR':active.some(e=>e.status==='FAIL')?'FAIL':active.length?'PASS':'SKIP';
    report.levelCoverage=Array.from({length:6},(_,index)=>{
      const level=`L${index}`;
      const items=c.gates.filter(g=>g.level===level).map(g=>report.evidence.find(e=>e.gateId===g.id)).filter(e=>e.status!=='SKIP');
      return {level,gateIds:items.map(e=>e.gateId),status:items.some(e=>e.status==='ERROR')?'ERROR':items.some(e=>e.status==='FAIL')?'FAIL':items.length?'PASS':'SKIP'};
    });
    report.missingRequiredLevels=(c.requiredLevels?.[stage]??[]).filter(level=>report.levelCoverage.find(x=>x.level===level).status==='SKIP');
    report.unmetRequiredLevels=(c.requiredLevels?.[stage]??[]).filter(level=>report.levelCoverage.find(x=>x.level===level).status!=='PASS');
    report.riskEvidence=c.risks.map(r=>({riskId:r.id,gateId:r.gateId,evidenceId:report.evidence.find(e=>e.gateId===r.gateId)?.id,gateStatus:report.evidence.find(e=>e.gateId===r.gateId)?.status}));
    if(report.status!=='ERROR'&&(report.unmetRequiredLevels.length||exceptions.some(x=>x.waiver.status!=='waived')))report.status='FAIL';
  } catch(err) {report.status='ERROR';report.error=err.message;}
  const after=inputSnapshot(root,{reportDir});
  report.inputsStable=changedInputs(before,after)?.length===0;
  if(before)report.inputSnapshot=before;
  report.finishedAt=new Date().toISOString();
  const file=path.join(reportDir,report.id+'.json');
  try {fs.mkdirSync(reportDir,{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2),{flag:'wx'});report.reportPath=file;}
  catch(err){report.status='ERROR';report.error='Evidence persistence failed: '+err.message;}
  return report;
}
export const exitCode = report => report.status==='PASS'?0:report.status==='FAIL'?1:2;

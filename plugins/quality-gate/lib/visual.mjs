import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {projectFile} from './kernel.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const check=(condition,message)=>{if(!condition)throw new Error(message);};
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export function validateVisual(g){
 check(g.level==='L3'&&text(g.baselineFile),'visual requires L3 and baselineFile');
 check(g.maxDiffPixels===undefined||Number.isInteger(g.maxDiffPixels)&&g.maxDiffPixels>=0,'Invalid maxDiffPixels');
 check(g.maxDiffRatio===undefined||Number.isFinite(g.maxDiffRatio)&&g.maxDiffRatio>=0&&g.maxDiffRatio<=1,'Invalid maxDiffRatio');
}
export function runVisual(g,root){
 const baseline=projectFile(root,g.baselineFile);
 check(fs.statSync(baseline).isFile()&&fs.statSync(baseline).size>0,'Visual baseline missing or empty');
 const tolerance=g.maxDiffPixels!==undefined||g.maxDiffRatio!==undefined;
 const runId=randomUUID(),argv=g.argv.map(item=>item==='$NODE'?process.execPath:item);
 const result=spawnSync(argv[0],argv.slice(1),{cwd:root,shell:false,encoding:'utf8',input:JSON.stringify({schemaVersion:'0.1',runId})+'\n',timeout:g.timeoutMs,maxBuffer:65536,windowsHide:true});
 const execution={runId,argv,exitCode:result.status,signal:result.signal,stderr:result.stderr};
 if(result.error||result.signal||result.status!==0)return {status:'ERROR',details:{...execution,error:result.error?.message??'Visual runner failed'}};
 try{
  const observed=JSON.parse(result.stdout);
  check(observed&&observed.schemaVersion==='0.1'&&observed.runId===runId&&text(observed.source)&&text(observed.actualFile),'Invalid or stale visual observation');
  const actual=projectFile(root,observed.actualFile);
  check(fs.statSync(actual).isFile()&&fs.statSync(actual).size>0,'Actual visual artifact missing or empty');
  const baselineSha256=digest(baseline),actualSha256=digest(actual);
  const identical=baselineSha256===actualSha256;
  let diff;
  if(observed.diff!==undefined){
   check(observed.diff!==null&&typeof observed.diff==='object'&&!Array.isArray(observed.diff)&&Number.isInteger(observed.diff.pixels)&&observed.diff.pixels>=0&&Number.isInteger(observed.diff.totalPixels)&&observed.diff.totalPixels>0&&observed.diff.pixels<=observed.diff.totalPixels,'Invalid visual diff metrics');
   diff=observed.diff;
  }else if(tolerance)check(false,'Pixel diff metrics required when maxDiffPixels/maxDiffRatio is configured');
  let status='FAIL';
  if(identical)status='PASS';
  else if(tolerance&&diff){
   const ratio=diff.pixels/diff.totalPixels;
   status=(g.maxDiffPixels===undefined||diff.pixels<=g.maxDiffPixels)&&(g.maxDiffRatio===undefined||ratio<=g.maxDiffRatio)?'PASS':'FAIL';
  }
  return {status,details:{...execution,source:observed.source,baselineFile:g.baselineFile,actualFile:observed.actualFile,baselineSha256,actualSha256,baselineBytes:fs.statSync(baseline).size,actualBytes:fs.statSync(actual).size,comparison:tolerance?'pixel-diff':'exact-bytes',...(diff?{diff,actualRatio:diff.pixels/diff.totalPixels}:{}),...(g.maxDiffPixels!==undefined?{maxDiffPixels:g.maxDiffPixels}:{}),...(g.maxDiffRatio!==undefined?{maxDiffRatio:g.maxDiffRatio}:{})}};
 }catch(error){return {status:'ERROR',details:{...execution,error:error.message}};}
}

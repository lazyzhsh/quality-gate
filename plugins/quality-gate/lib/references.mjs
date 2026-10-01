import fs from 'node:fs';
import path from 'node:path';
import {projectFile} from './kernel.mjs';

const text=value=>typeof value==='string'&&value.trim().length>0;
const plainObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

// A provenance field is either human-readable text (recorded, not verified) or a
// structured reference that the kernel must verify: {file} for a project file,
// {gateId} for same-run gate evidence.
export function describeReference(value){
 if(text(value))return {type:'text',target:value};
 if(plainObject(value)){
  const keys=Object.keys(value);
  if(keys.length===1&&keys[0]==='file'&&text(value.file))return {type:'file',target:value.file};
  if(keys.length===1&&keys[0]==='gateId'&&text(value.gateId))return {type:'gate',target:value.gateId};
 }
 throw new Error('Invalid reference: expected text or {file} / {gateId}');
}

export function filledReference(value){
 try{describeReference(value);return true;}catch{return false;}
}

export function resolveReference(value,root,config,evidence){
 const reference=describeReference(value);
 if(reference.type==='text')return {...reference,status:'TEXT'};
 if(reference.type==='file'){
  const relative=path.relative(root,path.resolve(root,reference.target));
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Reference escapes project');
  try{
   const file=projectFile(root,reference.target);
   return {...reference,status:fs.statSync(file).isFile()?'FOUND':'MISSING'};
  }catch(error){
   if(error.code==='ENOENT')return {...reference,status:'MISSING'};
   throw error;
  }
 }
 const gate=config.gates.find(item=>item.id===reference.target);
 if(!gate)throw new Error(`Unknown gate reference: ${reference.target}`);
 const gateStatus=evidence.find(item=>item.gateId===reference.target)?.status??'SKIP';
 return {...reference,status:gateStatus==='PASS'?'PASS':'FAIL',gateStatus};
}

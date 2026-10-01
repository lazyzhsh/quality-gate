import fs from 'node:fs';import {projectFile} from './kernel.mjs';
import {isDeepStrictEqual} from 'node:util';
const text=v=>typeof v==='string'&&v.trim().length>0,object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v),check=(ok,msg)=>{if(!ok)throw new Error(msg);};
const flatten=(value,prefix='',out=Object.create(null))=>{for(const [key,item] of Object.entries(value)){const p=prefix?`${prefix}.${key}`:key;if(object(item)&&Object.keys(item).length)flatten(item,p,out);else out[p]=item;}return out;};
export function validateConfiguration(g){check(g.level==='L5'&&object(g.files)&&Object.keys(g.files).length>=2&&Object.values(g.files).every(text)&&Array.isArray(g.allowedDifferences)&&g.allowedDifferences.every(text),'configuration requires L5, two environment files and allowedDifferences');}
// allowedDifferences 支持点分段通配（* 匹配一段，如 features.*.enabled）
const matchesKey=(key,pattern)=>{
 const segments=String(key).split('.');
 const expected=String(pattern).split('.');
 return segments.length===expected.length&&expected.every((segment,index)=>segment==='*'||segment===segments[index]);
};
export function runConfiguration(g,root){
 const environments=Object.entries(g.files).map(([name,file])=>{const data=JSON.parse(fs.readFileSync(projectFile(root,file),'utf8'));check(object(data),`Invalid config: ${name}`);return {name,file,values:flatten(data)};});
 const base=environments[0],findings=[];
 for(const env of environments.slice(1)){
  for(const key of new Set([...Object.keys(base.values),...Object.keys(env.values)])){
   const a=base.values[key],b=env.values[key];
   const safe=value=>/secret|password|token|apiKey/i.test(key)&&value!==undefined?'[redacted]':value??null;
   const declared=g.allowedDifferences.some(pattern=>matchesKey(key,pattern));
   if(!Object.hasOwn(base.values,key)||!Object.hasOwn(env.values,key))findings.push({environment:env.name,path:key,rule:'missing-key',baseline:safe(a),actual:safe(b)});
   else if((a===null?'null':Array.isArray(a)?'array':typeof a)!==(b===null?'null':Array.isArray(b)?'array':typeof b))findings.push({environment:env.name,path:key,rule:'type-mismatch',baseline:a===null?'null':Array.isArray(a)?'array':typeof a,actual:b===null?'null':Array.isArray(b)?'array':typeof b});
   else if(!isDeepStrictEqual(a,b)&&!declared)findings.push({environment:env.name,path:key,rule:'undeclared-difference',baseline:safe(a),actual:safe(b)});
  }
 }
 for(const env of environments)for(const [key,value] of Object.entries(env.values))if(/secret|password|token|apiKey/i.test(key)&&typeof value==='string'&&!value.startsWith('ref:'))findings.push({environment:env.name,path:key,rule:'literal-secret',actual:'[redacted]'});
 return {status:findings.length?'FAIL':'PASS',details:{environments:environments.map(e=>({name:e.name,file:e.file,keyCount:Object.keys(e.values).length})),allowedDifferences:g.allowedDifferences,findings}};
}

import {isDeepStrictEqual} from 'node:util';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const pointer=(base,key)=>`${base}/${String(key).replaceAll('~','~0').replaceAll('/','~1')}`;

// 深比较差异：按 JSON Pointer 输出 missing/unexpected/mismatch 三类差异。
export function diff(expected,actual,at=''){
 if(isDeepStrictEqual(expected,actual))return [];
 if(object(expected)&&object(actual))return [...new Set([...Object.keys(expected),...Object.keys(actual)])].sort().flatMap(key=>{
  const current=pointer(at,key);
  if(!Object.hasOwn(expected,key))return [{path:current,rule:'unexpected',actual:actual[key]}];
  if(!Object.hasOwn(actual,key))return [{path:current,rule:'missing',expected:expected[key]}];
  return diff(expected[key],actual[key],current);
 });
 if(Array.isArray(expected)&&Array.isArray(actual)){
  const out=[];
  for(let index=0;index<Math.max(expected.length,actual.length);index++){
   const current=pointer(at,index);
   if(index>=expected.length)out.push({path:current,rule:'unexpected',actual:actual[index]});
   else if(index>=actual.length)out.push({path:current,rule:'missing',expected:expected[index]});
   else out.push(...diff(expected[index],actual[index],current));
  }
  return out;
 }
 return [{path:at||'/',rule:'mismatch',expected,actual}];
}

// ignorePaths 模式匹配：'*' 匹配一段；段数须一致。豁免只作用于声明的路径。
export const matchesPointer=(pointerValue,pattern)=>{
 const segments=String(pointerValue).split('/');
 const expected=pattern.split('/');
 return segments.length===expected.length&&expected.every((segment,index)=>segment==='*'||segment===segments[index]);
};

export function filterDifferences(differences,ignorePaths){
 if(!ignorePaths)return {differences:[...differences],ignoredDifferences:[]};
 const ignoredDifferences=differences.filter(difference=>ignorePaths.some(pattern=>matchesPointer(difference.path,pattern)));
 return {differences:differences.filter(difference=>!ignoredDifferences.includes(difference)),ignoredDifferences};
}

export function validateIgnorePaths(value,label){
 if(value===undefined)return;
 if(!(Array.isArray(value)&&value.length>0&&value.length<=50&&value.every(pattern=>typeof pattern==='string'&&pattern.trim().length>0&&pattern.startsWith('/')&&!pattern.includes('\\')&&!pattern.includes('\0'))))throw new Error(`Invalid ${label}`);
}

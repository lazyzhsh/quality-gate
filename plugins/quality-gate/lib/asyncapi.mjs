// AsyncAPI 3.0 JSON subset. No network, broker client, or schema-library dependency.
// Unsupported semantics fail closed; annotations do not participate in validation.
import {isDeepStrictEqual} from 'node:util';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=v=>typeof v==='string'&&v.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(`AsyncAPI: ${message}`);};
const ptr=(base,key)=>`${base}/${String(key).replaceAll('~','~0').replaceAll('/','~1')}`;
const annotations=['title','summary','description','tags','externalDocs'];
function keys(value,allowed,where){
 check(object(value),`object required at ${where}`);
 for(const key of Object.keys(value))check(allowed.includes(key),`unsupported ${key} at ${where}`);
}
function reference(ref,where){
 check(object(ref)&&Object.keys(ref).length===1&&text(ref.$ref)&&ref.$ref.startsWith('#/'),`local $ref required at ${where}`);
 return ref.$ref.slice(2).split('/').map(token=>{
  check(!/~(?![01])/u.test(token)&&!token.includes('%'),`invalid reference token at ${where}`);
  return token.replaceAll('~1','/').replaceAll('~0','~');
 });
}
const typeMatches=(type,value)=>({object:object(value),array:Array.isArray(value),string:typeof value==='string',number:typeof value==='number'&&Number.isFinite(value),integer:Number.isSafeInteger(value),boolean:typeof value==='boolean',null:value===null})[type]===true;

export function extractEventContract(doc){
 keys(doc,['asyncapi','info','id','defaultContentType','channels','operations','components',...annotations],'document');
 check(/^3\.0\.\d+$/.test(doc.asyncapi??''),'supported version is 3.0.x JSON');
 check(object(doc.info)&&text(doc.info.title)&&text(doc.info.version),'info.title and info.version required');
 check(doc.defaultContentType===undefined||text(doc.defaultContentType),'defaultContentType must be a nonempty string');
 check(object(doc.channels)&&Object.keys(doc.channels).length>0,'nonempty channels required');
 check(object(doc.operations)&&Object.keys(doc.operations).length>0,'nonempty operations required');
 if(doc.components!==undefined)keys(doc.components,['schemas','messages','channels','operations'],'components');
 let nodes=0;
 function resolve(value,group,where,seen=[]){
  check(object(value),`object required at ${where}`);
  if(!Object.hasOwn(value,'$ref'))return {value,seen};
  const tokens=reference(value,where);
  check(tokens.length===3&&tokens[0]==='components'&&tokens[1]===group,`only #/components/${group}/name references supported at ${where}`);
  check(!seen.includes(value.$ref)&&seen.length<16,`cyclic or excessive reference at ${where}`);
  check(object(doc.components?.[group])&&Object.hasOwn(doc.components[group],tokens[2]),`missing reference ${value.$ref} at ${where}`);
  return resolve(doc.components[group][tokens[2]],group,where,[...seen,value.$ref]);
 }
 function schema(input,where,seen=[],depth=0){
  check(++nodes<=1000&&depth<=12,`schema expansion limit at ${where}`);
  const resolved=resolve(input,'schemas',where,seen);
  const s=resolved.value;
  keys(s,['type','properties','required','additionalProperties','items','enum','minimum','maximum','minLength','maxLength','minItems','maxItems','title','description','examples','default'],where);
  check(['object','array','string','number','integer','boolean','null'].includes(s.type),`explicit supported type required at ${where}`);
  const out={type:s.type};
  if(s.enum!==undefined){
   check(Array.isArray(s.enum)&&s.enum.length>0&&s.enum.length<=100&&s.enum.every(v=>typeMatches(s.type,v)),`invalid enum at ${where}`);
   check(s.enum.every((v,i)=>!s.enum.slice(0,i).some(other=>isDeepStrictEqual(other,v))),`duplicate enum at ${where}`);
   out.enum=s.enum;
  }
  for(const [low,high,type] of [['minimum','maximum','number'],['minLength','maxLength','string'],['minItems','maxItems','array']]){
   if(s[low]===undefined&&s[high]===undefined)continue;
   check(s.type===type||(type==='number'&&s.type==='integer'),`${low}/${high} incompatible with type at ${where}`);
   for(const key of [low,high])if(s[key]!==undefined){
    check(typeof s[key]==='number'&&Number.isFinite(s[key])&&(type==='number'||(Number.isSafeInteger(s[key])&&s[key]>=0)),`invalid ${key} at ${where}`);
    out[key]=s[key];
   }
   check(s[low]===undefined||s[high]===undefined||s[low]<=s[high],`reversed ${low}/${high} at ${where}`);
  }
  if(s.type==='object'){
   check(s.items===undefined,`items on object at ${where}`);
   check(s.properties===undefined||object(s.properties),`invalid properties at ${where}`);
   const properties=s.properties??{};
   check(Object.keys(properties).length<=100,`too many properties at ${where}`);
   check(s.required===undefined||(Array.isArray(s.required)&&s.required.every(text)&&new Set(s.required).size===s.required.length&&s.required.every(k=>Object.hasOwn(properties,k))),`required must name unique declared properties at ${where}`);
   check(s.additionalProperties===undefined||typeof s.additionalProperties==='boolean',`additionalProperties must be boolean at ${where}`);
   out.properties=Object.fromEntries(Object.keys(properties).sort().map(key=>[key,schema(properties[key],ptr(where,key),resolved.seen,depth+1)]));
   out.required=[...(s.required??[])].sort();
   out.additionalProperties=s.additionalProperties??true;
  }else{
   check(s.properties===undefined&&s.required===undefined&&s.additionalProperties===undefined,`object keywords on ${s.type} at ${where}`);
   if(s.type==='array')out.items=schema(s.items,`${where}/items`,resolved.seen,depth+1);
   else check(s.items===undefined,`items on ${s.type} at ${where}`);
  }
  return out;
 }
 const channels=new Map();
 for(const [id,input] of Object.entries(doc.channels)){
  check(text(id),'empty channel id');
  const c=resolve(input,'channels',`channels/${id}`).value;
  keys(c,['address','messages',...annotations],`channels/${id}`);
  check(text(c.address)&&!/[{}]/u.test(c.address),`literal channel address required at channels/${id}`);
  check(object(c.messages)&&Object.keys(c.messages).length>0,`nonempty messages required at channels/${id}`);
  const messages=new Map();
  for(const [messageId,inputMessage] of Object.entries(c.messages)){
   check(text(messageId),`empty message id at channels/${id}`);
   const where=`channels/${id}/messages/${messageId}`;
   const m=resolve(inputMessage,'messages',where).value;
   keys(m,['name','contentType','payload','headers','examples',...annotations],where);
   const contentType=m.contentType??doc.defaultContentType;
   check(contentType==='application/json',`application/json contentType required at ${where}`);
   const payload=schema(m.payload,`${where}/payload`);
   const headers=m.headers===undefined?undefined:schema(m.headers,`${where}/headers`);
   check(headers===undefined||headers.type==='object',`headers must be object at ${where}`);
   messages.set(messageId,{contentType,payload,...(headers?{headers}:{})});
  }
  channels.set(id,{address:c.address,messages});
 }
 const used=new Set();
 const items=[];
 for(const operationId of Object.keys(doc.operations).sort()){
  check(text(operationId),'empty operation id');
  const where=`operations/${operationId}`;
  const op=resolve(doc.operations[operationId],'operations',where).value;
  keys(op,['action','channel','messages',...annotations],where);
  check(['send','receive'].includes(op.action),`send/receive action required at ${where}`);
  const channelTokens=reference(op.channel,`${where}/channel`);
  check(channelTokens.length===2&&channelTokens[0]==='channels'&&channels.has(channelTokens[1]),`operation must reference a root channel at ${where}`);
  const channelId=channelTokens[1], channel=channels.get(channelId);
  check(Array.isArray(op.messages)&&op.messages.length>0,`explicit nonempty messages required at ${where}`);
  const messageIds=op.messages.map((ref,index)=>{
   const tokens=reference(ref,`${where}/messages/${index}`);
   check(tokens.length===4&&tokens[0]==='channels'&&tokens[1]===channelId&&tokens[2]==='messages'&&channel.messages.has(tokens[3]),`message must reference this channel's message at ${where}`);
   return tokens[3];
  });
  check(new Set(messageIds).size===messageIds.length,`duplicate message reference at ${where}`);
  for(const messageId of messageIds.sort()){
   used.add(JSON.stringify([channelId,messageId]));
   items.push({operationId,action:op.action,channel:channel.address,messageId,...channel.messages.get(messageId)});
  }
 }
 check(items.length<=100,'at most 100 operation-message pairs supported');
 for(const [id,c] of channels)for(const messageId of c.messages.keys())check(used.has(JSON.stringify([id,messageId])),`uncovered root channel message ${id}/${messageId}`);
 return {kind:'event',items};
}

function schemaDifferences(s,value,at){
 if(!typeMatches(s.type,value))return [{path:at,rule:'event-type',expected:s.type,actual:value}];
 const out=[];
 const add=(key,expected,actual)=>out.push({path:at,rule:`event-${key}`,expected,actual});
 if(s.enum&&!s.enum.some(v=>isDeepStrictEqual(v,value)))add('enum',s.enum,value);
 for(const [low,high,count] of [['minimum','maximum',value],['minLength','maxLength',typeof value==='string'?[...value].length:undefined],['minItems','maxItems',Array.isArray(value)?value.length:undefined]]){
  if(s[low]!==undefined&&count<s[low])add(low,s[low],count);
  if(s[high]!==undefined&&count>s[high])add(high,s[high],count);
 }
 if(s.type==='object'){
  for(const key of s.required)if(!Object.hasOwn(value,key))out.push({path:ptr(at,key),rule:'event-required',expected:'present'});
  for(const [key,v] of Object.entries(value)){
   if(Object.hasOwn(s.properties,key))out.push(...schemaDifferences(s.properties[key],v,ptr(at,key)));
   else if(!s.additionalProperties)out.push({path:ptr(at,key),rule:'event-additional-property',actual:v});
  }
 }
 if(s.type==='array')value.forEach((v,i)=>out.push(...schemaDifferences(s.items,v,ptr(at,i))));
 return out;
}
const messageDifferences=(contract,sample,at)=>[
 ...(contract.contentType===sample.contentType?[]:[{path:`${at}/contentType`,rule:'event-content-type',expected:contract.contentType,actual:sample.contentType}]),
 ...schemaDifferences(contract.payload,sample.payload,`${at}/payload`),
 ...(contract.headers?schemaDifferences(contract.headers,sample.headers,`${at}/headers`):[])
];

export function compareEventSamples(expected,samples){
 check(Array.isArray(samples)&&samples.length<=1000,'items must be an array of at most 1000 event samples');
 const covered=new Set(), differences=[];
 samples.forEach((sample,index)=>{
  const at=`/items/${index}`;
  keys(sample,['operationId','action','channel','messageId','contentType','payload','headers'],at);
  check(['operationId','action','channel','messageId','contentType'].every(key=>text(sample[key]))&&['send','receive'].includes(sample.action)&&Object.hasOwn(sample,'payload'),`invalid event envelope at ${at}`);
  check(sample.headers===undefined||object(sample.headers),`headers must be an object at ${at}`);
  const contract=expected.items.find(c=>c.operationId===sample.operationId&&c.messageId===sample.messageId);
  if(!contract){differences.push({path:at,rule:'event-unexpected-message',actual:{operationId:sample.operationId,messageId:sample.messageId}});return;}
  covered.add(JSON.stringify([contract.operationId,contract.messageId]));
  for(const key of ['action','channel'])if(contract[key]!==sample[key])differences.push({path:`${at}/${key}`,rule:`event-${key}`,expected:contract[key],actual:sample[key]});
  differences.push(...messageDifferences(contract,sample,at));
  const matches=expected.items.filter(c=>c.operationId===sample.operationId&&messageDifferences(c,sample,at).length===0);
  if(matches.length>1)differences.push({path:at,rule:'event-ambiguous-message',expected:'exactly one matching message',actual:matches.map(c=>c.messageId)});
 });
 for(const contract of expected.items)if(!covered.has(JSON.stringify([contract.operationId,contract.messageId])))differences.push({path:ptr(ptr('/operations',contract.operationId),contract.messageId),rule:'event-missing-message',expected:'at least one sample this run'});
 return differences;
}

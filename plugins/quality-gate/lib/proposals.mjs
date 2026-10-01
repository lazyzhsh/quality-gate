import fs from 'node:fs';
import {validate,projectFile} from './kernel.mjs';
const text=v=>typeof v==='string'&&v.trim().length>0;
const check=(ok,message)=>{if(!ok)throw new Error(message);};
// 提案-确认-pin 工作流的离线登记审计：LLM/匹配工具只产出提案（proposed），人工
// 接受（accepted）后必须由维护者把对应映射写进 .quality-gate.json 的 mappings，
// semantic-alignment 始终只核对 pinned 声明——门禁不读取本登记文件，
// confidence 不构成证据。本模块只报告"已接受但未 pin"的漂移。
export function validateProposals(data){
 check(data?.schemaVersion==='0.1'&&Array.isArray(data.proposals)&&data.proposals.length<=200,'Invalid proposals registry');
 check(data.proposals.every(p=>p!==null&&typeof p==='object'&&text(p.id)&&text(p.symbol)&&text(p.candidateIri)&&typeof p.confidence==='number'&&Number.isFinite(p.confidence)&&p.confidence>=0&&p.confidence<=1&&text(p.source)&&['proposed','accepted','rejected'].includes(p.status)&&(!('note'in p)||text(p.note))),'Invalid proposal entry');
 check(new Set(data.proposals.map(p=>p.id)).size===data.proposals.length,'Duplicate proposal id');
 return data;
}
export function proposalReport(config,proposals){
 const pinned=new Set();
 for(const gate of config.gates??[])if(gate.kind==='semantic-alignment')for(const mapping of gate.mappings??[])pinned.add(`${mapping.symbol}\0${mapping.expectedIri}`);
 const byStatus={proposed:0,accepted:0,rejected:0};
 const drift=[];
 for(const proposal of proposals.proposals){
  byStatus[proposal.status]++;
  if(proposal.status==='accepted'&&!pinned.has(`${proposal.symbol}\0${proposal.candidateIri}`))drift.push({proposalId:proposal.id,symbol:proposal.symbol,candidateIri:proposal.candidateIri,reason:'accepted-not-pinned'});
 }
 return {schemaVersion:'0.1',proposalCount:proposals.proposals.length,byStatus,pinnedMappingCount:pinned.size,drift};
}
export function runProposalAudit(root,file='ontology-proposals.json'){
 const config=validate(JSON.parse(fs.readFileSync(projectFile(root,'.quality-gate.json'),'utf8').replace(/^\uFEFF/,'')));
 const proposals=validateProposals(JSON.parse(fs.readFileSync(projectFile(root,file),'utf8').replace(/^\uFEFF/,'')));
 return proposalReport(config,proposals);
}

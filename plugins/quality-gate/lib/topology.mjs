import fs from 'node:fs';
import {projectFile} from './kernel.mjs';

const text=v=>typeof v==='string'&&v.trim().length>0;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const STATE_MODELS=['stateless','consensus','standby'];
const LAYERS=['realtime','background','batch'];
const DOMAIN_KEYS=['region','zone','host'];
const LEADER_ROLE=/^(primary|leader)$/i;

export function validateTopology(g){
 check(g.level==='L4'&&text(g.file),'topology requires L4 and file');
}

// 故障域规范化串：仅 region/zone/host 三个键、值非空，按键排序拼接——distinct 判定与
// 一阶割集的域归并都基于该串（同一集合的键值组合即同一域）。
const domainKey=domain=>{
 check(object(domain)&&Object.keys(domain).length>0&&Object.keys(domain).length<=3&&Object.keys(domain).every(key=>DOMAIN_KEYS.includes(key)&&text(domain[key])),'Invalid failureDomain');
 return Object.keys(domain).sort().map(key=>`${key}=${domain[key]}`).join('\0');
};

// 纯内核拓扑语义（v1.10 主线，R1–R4）：判定只消费声明式拓扑文件——内核不信任任何
// runner 的自我评估（同 budget/rerun 先例）。核验的是**声明文件的一致性**，不是真实
// 部署拓扑（编排态推导见 RTM 候选）。
export function runTopology(g,root){
 try{
  const raw=fs.readFileSync(projectFile(root,g.file));
  check(raw.length<=65536,'Topology specification too large');
  const spec=JSON.parse(raw.toString('utf8').replace(/^\uFEFF/,''));
  check(object(spec)&&Array.isArray(spec.services)&&spec.services.length>0&&spec.services.length<=100,'Invalid topology services');
  check(new Set(spec.services.map(s=>s.name)).size===spec.services.length,'Duplicate service name');
  const services=new Map();
  for(const s of spec.services){
   check(object(s)&&text(s.name)&&LAYERS.includes(s.layer)&&typeof s.critical==='boolean'&&Number.isInteger(s.replicas)&&s.replicas>=1&&s.replicas<=100,'Invalid service declaration');
   // R2 分型：stateModel 缺省即 finding（未分型无法判阈值）；byzantine 仅 consensus 且须给 f
   check(s.stateModel===undefined||STATE_MODELS.includes(s.stateModel),'Invalid stateModel');
   check(s.faultModel===undefined||s.faultModel==='byzantine','Invalid faultModel');
   check(s.faultModel===undefined||s.stateModel==='consensus','faultModel byzantine requires stateModel consensus');
   check(s.faultModel===undefined||(Number.isInteger(s.faultTolerant)&&s.faultTolerant>=1&&s.faultTolerant<=10),'faultModel byzantine requires integer faultTolerant 1..10');
   check(s.transientLeadership===undefined||typeof s.transientLeadership==='boolean','Invalid transientLeadership');
   check(s.leaderLeaseSec===undefined||Number.isInteger(s.leaderLeaseSec)&&s.leaderLeaseSec>0,'Invalid leaderLeaseSec');
   // R1 域信息：replicaDetails 长度须等于 replicas；无域信息的关键路径服务须显式声明降级
   check(s.replicaDetails===undefined||Array.isArray(s.replicaDetails)&&s.replicaDetails.length===s.replicas,'replicaDetails length must equal replicas');
   for(const replica of s.replicaDetails??[]){
    check(object(replica)&&text(replica.role),'Invalid replicaDetails entry');
    domainKey(replica.failureDomain);
   }
   check(s.domainVerification===undefined||s.domainVerification==='unavailable','domainVerification can only be "unavailable" (explicit degradation)');
   check(s.replicaDetails===undefined||s.domainVerification===undefined,'replicaDetails and domainVerification are mutually exclusive');
   check(s.dependencies===undefined||Array.isArray(s.dependencies)&&s.dependencies.length<=50,'Invalid dependencies');
   for(const dependency of s.dependencies??[]){
    check(object(dependency)&&text(dependency.name)&&Number.isInteger(dependency.instances)&&dependency.instances>=1,'Invalid dependency declaration');
   }
   services.set(s.name,s);
  }
  for(const s of spec.services)for(const dependency of s.dependencies??[]){
   const target=services.get(dependency.name);
   check(target,`Unknown dependency service: ${dependency.name}`);
   check(dependency.name!==s.name,'Self dependency');
   check(dependency.instances<=target.replicas,`Dependency instances exceed target replicas: ${s.name} → ${dependency.name}`);
  }
  // 必存活集合：critical 服务 + 被 critical 服务依赖的服务（共享依赖天然并入）
  const mustSurvive=new Set(spec.services.filter(s=>s.critical).map(s=>s.name));
  for(const s of spec.services)if(s.critical)for(const dependency of s.dependencies??[])mustSurvive.add(dependency.name);
  const hasDomainData=s=>Array.isArray(s.replicaDetails);
  const domainsOf=s=>s.replicaDetails.map(replica=>domainKey(replica.failureDomain));
  const findings=[],degradations=[];
  const mustSurviveWithoutData=[];
  for(const name of mustSurvive){
   const s=services.get(name);
   if(hasDomainData(s))continue;
   if(s.domainVerification==='unavailable')degradations.push({rule:'failureDomainsUnverified',service:name});
   else{findings.push({rule:'failureDomainsUndeclared',service:name});mustSurviveWithoutData.push(name);}
  }
  // R1：关键服务自身副本与关键依赖的故障域 distinct >= 2
  for(const s of spec.services.filter(x=>x.critical&&hasDomainData(x))){
   if(new Set(domainsOf(s)).size<2)findings.push({rule:'domainSpread',service:s.name,distinctDomains:new Set(domainsOf(s)).size,replicas:s.replicas});
   for(const dependency of s.dependencies??[]){
    const target=services.get(dependency.name);
    if(!hasDomainData(target)||mustSurviveWithoutData.includes(dependency.name))continue;
    if(new Set(domainsOf(target)).size<2)findings.push({rule:'dependencyDomainSpread',service:s.name,dependency:dependency.name,distinctDomains:new Set(domainsOf(target)).size});
   }
  }
  // R2：副本阈值按状态模型分型——stateless≥2 / consensus≥3 且奇数 / standby≥3 / byzantine≥3f+1
  for(const s of spec.services.filter(x=>x.critical)){
   if(s.stateModel===undefined){findings.push({rule:'stateModelUndeclared',service:s.name});continue;}
   const thresholds={stateless:2,consensus:3,standby:3};
   if(s.replicas<thresholds[s.stateModel])findings.push({rule:'replicaThreshold',service:s.name,stateModel:s.stateModel,replicas:s.replicas,min:thresholds[s.stateModel]});
   if(s.stateModel==='consensus'&&s.replicas%2===0)findings.push({rule:'consensusReplicasEven',service:s.name,replicas:s.replicas,note:'even replicas waste a vote in majority quorums'});
   if(s.faultModel==='byzantine'&&s.replicas<3*s.faultTolerant+1)findings.push({rule:'byzantineQuorum',service:s.name,replicas:s.replicas,required:3*s.faultTolerant+1,faultTolerant:s.faultTolerant});
  }
  // R3：一阶最小割集（max:0 严格等价"无单点"）——节点侧（必存活服务全部副本同域/单副本）
  // 与边侧（critical 依赖 instances=1）；二阶割集仅计数登记不阻断。
  const minCutOrder1=[];
  for(const name of mustSurvive){
   const s=services.get(name);
   if(!hasDomainData(s))continue;
   const domains=domainsOf(s);
   const distinct=[...new Set(domains)];
   if(s.replicas===1)minCutOrder1.push({service:name,domain:'single-replica'});
   else if(distinct.length===1)minCutOrder1.push({service:name,domain:distinct[0]});
  }
  for(const s of spec.services.filter(x=>x.critical))for(const dependency of s.dependencies??[]){
   if(dependency.instances===1)minCutOrder1.push({service:s.name,dependency:dependency.name,domain:'single-instance'});
  }
  let minCutOrder2Count=0;
  for(const name of mustSurvive){
   const s=services.get(name);
   if(!hasDomainData(s))continue;
   const domains=domainsOf(s);
   const distinct=[...new Set(domains)];
   if(distinct.length<2)continue;
   for(let i=0;i<distinct.length;i++)for(let j=i+1;j<distinct.length;j++){
    if(domains.every(domain=>domain===distinct[i]||domain===distinct[j]))minCutOrder2Count++;
   }
  }
  // R4：平等判定——role 集合须对称（全同）或存在 leader 语义（须声明可轮转+租约）；
  // standby 状态模型天然含 primary，即使无逐副本数据也要求轮转字段
  for(const s of spec.services){
   const roles=hasDomainData(s)?s.replicaDetails.map(replica=>replica.role):[];
   const allSame=roles.length>0&&new Set(roles).size===1;
   const hasLeader=roles.some(role=>LEADER_ROLE.test(role))||s.stateModel==='standby';
   if(hasDomainData(s)&&!allSame&&!hasLeader)findings.push({rule:'asymmetricRoles',service:s.name,roles:[...new Set(roles)]});
   if(hasLeader){
    const missing=[];
    if(s.transientLeadership!==true)missing.push('transientLeadership');
    if(s.leaderLeaseSec===undefined)missing.push('leaderLeaseSec');
    if(missing.length)findings.push({rule:'permanentPrimary',service:s.name,missing});
   }
  }
  return {status:findings.length||minCutOrder1.length?'FAIL':'PASS',details:{file:g.file,serviceCount:spec.services.length,mustSurvive:[...mustSurvive].sort(),...(degradations.length?{degradations}:{}),findings,minCutOrder1Count:minCutOrder1.length,minCutOrder1,minCutOrder2Count}};
 }catch(error){return {status:'ERROR',details:{file:g.file,error:error.message}};}
}

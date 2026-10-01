import {spawnSync} from 'node:child_process';

// 框架识别并预检的外部工具登记表：新增强前置依赖时在此登记（含安装指引），
// SessionStart 提示、摘要与报告会自动引用。项目自定义工具（eslint、tsc 等）
// 不做预检，由各 runner 自行报错——内核不执行未知命令。
export const KNOWN_TOOLS={
 git:{probe:['--version'],hint:'Git is required by the change-scope gate and the symbol-grounding gate (changed-files mode)',url:'https://git-scm.com/downloads'},
 python:{probe:['--version'],hint:'Python 3.10+ (stdlib only) is used by several demo runners',url:'https://www.python.org/downloads/'},
 python3:{probe:['--version'],hint:'Python 3.10+ (stdlib only) is used by several demo runners',url:'https://www.python.org/downloads/'},
 py:{probe:['--version'],hint:'The Windows Python launcher can replace python/python3',url:'https://www.python.org/downloads/'},
 chrome:{probe:['--version'],hint:'Chrome headless is used by the visual-browser reference adapter (adapters/visual/screenshot.mjs)',url:'https://www.google.com/chrome/'},
 msedge:{probe:['--version'],hint:'Edge headless is used by the visual-browser reference adapter (adapters/visual/screenshot.mjs)',url:'https://www.microsoft.com/edge'}
};

const registryCommand=value=>typeof value==='string'&&value.trim().length>0&&value!=='$NODE'&&!/[\\/]/.test(value);

// 从配置静态推导所需外部命令：change-scope 恒需 git；runner argv 首参为登记表内的
// 裸命令名时记为该工具的使用方。绝对路径与 $NODE 不算外部依赖。
export function scanConfigDependencies(config){
 const usedBy=new Map();
 const record=(tool,gateId)=>{
  if(!Object.hasOwn(KNOWN_TOOLS,tool))return;
  const gateIds=usedBy.get(tool)??[];
  if(!gateIds.includes(gateId))gateIds.push(gateId);
  usedBy.set(tool,gateIds);
 };
 for(const gate of config.gates??[]){
  if(gate.kind==='change-scope'||(gate.kind==='symbol-grounding'&&(gate.check??'changed-files')!=='all'))record('git',gate.id);
  const argvs=[gate.argv,...(gate.checks??[]).map(check=>check.argv),...(gate.coverage?.argv?[gate.coverage.argv]:[])];
  for(const argv of argvs)if(Array.isArray(argv)&&registryCommand(argv[0]))record(argv[0],gate.id);
 }
 return [...usedBy.entries()].map(([tool,gateIds])=>({tool,gateIds}));
}

export function probeExecutable(name,args){
 const result=spawnSync(name,args,{shell:false,encoding:'utf8',timeout:5000,windowsHide:true});
 if(result.error&&result.error.code==='ENOENT')return false;
 // Windows 商店的 python 别名桩：文件存在但退出码 9009 并提示从商店安装
 if(process.platform==='win32'&&result.status===9009&&/Python was not found/i.test(`${result.stdout??''}${result.stderr??''}`))return false;
 return true;
}

export function dependencyReport(config){
 const required=scanConfigDependencies(config).map(item=>({...item,available:probeExecutable(item.tool,KNOWN_TOOLS[item.tool].probe)}));
 const missing=required.filter(item=>!item.available).map(item=>({...item,hint:KNOWN_TOOLS[item.tool].hint,url:KNOWN_TOOLS[item.tool].url}));
 return {required,missing};
}

export function formatDependencyHints(report){
 return report.missing.map(item=>`missing dependency '${item.tool}' (used by gate(s) ${item.gateIds.join(', ')}): ${item.hint}; install guide: ${item.url}`);
}

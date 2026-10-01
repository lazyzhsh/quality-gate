#!/usr/bin/env node
// qgate engineering unit 参考 runner（Java 形态，E7）：surefire/gradle 测试报告合并器。
//
// 用法（engineering unit check 的 argv）:
//   ["$NODE", "adapters/java/merge-junit.mjs", "target/surefire-reports"]
//   ["$NODE", "adapters/java/merge-junit.mjs", "build/test-results/test"]   // gradle 默认
//
// 语义:surefire/gradle 每个测试类各产一份 TEST-*.xml(JUnit XML),本 runner 把指定目录下
// 全部报告合并为单文件 build/qgate-junit-merged.xml(<testsuites> 包裹逐 <testsuite>),
// 复用内核解析器 lib/raw-evidence.mjs 对合并结果自检计数并自报,同时声明 rawOutput——
// 内核(B1)会独立解析同一文件重算计数并交叉核验。stdin 收 qgate 请求并回显 runId;
// 恒以退出码 0 结束(观察协议,测试失败由内核判定)。
// 边界(如实):无 JDK 环境下本 runner 以样例 surefire XML(按 schema 手写)验证,未在真实
// Maven/Gradle 构建链上实测;不声称已验证真实构建工具链。
import fs from 'node:fs';
import path from 'node:path';
import {parseRawOutput} from '../../lib/raw-evidence.mjs';

let input='';
for await(const chunk of process.stdin)input+=chunk;
const request=JSON.parse(input);
const reportDirs=process.argv.slice(2);
if(reportDirs.length===0){
 console.error('usage: merge-junit.mjs <surefire-or-gradle-report-dir> [...]');
 process.exit(2);
}
const suiteBlocks=[];
for(const dir of reportDirs){
 const entries=fs.readdirSync(dir).filter(name=>name.startsWith('TEST-')&&name.endsWith('.xml')).sort();
 for(const name of entries){
  const text=fs.readFileSync(path.join(dir,name),'utf8');
  const matches=text.match(/<testsuite\b[\s\S]*?<\/testsuite>/g)??[];
  if(matches.length===0)throw new Error(`no <testsuite> block in ${name}`);
  suiteBlocks.push(...matches);
 }
}
if(suiteBlocks.length===0)throw new Error(`no TEST-*.xml reports under ${reportDirs.join(', ')}`);
fs.mkdirSync('build',{recursive:true});
const mergedPath='build/qgate-junit-merged.xml';
fs.writeFileSync(mergedPath,`<?xml version="1.0" encoding="UTF-8"?><testsuites name="qgate-merged">${suiteBlocks.join('')}</testsuites>`);
const parsed=parseRawOutput('junit',fs.readFileSync(mergedPath,'utf8'));
console.log(JSON.stringify({
 schemaVersion:'0.1',
 runId:request.runId,
 source:'adapters/java/merge-junit.mjs (surefire/gradle TEST-*.xml)',
 total:parsed.total,
 passed:parsed.passed,
 failed:parsed.failed,
 skipped:parsed.skipped,
 rawOutput:{format:'junit',file:mergedPath},
}));

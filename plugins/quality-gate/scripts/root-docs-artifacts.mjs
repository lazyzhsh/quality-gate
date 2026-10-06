#!/usr/bin/env node
// 根项目入口文档制品回报（根配置 G-DOCS documentation 门禁的 runner）。
// 统一观察协议：stdin {schemaVersion,runId} → stdout 回带同一 runId 的 artifacts 观察。
// 版本取自插件 package.json（发行单一事实源）；制品路径相对项目根（runner 在项目根运行）。
import { readFileSync } from 'node:fs';

let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const req = JSON.parse(raw);
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const artifacts = [
  { role: 'user', path: 'README.md', version, topics: ['Quality Gate'] },
  { role: 'operator', path: 'PROJECT-HANDOFF.md', version, topics: ['Quality Gate'] },
  { role: 'api', path: 'docs/PRD.md', version, topics: ['Quality Gate'] },
  { role: 'code', path: 'plugins/quality-gate/README.md', version, topics: ['Quality Gate'] },
];
process.stdout.write(JSON.stringify({
  schemaVersion: '0.1',
  runId: req.runId,
  source: 'root-docs-artifacts.mjs（入口文档静态清单；版本＝plugins/quality-gate/package.json）',
  artifacts,
}));

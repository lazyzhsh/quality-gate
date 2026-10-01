import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixture} from './fixture.mjs';
const demo=fileURLToPath(new URL('../examples/persistence-demo/',import.meta.url));
export function setup(t,mode) {
 const f=fixture(t);fs.copyFileSync(path.join(demo,'runner.py'),path.join(f.root,'runner.py'));
 f.c=JSON.parse(fs.readFileSync(path.join(demo,'.quality-gate.json'),'utf8'));
 // 单门禁聚焦：demo 配置含 3 个 persistence 门禁，本组测试只断言第一个——
 // 不聚焦时每轮 run() 会连带执行 idempotency/rejection（各再起一次 HTTP+SQLite）；
 // risks/exceptions 同批级联清理（同 templates disable 语义），否则 validate 拒绝
 f.c.gates=[f.c.gates[0]];
 f.c.risks=(f.c.risks??[]).filter(r=>r.gateId===f.c.gates[0].id);
 f.c.exceptions=(f.c.exceptions??[]).filter(e=>e.gateId===f.c.gates[0].id);
 f.c.gates[0].argv=[process.env.QGATE_PYTHON??'python','runner.py',mode];
 fs.writeFileSync(path.join(f.root,'.quality-gate.json'),JSON.stringify(f.c));return f;
}

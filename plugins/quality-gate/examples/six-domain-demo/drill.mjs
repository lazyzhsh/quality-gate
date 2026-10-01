import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'qgate-rollback-'));
try {
 const state=path.join(dir,'state.json');
 const before=JSON.stringify({version:1,balance:100});
 fs.writeFileSync(state,before);
 fs.writeFileSync(state,JSON.stringify({version:2,balance:100}));
 fs.writeFileSync(state,before);
 if(fs.readFileSync(state,'utf8')!==before)process.exitCode=1;
 else console.log('isolated rollback drill PASS');
} finally {fs.rmSync(dir,{recursive:true,force:true});}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'expense-rollback-'));
try {
  const file=path.join(dir,'config.json');
  const before=fs.readFileSync('config.example.json');
  fs.writeFileSync(file,before);
  fs.writeFileSync(file,JSON.stringify({...JSON.parse(before),version:'0.2.0'}));
  fs.writeFileSync(file,before);
  if(!fs.readFileSync(file).equals(before))throw new Error('rollback mismatch');
  console.log('isolated configuration rollback PASS');
} finally {fs.rmSync(dir,{recursive:true,force:true});}

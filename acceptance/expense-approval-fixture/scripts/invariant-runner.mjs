import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ClaimService} from '../src/claims.mjs';
import {FileStore} from '../src/store.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'expense-invariant-'));
try {
  const service=new ClaimService(new FileStore(directory));
  const employee={id:'alice',tenantId:'tenant-a',role:'employee'};
  service.submit({id:'claim-1',tenantId:'tenant-a',amountCents:12000,currency:'CNY'},employee);
  service.approve('claim-1',{id:'bob',tenantId:'tenant-a',role:'approver'});
  service.reimburse('claim-1',{id:'carol',tenantId:'tenant-a',role:'finance'});
  const file=path.join(directory,'claim-1.json');
  const persisted=JSON.parse(fs.readFileSync(file,'utf8'));
  const sum=side=>persisted.ledger.filter(entry=>entry.side===side).reduce((total,entry)=>total+entry.amountCents,0);
  console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'independent JSON snapshot readback after service operations',values:{status:persisted.status,debitSum:sum('debit'),creditSum:sum('credit'),amountCents:persisted.amountCents,entryCount:persisted.ledger.length}}));
} finally {fs.rmSync(directory,{recursive:true,force:true});}

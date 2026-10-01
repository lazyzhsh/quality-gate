import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ClaimService} from '../src/claims.mjs';
import {FileStore} from '../src/store.mjs';
const seed=process.argv[2]??'expense-golden-v1';
const runOnce=()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'expense-rerun-'));
  try {
    const service=new ClaimService(new FileStore(dir));
    service.submit({id:'claim-golden-001',tenantId:'tenant-a',amountCents:12000,currency:'CNY'},{id:'alice',tenantId:'tenant-a',role:'employee'});
    service.approve('claim-golden-001',{id:'bob',tenantId:'tenant-a',role:'approver'});
    const claim=service.reimburse('claim-golden-001',{id:'carol',tenantId:'tenant-a',role:'finance'});
    const snapshot={seed,id:claim.id,tenantId:claim.tenantId,employeeId:claim.employeeId,approverId:claim.approverId,amountCents:claim.amountCents,currency:claim.currency,status:claim.status,ledger:claim.ledger};
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
};
const first=runOnce(),second=runOnce();
console.log(JSON.stringify({jobs:[{id:'golden-reimbursement',hashAlgorithm:'sha256',idempotencyKeyStrategy:'claim id is the natural idempotency key; the store rejects duplicate submit ids',runs:[{seed,outputSha256:first},{seed,outputSha256:second}],doubleEntry:{debits:12000,credits:12000}}]},null,2));

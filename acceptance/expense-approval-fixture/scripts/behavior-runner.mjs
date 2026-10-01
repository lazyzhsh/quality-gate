import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ClaimService} from '../src/claims.mjs';
import {FileStore} from '../src/store.mjs';
let raw='';for await(const chunk of process.stdin)raw+=chunk;
const request=JSON.parse(raw);
function execute(testCase) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'expense-behavior-'));
  try {
    const service=new ClaimService(new FileStore(dir));
    const employee={id:'alice',tenantId:'tenant-a',role:'employee'};
    const actor={id:testCase.input.actorId??'bob',tenantId:testCase.input.tenantId??'tenant-a',role:'approver'};
    const amountCents=testCase.input.amountCents??12000;
    try {service.submit({id:'claim-1',tenantId:'tenant-a',amountCents,currency:'CNY'},employee);}
    catch(error){return {status:'rejected',reason:error.message};}
    try {service.approve('claim-1',actor);}
    catch(error){return {status:'rejected',reason:error.message};}
    if(!testCase.input.repeatApproval)return {status:'approved'};
    try {return {status:service.approve('claim-1',actor).status};}
    catch(error){return {status:'rejected',reason:error.message};}
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
}
console.log(JSON.stringify({schemaVersion:'0.1',runId:request.runId,source:'ClaimService calls in isolated temporary stores',cases:request.cases.map(testCase=>({id:testCase.id,actual:execute(testCase)}))}));

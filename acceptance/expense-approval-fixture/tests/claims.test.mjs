import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ClaimService} from '../src/claims.mjs';
import {FileStore} from '../src/store.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expense-fixture-test-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  return {service: new ClaimService(new FileStore(dir)), dir};
}
const employee = {id:'alice', tenantId:'tenant-a', role:'employee'};
const approver = {id:'bob', tenantId:'tenant-a', role:'approver'};
const finance = {id:'carol', tenantId:'tenant-a', role:'finance'};
const input = (amountCents=12000) => ({id:'claim-1', tenantId:'tenant-a', amountCents, currency:'CNY'});

test('normal submit approve reimburse produces balanced durable ledger', t => {
  const {service,dir} = fixture(t);
  service.submit(input(),employee); service.approve('claim-1',approver); service.reimburse('claim-1',finance);
  const persisted=JSON.parse(fs.readFileSync(path.join(dir,'claim-1.json'),'utf8'));
  assert.equal(persisted.status,'reimbursed');
  assert.deepEqual(persisted.ledger.map(x=>x.amountCents),[12000,12000]);
});
test('boundary approval limit accepts 100000 cents', t => {const {service}=fixture(t);service.submit(input(100000),employee);assert.equal(service.approve('claim-1',approver).status,'approved');});
test('boundary above approval limit rejects', t => {const {service}=fixture(t);service.submit(input(100001),employee);assert.throws(()=>service.approve('claim-1',approver),/above limit/);});
test('negative zero and noninteger amounts leave no record', t => {const {service,dir}=fixture(t);assert.throws(()=>service.submit(input(0),employee),/invalid amount/);assert.throws(()=>service.submit(input(1.5),employee),/invalid amount/);assert.equal(fs.readdirSync(dir).length,0);});
test('exception cross tenant read and approval reject', t => {const {service}=fixture(t);service.submit(input(),employee);const outsider={id:'eve',tenantId:'tenant-b',role:'approver'};assert.throws(()=>service.get('claim-1',outsider),/forbidden/);assert.throws(()=>service.approve('claim-1',outsider),/forbidden/);});
test('exception self approval rejects without state change', t => {const {service}=fixture(t);service.submit(input(),employee);assert.throws(()=>service.approve('claim-1',{...employee,role:'approver'}),/self approval/);assert.equal(service.get('claim-1',employee).status,'submitted');});
test('state transition blocks early reimbursement and duplicate approval', t => {const {service}=fixture(t);service.submit(input(),employee);assert.throws(()=>service.reimburse('claim-1',finance),/invalid transition/);service.approve('claim-1',approver);assert.throws(()=>service.approve('claim-1',approver),/invalid transition/);});
test('state transition blocks duplicate reimbursement', t => {const {service}=fixture(t);service.submit(input(),employee);service.approve('claim-1',approver);service.reimburse('claim-1',finance);assert.throws(()=>service.reimburse('claim-1',finance),/invalid transition/);});

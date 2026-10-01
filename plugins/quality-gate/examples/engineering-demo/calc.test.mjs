import {test} from 'node:test';
import assert from 'node:assert/strict';
const modulePath=process.env.QGATE_MODULE??new URL('./calc.mjs',import.meta.url).href;
const {fee}=await import(modulePath);
test('normal fee',()=>assert.equal(fee(100),2));
test('zero is invalid',()=>assert.equal(fee(0),null));
test('rounding boundary',()=>assert.equal(fee(101),3));
test('large amount discount rate',()=>assert.equal(fee(10000),150));

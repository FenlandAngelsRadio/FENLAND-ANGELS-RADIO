import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advertisingCredit,customerPrice} from '../src/exchange.mjs';
test('advertising credit is exactly the total voucher face value',()=>{
 assert.equal(advertisingCredit(2000,10),20000);
 assert.equal(advertisingCredit(1250,8),10000);
 assert.throws(()=>advertisingCredit(2000,0));
 assert.throws(()=>advertisingCredit(2000,1.5));
 assert.throws(()=>advertisingCredit(2147483647,2));
});
test('customer prices halve the whole-pound rounded face value; 50p rounds up',()=>{
 assert.equal(customerPrice(2000),1000);
 assert.equal(customerPrice(3000),1500);
 assert.equal(customerPrice(2049),1000);
 assert.equal(customerPrice(2050),1050);
 assert.equal(customerPrice(2051),1050);
 assert.equal(customerPrice(2075),1050);
 assert.equal(customerPrice(1251),650);
 assert.throws(()=>customerPrice(49));
 assert.throws(()=>customerPrice(0));
});

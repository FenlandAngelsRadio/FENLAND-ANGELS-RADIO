import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyPayment,bankEntry,ticketEmail,minor,isReversed} from '../supabase/functions/far-voucher-api/core.mjs';
const order={id:'order-1',checkout_id:'checkout-1',amount_minor:1500,fee_minor:25,paid_at:'2026-10-15T12:00:00Z'};
const checkout={id:'checkout-1',checkout_reference:'order-1',amount:15,currency:'GBP',merchant_code:'M1',status:'PAID',transaction_id:'tx'};
const transaction={id:'tx',amount:15,currency:'GBP',merchant_code:'M1',status:'SUCCESSFUL'};
test('payment is verified against merchant, reference, amount, currency and transaction',()=>{
 assert.equal(verifyPayment(order,checkout,transaction,'M1'),true);
 for(const delta of [{merchant_code:'wrong'},{amount:0.01},{currency:'EUR'},{checkout_reference:'other'},{id:'other'}])assert.throws(()=>verifyPayment(order,{...checkout,...delta},transaction,'M1'));
 for(const delta of [{merchant_code:'wrong'},{amount:0.01},{currency:'EUR'},{status:'FAILED'},{id:'other'}])assert.throws(()=>verifyPayment(order,checkout,{...transaction,...delta},'M1'));
 assert.equal(verifyPayment(order,{...checkout,status:'PENDING'},null,'M1'),false);
 assert.throws(()=>minor(1.001));
});
test('gross sale and fee are separate, no-VAT entries; mapping must be explicit',()=>{
 const config={company:1,bank:2,sales:3,fees:4,noVat:5,gbp:6};
 const sale=bankEntry(order,config).bank_transaction,fee=bankEntry(order,config,'pandle_fee').bank_transaction;
 assert.equal(sale.total_amount,'15.00');assert.equal(sale.type,'BankReceipt');assert.equal(sale.tax_amount,'0.00');assert.equal(fee.total_amount,'0.25');assert.equal(fee.type,'BankPayment');
 assert.throws(()=>bankEntry(order,{...config,sales:0}));
 assert.equal(bankEntry(order,config).bank_transaction.description,sale.description);
});
test('voucher email escapes business supplied text',()=>{
 const email=ticketEmail(order,{business:'<script>',title:'Cafe',code:'FAR-TEST',terms:'<img src=x>',instructions:'Show code',expires_on:'2026-12-01'},'https://example.test/?ticket=token');
 assert.ok(!email.includes('<script>'));assert.ok(email.includes('&lt;script&gt;'));assert.ok(email.includes('FAR-TEST'));
});
test('refunds and chargebacks prevent a valid voucher being issued',()=>{
 assert.equal(isReversed({simple_status:'REFUNDED'}),true);
 assert.equal(isReversed({simple_status:'CHARGEBACK'}),true);
 assert.equal(isReversed({events:[{type:'REFUND',status:'REFUNDED'}]}),true);
 assert.equal(isReversed({simple_status:'REFUND_FAILED'}),false);
 assert.throws(()=>verifyPayment(order,checkout,{...transaction,simple_status:'REFUNDED'},'M1'));
});
test('accounting follows UK calendar date across midnight in summer',()=>{
 assert.equal(bankEntry({...order,paid_at:'2026-07-01T23:30:00Z'},{company:1,bank:2,sales:3,fees:4,noVat:5,gbp:6}).bank_transaction.date,'2026-07-02');
});

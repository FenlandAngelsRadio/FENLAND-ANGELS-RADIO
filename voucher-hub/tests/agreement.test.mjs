import {test} from 'node:test';
import assert from 'node:assert/strict';
import {agreementDraft} from '../src/agreement.mjs';
test('agreement draft uses saved financial and campaign terms and remains unsigned',()=>{
 const html=agreementDraft({id:'TEST-OFFER',agreed_quantity:10,title:'Lunch <script>',face_minor:2050,sale_minor:1050,advertising_credit_minor:20500,expires_on:'2027-01-31',campaign_start:'2026-10-30',campaign_end:'2026-12-31',package_name:'Website',commitment:'Three posts',entitlement:'Lunch for two',terms:'Booking required',redemption_instructions:'Scan code'},{name:'Test Cafe',contact_email:'cafe@example.test'});
 for(const expected of ['DRAFT FOR REVIEW','NOT SIGNED','£20.50','£10.50','£205.00','2026-10-30','2026-12-31','Three posts','Lunch &lt;script&gt;'])assert.ok(html.includes(expected),expected);
 assert.ok(!html.includes('<script>'));
 assert.throws(()=>agreementDraft({},{}),/Save/);
});

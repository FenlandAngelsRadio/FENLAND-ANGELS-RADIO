export const minor = value => {
 const n=Number(value);if(!Number.isFinite(n)||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error('Invalid payment amount');return Math.round(n*100);
};
export const isReversed=t=>['REFUNDED','CHARGEBACK','CANCELLED','NON_COLLECTION'].includes(t?.simple_status)||['REFUNDED','CANCELLED'].includes(t?.status)||(t?.events||t?.transaction_events||[]).some(e=>['REFUND','CHARGE_BACK'].includes(e.type)&&['REFUNDED','SUCCESSFUL'].includes(e.status));
export function verifyPayment(order,checkout,transaction,merchant){
 if(checkout.id!==order.checkout_id || checkout.checkout_reference!==order.id || minor(checkout.amount)!==order.amount_minor || checkout.currency!=='GBP' || checkout.merchant_code!==merchant)throw Error('Checkout does not match the order');
 if(checkout.status!=='PAID')return false;
 if(!transaction || transaction.id!==checkout.transaction_id || transaction.merchant_code!==merchant || transaction.status!=='SUCCESSFUL' || isReversed(transaction) || transaction.currency!=='GBP' || minor(transaction.amount)!==order.amount_minor)throw Error('Transaction could not be verified');
 return true;
}
export function bankEntry(order,config,kind='pandle_sale'){
 const fee=kind==='pandle_fee';
 const amount=fee?order.fee_minor:order.amount_minor;
 if(!Number.isInteger(amount)||amount<=0)throw Error('Accounting amount unavailable');
 for(const k of ['company','bank','noVat','gbp',fee?'fees':'sales'])if(!Number.isSafeInteger(config[k])||config[k]<=0)throw Error('Accounting mapping is incomplete');
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(order.paid_at));
 const part=k=>parts.find(p=>p.type===k).value;
 return {bank_transaction:{date:`${part('year')}-${part('month')}-${part('day')}`,description:`FAR voucher ${fee?'fee':'sale'} ${order.id}`,type:fee?'BankPayment':'BankReceipt',tax_code_id:config.noVat,net_amount:(amount/100).toFixed(2),tax_amount:'0.00',total_amount:(amount/100).toFixed(2),bank_account_id:config.bank,account_type:'NominalAccount',account_id:fee?config.fees:config.sales,is_split:false,currency_id:config.gbp,conversion_rate:'1.0',company_id:config.company}};
}
export const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function ticketEmail(order,ticket,url){
 return `<h1>Your FAR voucher</h1><p>${escapeHtml(ticket.business)} — ${escapeHtml(ticket.title)}</p><p>${escapeHtml(ticket.entitlement)}</p><p><strong>${escapeHtml(ticket.code)}</strong></p><p><a href="${escapeHtml(url)}">Open your voucher and QR code</a></p><p>Valid until ${escapeHtml(ticket.expires_on)}. Single use.</p><p>${escapeHtml(ticket.terms)}</p><p>${escapeHtml(ticket.instructions)}</p><p>Order ${escapeHtml(order.id)}</p>`;
}

export async function readAllRows(client,table){
 const rows=[];let offset=0;
 for(let page=0;page<200;page++){
  let query=client.from(table).select('*',{count:'exact'});
  query=table.endsWith('_members')?query.order('business_id').order('email'):query.order('id');
  const response=await query.range(offset,offset+999);
  if(response.error)throw Error(response.error.message);
  if(!Array.isArray(response.data))throw Error('The voucher records could not be read');
  rows.push(...response.data);offset+=response.data.length;
  if(!response.data.length||(typeof response.count==='number'?offset>=response.count:response.data.length<1000))return rows;
 }
 throw Error('This account has a large voucher history. Contact FAR before exporting so no records are missed.');
}

import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {transform} from 'esbuild';
const main=await readFile('supabase/functions/far-voucher-api/index.ts','utf8');
const core=await readFile('supabase/functions/far-voucher-api/core.mjs','utf8');
const joined=main.replace(/^import \{minor,verifyPayment,bankEntry,ticketEmail,isReversed\} from '\.\/core\.mjs';$/m,core);
await transform(joined,{loader:'ts',target:'es2022'});
await mkdir('deployment',{recursive:true});
await writeFile('deployment/index.ts',joined);
console.log('Single-file dashboard deployment prepared and syntax checked.');

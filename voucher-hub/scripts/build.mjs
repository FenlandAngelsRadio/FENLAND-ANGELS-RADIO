import {build} from 'esbuild';
import {mkdir,copyFile,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
await mkdir('dist',{recursive:true});
const result=await build({entryPoints:['./src/voucher-app.js'],bundle:true,minify:true,format:'esm',target:['es2022'],outfile:'dist/voucher-app.js',legalComments:'eof',metafile:true});
const notices=new Map();
for(const input of Object.keys(result.metafile.inputs)){
 if(!input.includes('node_modules'))continue;
 let directory=dirname(resolve(input));
 while(directory.includes('node_modules')){
  try{
   const pkg=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8'));
   if(!notices.has(pkg.name)){
    for(const name of ['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT','license']){
     try{notices.set(pkg.name,`${pkg.name} ${pkg.version}\n${await readFile(resolve(directory,name),'utf8')}`);break;}catch{}
    }
    if(!notices.has(pkg.name))notices.set(pkg.name,`${pkg.name} ${pkg.version}\nLicense: ${pkg.license||'See package source'}`);
   }
   break;
  }catch{directory=dirname(directory);}
 }
}
await writeFile('dist/voucher-app.licenses.txt',[...notices.values()].join('\n\n----------------------------------------\n\n'));
for(const file of ['voucher-app.html','voucher-app.css','voucher-app.webmanifest','voucher-app-192.png','voucher-app-512.png'])await copyFile(`src/${file}`,`dist/${file}`);
console.log('Voucher Hub built. Use the existing events-config.js alongside these files.');

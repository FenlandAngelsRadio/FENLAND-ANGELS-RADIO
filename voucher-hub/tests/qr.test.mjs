import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
const require=createRequire(import.meta.url),{PNG}=createRequire(require.resolve('qrcode'))('pngjs');
test('customer QR decodes to the business redemption link',async()=>{
 const url='https://fenlandangelsradio.co.uk/voucher-app.html?voucher=FAR-1234567890ABCDEF1234';
 const buffer=await QRCode.toBuffer(url,{width:600,margin:4});
 const png=PNG.sync.read(buffer);
 const result=jsQR(new Uint8ClampedArray(png.data),png.width,png.height);
 assert.equal(result.data,url);
});

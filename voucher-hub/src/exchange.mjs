export function advertisingCredit(faceMinor,quantity){
 if(!Number.isSafeInteger(faceMinor)||faceMinor<=0||!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000)throw Error('Enter the voucher value and agreed quantity');
 const credit=faceMinor*quantity;
 if(!Number.isSafeInteger(credit)||credit>2147483647)throw Error('The agreement value is too large');
 return credit;
}
export function customerPrice(faceMinor){
 if(!Number.isSafeInteger(faceMinor)||faceMinor<=0)throw Error('Enter a valid voucher face value');
 const price=Math.floor((faceMinor+50)/100)*50;
 if(price<=0)throw Error('Voucher face value must round to at least £1');
 return price;
}

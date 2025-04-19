export function test(AnZip) {
  var azip = new AnZip;
  
  var dat1 = new Uint8Array([0, 1, 127, 128, 254, 255]);
  var dat2 = 'it is text data ☺♥\ud83d\udca9';
  var dat3 = new Blob([dat1]);
  
  azip.add('dir1/dir1_2/binary.bin', dat1);
  azip.add('dir2/text☺\ud83d\udca9.txt', dat2);
  azip.add('dir3/blob.bin', dat3);
  azip.add('dir4/blob.bin', dat3);
  azip.add('dir5/blob.bin', dat3);
  azip.remove('dir4/blob.bin');
  azip.add('text2.txt', 'txt2');
  azip.add('text3.txt', 'txt3');
  azip.zip(true);
  
  console.log( azip.get('dir4/blob.bin') );
  console.log( azip.get('text2.txt') );

  return azip;
}

if( typeof module === 'object' ) {
  module.exports = test;
}

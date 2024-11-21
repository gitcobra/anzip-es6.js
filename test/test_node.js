import AnZip from '../dist/anzip-es6.js';
import { writeFileSync } from "fs";
import { test } from "./test.js";


(async () => {
  const azip = test( AnZip );
  await azip.wait();
  azip.zip();
  console.log(azip.list(true))
  writeFileSync("./tmp/file_node.zip", new Uint8Array(await azip.buffer()));
  //await azip.get('dir1/dir1_2/binary.bin');

  //azip.clear();
  //azip.add('hoge.txt', 'hogetext');
  //writeFileSync("./tmp/file_node2.zip", new Uint8Array(await azip.buffer()));
  //console.log('done2');
})();

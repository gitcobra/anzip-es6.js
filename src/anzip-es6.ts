/*

anzip-es6.js
https://github.com/gitcobra/anzip-es6.js



ZIP File Format Specification
https://pkwaredownloads.blob.core.windows.net/pem/APPNOTE.txt

   4.3.6 Overall .ZIP file format:

      [local file header 1]
      [encryption header 1]
      [file data 1]
      [data descriptor 1]
      . 
      .
      .
      [local file header n]
      [encryption header n]
      [file data n]
      [data descriptor n]

      [archive decryption header] 
      [archive extra data record] 
      
      [central directory header 1]
      .
      .
      .
      [central directory header n]
      
      [zip64 end of central directory record]
      [zip64 end of central directory locator] 
      [end of central directory record]
*/

// header length constants
const LOCAL_HEADER_BASE_LENGTH = 30;
const CENTRAL_HEADER_BASE_LENGTH = 46;
const ENDOF_CENTRAL_REC_LENGTH = 22;

// lfh: signature(4) version(2) flag(2) comp_method(2)
const LocalFileHeaderStart = new Blob( [Uint8Array.from([0x50,0x4B,0x03,0x04,  0x0A,0x00,  0x00,0x08,  0x00,0x00])] );
// cdh: signature(4) app version(2) version(2) flag(2) comp_method(2)
const CentralDirHeaderStart = new Blob( [Uint8Array.from([0x50,0x4B,0x01,0x02,  0x0A,0x00,  0x0A,0x00,  0x00,0x08,  0x00,0x00])] );
// cdh parts: comment length(2)  disk(2)  in-attr(2) ex-attr(4)  offset(4)
const CentralDirHeaderRest_File =    new Blob( [Uint8Array.from([0x00,0x00, 0x00,0x00, 0x00,0x00, 0x00,0x00,0x00,0x00])] );
const CentralDirHeaderRest_NotFile = new Blob( [Uint8Array.from([0x00,0x00, 0x00,0x00, 0x00,0x00, 0x10,0x00,0x00,0x00])] );

const txtenc = new TextEncoder();

type AcceptableDataTypes = number[] | Uint8Array | ArrayBuffer | Buffer | string;
type DirRecord = {
  offset: number;
  size: number;
  isFile: boolean;
  pathLength: number;
  path: string;
  children?: Map<string, DirRecord>
};

export default class AnZip {
  private _zippedBlob: Blob | null;
  private _resolvingCRCPromise: Promise<any> | null;
  /**
  * directory record
  */
  private _dirRecords: Map<string, DirRecord>;
  private _dirRecList: DirRecord[];
  private _dirRecFileList: DirRecord[];
  /**
  * local file headers
  * [LocalFileHeaderStart, samePartLocalAndCentral, pathArray, file?]
  */
  private _localFileChunks: ([Blob, Uint8Array, Uint8Array] | [Blob, Uint8Array, Uint8Array, (Uint8Array | Buffer | Blob)])[];
  /**
  * current local file header offset
  */
  private _curLocalFileHeaderOffset: number;
  /**
  * central directory headers 
  * [CentralDirHeaderStart, samePartLocalAndCentral, centralRest, localOffset, pathArray]
  */
  private _centralDirHeaderChunks: [Blob, Uint8Array, Blob, Uint8Array, Uint8Array][];
  /**
  * whole central directory header size
  */
  private _centralDirHeaderLen: number;
  /**
  * path count
  */
  private _pathCount: number;
  /**
  * file count
  */
  private _fileCount: number;
  /**
  * total size of all files
  */
  private _dataSize: number;


  public static getCRC32(dat: AcceptableDataTypes | Blob) {

  }


  /**
  * AnZip constructor
  */
  constructor() {
    this.clear();
  }
  
  /**
  * initialize data
  * @memberof AnZip
  * @param { boolean } [blobMode]
  * @return {void}
  */
  clear() {
    this._dirRecords = new Map();
    this._dirRecList = [];
    this._dirRecFileList = [];
    this._localFileChunks = [];
    this._curLocalFileHeaderOffset = 0;
    this._centralDirHeaderChunks = [];
    this._centralDirHeaderLen = 0;
    this._pathCount = 0;
    this._fileCount = 0;
    this._dataSize = 0;
    this._zippedBlob = null;
    this._resolvingCRCPromise = null;
  }
  /**
  * add path and data
  */
  add(path: string, data?: Blob | AcceptableDataTypes, dateArg?: any, precalculatedCRC?: number): Promise<number> {
    if( this._zippedBlob )
      throw new Error('the AnZip object was already zipped. create a new instance or execute clear() before adding a file.');
    
    // check path
    if( !path )
      throw new Error('path is empty');
    
    // replace backslash with forward slash
    path = String(path).replace(/\\/g, '/').replace(/^\//, ''); // erase leading slash
    
    // check characters
    if (/\/{2,}|\\|^\/|^[a-z]+:/i.test(path))
      throw new Error('invalid path. containing a drive letter, a leading slash, or empty directory name: "' + path + '"');



    // check file
    let dataSize = 0;
    let crc;
    let storeData: Uint8Array | Buffer | Blob | null = null;
    if( typeof data !== 'undefined' ) {
      // file name has to be specified
      if( !/[^/]+$/.test(path) )
        throw new Error('needs a file name: "' + path + '"');
      // check for duplication
      if( this.has(path) )
        throw new Error('the path already exists: "' + path + '"');
      
      // check if precalculated CRC exists
      if( typeof precalculatedCRC !== 'undefined' ) {
        if( typeof precalculatedCRC !== 'number' )
          throw new Error('precalculatedCRC must be a number');
        crc = precalculatedCRC;
      }
      
      if( !(data instanceof Blob) ) {
        if( data instanceof Uint8Array || typeof Buffer === 'function' && data instanceof Buffer )
          storeData = data;
        else if( typeof data === 'string' ) {
          // convert string to utf-8 binary
          storeData = txtenc.encode( data );
        }
        else if( data instanceof ArrayBuffer || data instanceof Array ) {
          storeData = new Uint8Array( data );
        }
        else {
          throw new Error('data must be one of the following types Array, TypedArray, ArrayBuffer, Buffer, string, or Blob.');
        }
        
        // calculate CRC synchronously
        if( crc === undefined ) {
          crc = calculateCRC32( storeData );
        }
        dataSize = storeData.byteLength;
      }
      else {
        storeData = data;
        dataSize = data.size;
        // calculating CRC is postponed when it is a Blob
        if( crc === undefined )
          crc = 0;
      }
    }


    // generate time stamp
    let date: Date | null = null;
    if( dateArg instanceof Date )
      date = dateArg;
    else if( typeof dateArg === 'undefined' || dateArg === -1 )
      date = new Date();
    else if( dateArg >= 0 )
      date = new Date(dateArg);

    const dateArray = !date ? [0, 0, 0, 0] : getAs32ArrayLE((date.getFullYear() - 1980) << 25 | (date.getMonth() + 1) << 21 | date.getDate() << 16 | date.getHours() << 11 | date.getMinutes() << 5 | date.getSeconds() / 2);


    // construct directories
    let dirs = path.replace(/\/+$/, '').split("/");
    let pathstack = '';
    let samePartLocalAndCentral: Uint8Array;
    let lastLocalFileBlock: AnZip['_localFileChunks'][number];
    while( dirs.length ) {
      // check whether the path already exists
      pathstack += dirs.shift();

      const isFile = Boolean(data && (dirs.length === 0));
      pathstack += (isFile ? '' : '/');
      
      // already exists
      if( this._dirRecords.has(pathstack) )
        continue;
      
      // create path binary
      const pathArray = txtenc.encode( pathstack ); // Uint8Array
      const pathLength = pathArray.length;
      
      // create data size binary
      const dataSizeArray32 = isFile && dataSize ? getAs32ArrayLE(dataSize) : [0, 0, 0, 0];

      // it's a new path
      const record: DirRecord = {
        offset: this._curLocalFileHeaderOffset,
        size: dataSize,
        path: pathstack,
        pathLength,
        isFile,
      };
      this._dirRecords.set(pathstack, record);
      this._dirRecList.push(record);
      if( isFile )
        this._dirRecFileList.push(record);
      this._pathCount++;



      /*
      4.3.7  Local file header:
          local file header signature     4 bytes  (0x04034b50)
          version needed to extract       2 bytes
          general purpose bit flag        2 bytes
          compression method              2 bytes
          
          last mod file time              2 bytes
          last mod file date              2 bytes
          crc-32                          4 bytes
          compressed size                 4 bytes
          uncompressed size               4 bytes
          file name length                2 bytes
          extra field length              2 bytes

          file name (variable size)
          extra field (variable size)
      */
      
      // *same part as cdh*
      // date(4) CRC(4) size(4) size(4) pathLength(2) extraLength(2)
      samePartLocalAndCentral = Uint8Array.from(
        ([] as number[]).concat(
          dateArray,
          isFile ? getAs32ArrayLE(crc!) : [0,0,0,0],
          dataSizeArray32,
          dataSizeArray32,
          [pathLength & 0xFF, pathLength >> 8 & 0xFF, 0x00, 0x00]
        )
      );

      lastLocalFileBlock = [LocalFileHeaderStart, samePartLocalAndCentral, pathArray];
      this._localFileChunks.push( lastLocalFileBlock );



      /*
      4.3.12  Central directory structure:

          [central directory header 1]
          .
          .
          . 
          [central directory header n]
          [digital signature] 

          File header:

            central file header signature   4 bytes  (0x02014b50)
            version made by                 2 bytes
            version needed to extract       2 bytes
            general purpose bit flag        2 bytes
            compression method              2 bytes
            
            last mod file time              2 bytes
            last mod file date              2 bytes
            crc-32                          4 bytes
            compressed size                 4 bytes
            uncompressed size               4 bytes
            file name length                2 bytes
            extra field length              2 bytes

            file comment length             2 bytes
            disk number start               2 bytes
            internal file attributes        2 bytes
            external file attributes        4 bytes
            relative offset of local header 4 bytes

            file name (variable size)
            extra field (variable size)
            file comment (variable size)
      */
      const centralRest = isFile ? CentralDirHeaderRest_File : CentralDirHeaderRest_NotFile;
      const localOffset = Uint8Array.from( getAs32ArrayLE(this._curLocalFileHeaderOffset) );
      this._centralDirHeaderChunks.push([
        CentralDirHeaderStart,
        samePartLocalAndCentral,
        centralRest,
        localOffset,
        pathArray
      ]);
      
      // increase offset
      this._centralDirHeaderLen += CENTRAL_HEADER_BASE_LENGTH + pathLength;
      this._curLocalFileHeaderOffset += LOCAL_HEADER_BASE_LENGTH + pathLength + (isFile ? dataSize : 0);
    }


    // add file data
    let blobPromise: Promise<any> | undefined;
    if( storeData ) {
      // asynchronously calculate CRC when it is a Blob
      if( precalculatedCRC === undefined ) {
        if( storeData instanceof Blob ) {
          blobPromise = this._resolveBlobCRC(storeData, samePartLocalAndCentral!, path);
        }
      }

      lastLocalFileBlock!.push(storeData);
      this._dataSize += dataSize;
      this._fileCount++;
    }
    let pathCount = this._pathCount;

    return (blobPromise || Promise.resolve()).then(() => pathCount);
  }
  private _resolveBlobCRC(blob: Blob, header: Uint8Array, path: string) {
    let resolve: (val?: any) => any;
    let reject: (val?: any) => any;
    const prevPromise = this._resolvingCRCPromise || Promise.resolve();
    const currentPromise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    
    this._resolvingCRCPromise = currentPromise;
    
    // wait until previous promise is fulfilled
    let success = false;
    prevPromise.finally(() => {
      // calculate CRC
      getBlobCRC(blob).then(crc => {
        // write CRC asynchronously
        new DataView(header.buffer).setUint32(4, crc, true);
        success = true;
      }).catch(e => {
        this.remove(path);
        throw new Error(`${e.message}\ncould not resolve the blob CRC.`);
      }).finally(() => {
        if( this._resolvingCRCPromise === currentPromise ) {
          this._resolvingCRCPromise = null;
        }
        success ? resolve() : reject();
      });
    });

    return currentPromise;
  }
  private _checkPending() {
    //if( this._isPending )
    if( this._resolvingCRCPromise )
      throw new Error(`the AnZip object is still pending. execute wait() and await the fulfillment of the Promise beforehand.`);
  }
  private _getFileRecord(index: number | string): DirRecord | null {
    let rec: DirRecord | undefined;
    if( typeof index === 'string' ) {
      rec = this._dirRecords.get(index);
    }
    else if( typeof index === 'number' ) {
      rec = this._dirRecFileList[index];
    }
    return rec || null;
  }
  /**
  * return whether the path exists
  */
  has(path: string): boolean {
    return !!this._dirRecords.has( path.replace(/\/+$/, '') );
  }
  size() {
    return this._dataSize;
  }
  count(all?: boolean) {
    return all ? this._pathCount : this._fileCount;
  }

  /*
  * get method is always synchlonous
  */
  get(index: number | string): Blob | Uint8Array | Buffer | null;
  get(index: number | string, blobType: string): Blob | null;
  get(index: number | string, blobType?: string) {
    const rec = this._getFileRecord(index);
    if( rec && rec.isFile ) {
      if( this._zippedBlob ) {      
        const {offset, size, pathLength} = rec;
        const headerlen = offset + pathLength + LOCAL_HEADER_BASE_LENGTH;
        return this._zippedBlob.slice(headerlen, headerlen + size, blobType);
      }
      else {
        const num = this._dirRecList.indexOf(rec);
        const dat = this._localFileChunks[num][3]!;
        if( typeof blobType === 'string' ) {
          if( !(dat instanceof Blob) || blobType && dat.type !== blobType )
            return new Blob([dat], {type: blobType});
        }
        return dat;
      }
    }

    return null;
  }

  getPathByIndex(index: number) {
    return this._dirRecFileList[index]?.path || '';
  }
  remove(index: number | string) {
    if( this._zippedBlob )
      throw new Error(`could not remove the file. the AnZip object is already zipped. ${index}`);
    
    const rec = this._getFileRecord(index);
    if( !rec || !rec.isFile )
      return false;
    
    const num = this._dirRecList.indexOf(rec);
    
    // delete chunk from array
    const localChunk = this._localFileChunks.splice(num, 1)[0];
    const centralChunk = this._centralDirHeaderChunks.splice(num, 1)[0];
    
    // decrease offsets
    const localChunkSize = LOCAL_HEADER_BASE_LENGTH + rec.pathLength + rec.size;
    this._curLocalFileHeaderOffset -= localChunkSize;
    const centralChunkSize = CENTRAL_HEADER_BASE_LENGTH + rec.pathLength;
    this._centralDirHeaderLen -= centralChunkSize;

    // decrease offset values on CentralDirectoryHeader
    for( let i = num; i < this._centralDirHeaderChunks.length; i++ ) {
      const offsetU8 = this._centralDirHeaderChunks[i][3];
      const dv = new DataView(offsetU8.buffer);
      const offset = dv.getUint32(0, true);
      
      // *replace with new Uint8Array instead of editing because it could break snapshoot blobParts in zip() method
      //dv.setUint32(0, offset - localChunkSize, true);
      this._centralDirHeaderChunks[i][3] = Uint8Array.from( getAs32ArrayLE(offset - localChunkSize) );
    }

    this._pathCount--;
    this._fileCount--;
    this._dataSize -= rec.size;
    this._dirRecords.delete(rec.path);
    this._dirRecFileList.splice(this._dirRecFileList.indexOf(rec), 1);
    this._dirRecList.splice(this._dirRecList.indexOf(rec), 1);

    return true;
  }
  list(includeDirFlag?: boolean) {
    const list: { size: number, isFile: boolean, path: string }[] = [];
    for( const [key, val] of this._dirRecords ) {
      if( !includeDirFlag && !val.isFile )
        continue;
      list.push({
        path: val.path,
        size: val.size,
        isFile: val.isFile,
      });
    }
    return list;
  }
  buffer(): Promise<ArrayBuffer> {
    return this.zip().then(blob => blobToArrayBuffer(blob));
  }
  blob(): Promise<Blob> {
    return this.zip();
  }
  /**
  * output as dataURL
  */
  url(): Promise<string> {
    return this.zip().then(blob => URL.createObjectURL(blob));
  }
  urlSync() {
    return URL.createObjectURL( this.zipSync() );
  }
  /*
  * wait until the last CRC calculation is done
  */
  async wait(deepWait?: boolean): Promise<void> {
    while( this._resolvingCRCPromise ) {
      await this._resolvingCRCPromise;
      if( !deepWait )
        break;
    }
  }
  /**
  * construct a zip structure as a Blob
  */
  private _buildZipBlob(blobParts?: BlobPart[]): Blob {
    return new Blob(blobParts || this._createCurrentBlobParts(), {type: 'application/zip'});
  }
  private _createCurrentBlobParts(): BlobPart[] {

    
    /*
    4.3.16  End of central directory record:

        end of central dir signature    4 bytes  (0x06054b50)
        number of this disk             2 bytes
        number of the disk with the
        start of the central directory  2 bytes
        total number of entries in the
        central directory on this disk  2 bytes
        total number of entries in
        the central directory           2 bytes
        size of the central directory   4 bytes
        offset of start of central
        directory with respect to
        the starting disk number        4 bytes
        .ZIP file comment length        2 bytes
        .ZIP file comment       (variable size)
    */

    const endOfCentralDirRecord = new Uint8Array(([] as number[]).concat(
      [
        // 4: end of central dir signature
        0x50, 0x4B, 0x05, 0x06,
        // 2: number of this disk
        0x00, 0x00,
        // 2: number of the disk with the start of the central directory
        0x00, 0x00,
        // 2: total number of entries in the central directory on this disk
        this._pathCount & 0xFF, this._pathCount >> 8,
        // 2: total number of entries in the central directory
        this._pathCount & 0xFF, this._pathCount >> 8
      ],
      // 4: size of the central directory
      getAs32ArrayLE(this._centralDirHeaderLen),
      // 4: offset of start of central directory with respect to the starting disk number
      getAs32ArrayLE(this._curLocalFileHeaderOffset),
      // 2: .ZIP file comment length
      [0x00, 0x00]
      // variable size: .ZIP file comment ...
    ));

    // join all binary data
    //const chain = this._localFiles.concat(this._centralDirHeaders, endOfCentralDirRecord);
    let chain: (Blob | Uint8Array | Buffer )[] = [];
    chain = chain.concat(...this._localFileChunks, ...this._centralDirHeaderChunks, endOfCentralDirRecord);

    return chain;
  }
  /**
  * output zip as Blob
  */
  async zip(close?: boolean): Promise<Blob> {   
    if( this._zippedBlob )
      return this._zippedBlob;
    
    // snapshot current binary chain
    const blobParts = this._createCurrentBlobParts();
    // wait pending crc
    await this._resolvingCRCPromise;
    
    const blob = this._buildZipBlob( blobParts );
    if( close )
      this._close(blob);
    return blob;
  }
  zipSync(close?: boolean): Blob {
    if( this._zippedBlob )
      return this._zippedBlob;
    
    this._checkPending();
    const blob = this._buildZipBlob( this._createCurrentBlobParts() );
    if( close )
      this._close(blob);

    return blob;
  }
  private _close(blob: Blob) {
    this._zippedBlob = blob;
    // clear constructed parts
    this._localFileChunks = [];
    this._centralDirHeaderChunks = [];
  }
}




// create CRC32 table
const CRC32Table = new Uint32Array(256);
for( let i = 0; i < 256; i++ ) {
  let val = i;
  for( let j = 0; j < 8; j++ ) {
    val = (val & 1) ? (0xEDB88320 ^ (val >>> 1)) : (val >>> 1);
  }
  CRC32Table[i] = val;
}

function calculateCRC32(dat: number[] | Uint8Array | Buffer) {
  let crc = 0xFFFFFFFF;
  for( let i = 0, len = dat.length; i < len; i++ ) {
    crc = CRC32Table[(crc ^ dat[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function getBlobCRC(blob: Blob): Promise<number> {
  // calculate CRC
  return blobToArrayBuffer(blob).then((buffer) => {
    // write CRC asynchronously
    return calculateCRC32( new Uint8Array(buffer) );
  });
}

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  // create ArrayBuffer from Blob
  return blob.arrayBuffer?.() || new Promise<ArrayBuffer>((res) => {
    let fr = new FileReader();
    fr.onload = (ev) => {
      res( ev.target!.result as ArrayBuffer );
    };
    fr.onerror = () => {
      throw new Error('could not read it as ArrayBuffer');
    };
    fr.readAsArrayBuffer(blob);
    fr = null as any;
  });
}

/**
 * 32bit number to little-endian byte array
 */
function getAs32ArrayLE(num: number): [number, number, number, number] {
  return [num & 0xFF, num >> 8 & 0xFF, num >> 16 & 0xFF, num >> 24 & 0xFF];
}

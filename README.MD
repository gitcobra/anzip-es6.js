# AnZipES6
Create an **uncompressed** zip file.
- This is ES6 version of [@gitcobra/anzip](https://github.com/gitcobra/AnZip.js)
- Improvement to memory usage by using Blob instead of ArrayBuffer
- Some additional methods such as "get", "remove", etc


## Installation

```
npm install @gitcobra/anzip-es6
```




## Usage
```
import AnZip from '@gitcobra/anzip-es6'


// sample data
var bin = new Uint8Array([0, 1, 2, 3, 127, 255]);
var txt = 'text data';

// 1: create a new AnZip object
var azip = new AnZip;

// 2: add the data to an arbitrary path
azip.add('dir1/dir1_1/file1.bin', bin); // binary data
azip.add('dir2/text.txt', txt); // text data
azip.add('dir3/dir4/dir5'); // empty directories

// 3: output the zip as a blob
var blob = azip.zip();
```


## Methods

### add(`path` [, `data`])
- `path`: `string`
  - Path to directory or file in the zip. Forward slash('/') and backslash('\\') are both allowed for directory separators.
- `data` (optional): `TypedArray` | `Array` | `string` | `ArrayBuffer` | `Buffer` | `Blob`
  - Data you want to store. If omitted, it just constructs directories.
- Return Value: `Promise<boolean>`
  - NOTE: When the `data` parameter is a `Blob`, this method calculates CRC asynchronously and returns a `Promise` that resolves a `boolean` value of success or failure for the adding process.
- Construct directories in the zip then add a data if specified. Throw an Error when you try to add any data to a file path already exists.

### zip([`close`])
- `close`: `boolean`
- Return Value: `Blob`
- Output all added files as a `Blob`, and close the zip if `close` flag is `true`.

### get(`path` [,`blobType`])
- `path`: `string` | `number`
- `blobType`: `string`
- Return Value: `Blob` | `Uint8Array` | `Buffer` | `null`
- Get a stored file data indicated by the path string or index number. The return type is always `Blob` after zip() method is executed or `blobType` argument is specified. If it does not have a file in the path, returns `null`.

### has(`path`)
- `path`: `string`
- Return Value: `boolean`
- Check whether the path already exists.

### remove(`path`)
- `path`: `string` | `number`
- Remove a file from the zip data. *currently it cannot remove directories.

### isZipped()
- Return Value: `boolean`
- Return whether it was already closed.

### list([`includeDirFlag`])
- Returl Value: `string[]`
- List up all zipped file paths. When `includeDirFlag` is true, include directories themselves.

### count([`includeDirFlag`])
- `includeDir`(optional): `boolean`
- Return Value: `number`
- Get stored file count.

### size()
- Return Value: `number`
- Get total size of added files

### clear()
- Return Value: `void`
- Clear all data.

### buffer()
- Return Value: `Promise`<`ArrayBuffer` | `Buffer`>
- Output the zip as a Promise that resolves to an `ArrayBuffer` or a `Buffer`.

### blob()
- Return Value: `Blob`
- Output the zip binary as a Blob.

### url()
- Return Value: `string`
- Output as an **object URL**.


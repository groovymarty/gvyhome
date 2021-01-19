#!/usr/bin/env nodejs

// this script pushes database files to Dropbox
// assumptions:
// all local files and directory names are lowercase
// database files are small (less than 4MB)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const mydbx = require("../gvypics/mydbx.js");

const localPathBase = "years";
const dbxPathBase = "/Database/gvyhome/years";

// convert local path to Dropbox path
function convertPathLocalToDbx(localPath) {
  return dbxPathBase + localPath.substring(localPathBase.length).split(path.sep).join("/");
}

// convert Dropbox path to local path
function convertPathDbxToLocal(dbxPath) {
  return localPathBase + dbxPath.substring(dbxPathBase.length).split("/").join(path.sep);
}

// file information
// key is local file path,
// value is object with hash and last mod time
const fileInfo = {};

// load info for all existing files in Dropbox
function loadDbxFolder() {
  // this function processes the result of fileListFolder or fileListFolderContinue
  function processListFolderResult(result) {
    result.entries.forEach(entry => {
      if (entry['.tag'] === "file") {
        // replace Dropbox path with local path
        const filePath = convertPathDbxToLocal(entry.path_lower);
        fileInfo[filePath] = {
          hash: entry.content_hash
        };
      }
    });
    if (result.has_more) {
      // return another promise to keep chain going
      return mydbx.filesListFolderContinue({cursor: result.cursor})
        .then(processListFolderResult);
    }
    return true; //done
  }
  
  return mydbx.filesListFolder({path: dbxPathBase, recursive: true, include_deleted: false})
    .then(processListFolderResult);
}

// compute Dropbox hash of file
// only works for short files (<= 4MB)
// otherwise you have to break it up into 4MB blocks
function computeHash(filePath) {
  const blockHasher = crypto.createHash('sha256');
  const overallHasher = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  if (data.length > 4*1024*1024) {
    console.log("cannot compute hash, file is too big:", filePath);
  }
  blockHasher.update(data);
  overallHasher.update(blockHasher.digest());
  return overallHasher.digest('hex');
}

// process a file found during scan
function processFile(filePath, chain) {
  if (!fileInfo[filePath]) {
    fileInfo[filePath] = {};
  }
  const info = fileInfo[filePath];
  const stats = fs.statSync(filePath);
  // file has changed or not seen before?
  if (stats.mtimeMs !== info.mtimeMs) {
    info.mtimeMs = stats.mtimeMs;    
    const hash = computeHash(filePath);
    // file hash differs from Dropbox or new file?
    if (hash !== info.hash) {
      // add upload to promise chain
      chain = chain.then(() => {
        return mydbx.filesUpload({
          contents: fs.readFileSync(filePath),
          path: convertPathLocalToDbx(filePath),
          mode: {'.tag': 'overwrite'}
        }).then((fileMeta) => {
          console.log("upload complete for", filePath);
          // verify we computed same hash as Dropbox
          if (hash != fileMeta.content_hash) {
            console.log("hash mismatch for", filePath);
          }
        }).catch(err => {
          console.log("upload failed for", filePath, err.error);
        });
      });
    }
  }
  return chain;
}

// scan a directory and identify files that need to be uploaded
// chain the file upload promises and return the updated chain
function scanDir(dirPath, chain) {
  const dir = fs.opendirSync(dirPath);
  while (true) {
    const dirent = dir.readSync();
    if (!dirent) {
      break;
    }
    if (dirent.isDirectory()) {
      if (dirent.name !== "." && dirent.name !== "..") {
        chain = scanDir(path.join(dirPath, dirent.name), chain);
      }
    } else if (dirent.isFile()) {
      chain = processFile(path.join(dirPath, dirent.name), chain);
    }
  }
  dir.closeSync();
  return chain;
}

// scan local directories and identify files that need to be uploaded
// return promise chain to upload them
function scanDirs() {
  return scanDir(localPathBase, Promise.resolve(true));
}

// driver function to scan local directories,
// perform any file uploads, then delay and do it again, forever
function doScanDirs() {
  return scanDirs().then(() => setTimeout(doScanDirs, 10000));
}

// load Dropbox info then launch driver function
loadDbxFolder().then(doScanDirs);

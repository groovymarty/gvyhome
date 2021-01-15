#!/usr/bin/env nodejs

// this script pushes database files to Dropbox

const fs = require("fs");
const path = require("path");
const mydbx = require("../gvypics/mydbx.js");

// file information
// key is local file path
// value is object with hash and last mod time
const fileInfo = {};

// load info for all existing files in Dropbox
function loadDbxFolder(dbxPath, localPath) {
  // this function processes the result of fileListFolder or fileListFolderContinue
  function processListFolderResult(result) {
    result.entries.forEach(entry => {
      if (entry['.tag'] === "file") {
        // replace Dropbox path with local path
        const filePath = localPath + entry.path_lower.substring(dbxPath.length);
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
  
  // else continue using cursor from last time
  return mydbx.filesListFolder({path: dbxPath, recursive: true, include_deleted: false})
    .then(processListFolderResult);
}

// scan a directory and identify files that need to be uploaded
// chain the file upload promises and return the updated chain
function scanDir(dirPath, chain) {
  console.log("scanning", dirPath);
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
      console.log("found file", dirent.name);
    }
  }
  dir.closeSync();
  return chain;
}

// scan local directories and identify files that need to be uploaded
// return promise chain to upload them
function scanDirs() {
  return scanDir("years", Promise.resolve(true));
}

// driver function to scan local directories,
// perform any file uploads, then delay and do it again, forever
function doScanDirs() {
  return scanDirs().then(() => setTimeout(doScanDirs, 10000));
}

// load Dropbox info then launch driver function
loadDbxFolder("/Database/gvyhome/years", "years").then(doScanDirs);

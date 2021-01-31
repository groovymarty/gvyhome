// given a file of records, check if they are in the database
// write any missing records to output file

const iarg = process.argv[1].endsWith("filtermissing.js") ? 2 : 1;
const inFile = process.argv[iarg] || "recs";
const outFile = process.argv[iarg+1] || "missingrecs";

const db = require("./database.js");
const fs = require('fs');
const recs = JSON.parse(fs.readFileSync(inFile, {encoding: "utf-8"}));
if (!Array.isArray(recs)) {
    console.log("recs is not an array");
    process.exit(1);
}
// rec is missing if it can successfully be added to the database
const missingrecs = recs.filter(rec => db.addRecord(rec));
console.log("found", missingrecs.length, "missing records");

const cleanrecs = missingrecs.map(db.cleanRecord);
fs.writeFileSync(outFile, JSON.stringify(cleanrecs, null, 2));

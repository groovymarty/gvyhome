// parse log file and write records to recs file

const iarg = process.argv[1].endsWith("parselog.js") ? 2 : 1;
const inFile = process.argv[iarg] || "log";
const outFile = process.argv[iarg+1] || "recs";

const fs = require('fs');
const lines = fs.readFileSync(inFile, {encoding: "utf-8"}).split("\n");
const things = {
    "HEAT WH": 1,
    "HEAT MBR": 2,
    "HEAT 1ST": 4,
    "HEAT 2ND": 8,
    "BOIL": 16,
    "COOL MBR": 32,
    "COOL 1ST": 64,
    "COOL 2ND": 128,
    "WELL": 256,
    "HW PUMP": 512
};
let inp = 0;
const recs = [];
lines.forEach(line => {
    const mr = line.match(/.* maryanne maryanne\.sh\[\d*\]: (\d{4}-\d\d-\d\d \d\d:\d\d:\d\d.\d{3,}): ([A-Z0-9 ]*) is ([ONF]*).*/);
    if (mr) {
        const t = mr[1];
        const thing = mr[2];
        const state = mr[3] == "ON";
        const bit = things[thing];
        if (bit) {
            if (state) {
                inp = inp | bit;
            } else {
                inp = inp & ~bit;
            }
        } else {
            console.log("unknown thing:", thing);
        }
        recs.push({t: t, src: "ma1", inp: inp});
    }
});
console.log("found", recs.length, "records");
// sort them by timestamp
recs.sort((rec1, rec2) => rec1.t.localeCompare(rec2.t));
// maryanne logs each bit transition, but posts all inp bits together in one record
// that means above loop will generate duplicate records if more than one bit changed at same time
// the following deletes the duplicates (keeping the last one in a series of duplicates)
const recs2 = [];
recs.forEach((rec, i) => {
    const nextRec = recs[i+1] || {t: "99999"};
    if (rec.t != nextRec.t) {
        recs2.push(rec);
    } else {
        //console.log("deleting duplicate", rec.t);
    }
});
console.log("deleted", recs.length-recs2.length, "duplicates");

fs.writeFileSync(outFile, JSON.stringify(recs2, null, 2));

// parse log file and write records to day file

const fs = require('fs');
const lines = fs.readFileSync("log", {encoding: "utf-8"}).split("\n");
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
    const mr = line.match(/^Jan 04 \d\d:\d\d:\d\d maryanne maryanne\.sh\[\d*\]: (2021-01-04 \d\d:\d\d:\d\d.\d{6}): ([A-Z0-9 ]*) is ([ONF]*).*/);
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
const recs2 = [];
recs.forEach((rec, i) => {
    const nextRec = recs[i+1] || {t: "99999"};
    if (rec.t != nextRec.t) {
        recs2.push(rec);
    } else {
        console.log("deleting duplicate", rec.t);
    }
});

fs.writeFileSync("day", JSON.stringify(recs2, null, 2));

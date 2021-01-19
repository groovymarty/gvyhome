#!/usr/bin/env nodejs
const thyme = require("./thyme.js");

// verify 2000 has 366 days
let t = 0;
let n = 0;
while (true) {
    const tm = thyme.makeTime(t);
    if (tm.hour == 0) {
        //console.log(tm.formatDateTime(), n);
        if (tm.year==2001) break;
    }
    n += 1;
    t += 24 * 60 * 60 * 1000; //bump 1 day
}
if (n != 366) {
    console.log("Error, days in 2000 is", n, "expected 366");
    process.exit(0);
}

// verify years 2000 through 2004 have 365*5 + 2 = 1827 days
t = 0;
n = 0;
while (true) {
    const tm = thyme.makeTime(t);
    if (tm.day==1) {
        //console.log(tm.formatDateTime(), n);
        if (tm.year==2005) break;
    }
    n += 1;
    t += 24 * 60 * 60 * 1000; //bump 1 day
}
if (n != 1827) {
    console.log("error, days in 2000-2004 is", n, "expected 1827");
    process.exit(0);
}

// check month transitions 2000-2029
t = 0;
n = 0;
while (true) {
    const tm = thyme.makeTime(t);
    const tm_str = tm.formatDateTime();
    //console.log("tm", tm.ms, tm_str);
    if (t) {
        const yes = thyme.makeTime(t-1);
        if (yes.hour != 23 || yes.min != 59 || yes.sec != 59 || yes.msec != 999) {
            console.log("today is", tm.formatDateTime());
            console.log("yesterday is", yes.formatDateTime(), "expected 23:59:59.999");
            process.exit(0);
        }
        if (tm.day==1) {
            if (tm.month==1) {
                if (yes.month != 12) {
                    console.log("today is Jan 1 but yesterday is", yes.formatDateTime(), "expected Dec");
                    process.exit(0);
                }
                if (yes.year != tm.year-1) {
                    console.log("today is Jan 1 but yesterday is", yes.formatDateTime(), "expected prev year");
                    process.exit(0);
                }
            } else {
                if (yes.month != tm.month-1) {
                    console.log("today is 1st but yesterday is", yes.formatDateTime(), "expected prev month");                    
                    process.exit(0);
                }
                if (yes.year != tm.year) {
                    console.log("today is 1st but yesterday is", yes.formatDateTime(), "expected same year");                    
                    process.exit(0);
                }
            }
        }
        const tm2 = thyme.parseTime(tm_str);
        if (tm2.ms != tm.ms) {
            console.log("tm did not parse correctly, tm=", tm.ms, tm_str, "tm2=", tm2.ms, tm2.formatDateTime());
            process.exit(0);
        }
        // count leap days
        if (tm.month==2 && tm.day==29) {
            n += 1;
        }
    }
    if (tm.year==2030) break;
    t += 24 * 60 * 60 * 1000; //bump 1 day
}
if (n != 8) {
    console.log("error, found", n, "leap days, expected 8");
}

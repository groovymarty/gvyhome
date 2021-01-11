#!/usr/bin/env nodejs
const thyme = require("./thyme.js");

// verify 2000 has 365 days
let t = 0;
let n = 0;
while (true) {
    const tm = thyme.makeTime(t);
    if (tm.hour == 0) {
        //console.log(thyme.formatDate(tm), thyme.formatTime(tm), n);
        if (tm.year==2001) break;
    }
    n += 1;
    t += 24 * 60 * 60 * 1000; //bump 1 day
}
if (n != 365) {
    console.log("Error, days in 2000 is", n, "expected 365");
}

// verify years 2000 through 2004 have 365*5 + 1 = 1826 days
t = 0;
n = 0;
while (true) {
    const tm = thyme.makeTime(t);
    if (tm.day==1) {
        //console.log(thyme.formatDate(tm), thyme.formatTime(tm), n);
        if (tm.year==2005) break;
    }
    n += 1;
    t += 24 * 60 * 60 * 1000; //bump 1 day
}
if (n != 1826) {
    console.log("error, days in 2000-2004 is", n, "expected 1826");
}

// check month transitions 2000-2029
t = 0;
n = 0;
while (true) {
    const tm = thyme.makeTime(t);
    if (t) {
        const yes = thyme.makeTime(t-1);
        if (yes.hour != 23 || yes.min != 59 || yes.sec != 59 || yes.msec != 999) {
            console.log("today is", thyme.formatDateTime(tm));
            console.log("yesterday is", thyme.formatDateTime(yes), "expected 23:59:59.999");
        }
        if (tm.day==1) {
            if (tm.month==1) {
                if (yes.month != 12) {
                    console.log("today is Jan 1 but yesterday is", thyme.formatDateTime(yes), "expected Dec");
                }
                if (yes.year != tm.year-1) {
                    console.log("today is Jan 1 but yesterday is", thyme.formatDateTime(yes), "expected prev year");
                }
            } else {
                if (yes.month != tm.month-1) {
                    console.log("today is 1st but yesterday is", thyme.formatDateTime(yes), "expected prev month");                    
                }
                if (yes.year != tm.year) {
                    console.log("today is 1st but yesterday is", thyme.formatDateTime(yes), "expected same year");                    
                }
            }
        }
        // count leap days
        if (tm.month==2 && tm.day==29) {
            n += 1;
        }
    }
    if (tm.year==2030) break;
    t += 24 * 60 * 60 * 1000; //bump 1 day
}
if (n != 7) {
    console.log("error, found", n, "leap days, expected 7");
}

#!/usr/bin/env nodejs
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const journal = require("./datajournal.js");
const db = require("./database.js");
const thyme = require("./thyme.js");
const weather = require("./weather.js");

// recover latest state from database
db.initLatest();

// read data journal
// data journal holds recently posted records
// at end of day we write the records to day file and clear the journal
// if unexpected restart occurs, we can read journal and recover the unsaved data
journal.readJournal();

var app = express();
app.use(bodyParser.json());
app.use(cors());
// all content is dynamic so disable caching
app.set('etag', false);
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// post data
app.post("/gvyhome/data", function(req, res) {
  const errMsg = journal.addRecords(req.body);
  res.set("Content-Type", "text/plain");
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).end();
  }
});

// parameter helpers
// add parameter to params object
// return null if success, else return error message string

// parse start time
// if wide=true, default to first day in database
// otherwise default to today
function parseStartTime(query, params, wide) {
  if (query.start) {
    params.tmStart = thyme.parseTimeRelaxed(query.start);
    if (!params.tmStart) {
      return "bad start time";
    }
  } else if (wide) {
    params.tmStart = db.findFirstDay();
    if (!params.tmStart) {
      return "no first day";
    }
  } else {
    params.tmStart = thyme.makeTimeNow().setMidnight();
  }
  // success
  return null;
}

// parse end time or add ndays to start time
// end time is inclusive so ndays cannot be zero
// if wide=true, default to last day in database
// otherwise default to start time
// assume parseStartTime was called first
function parseEndTime(query, params, wide) {
  if (query.end) {
    params.tmEnd = thyme.parseTimeRelaxed(query.end);
    if (!params.tmEnd) {
      return "bad end time";
    }
  } else if (typeof query.ndays === 'string') {
    const nDays = parseInt(query.ndays);
    if (!nDays || nDays < 0) {
      return "bad ndays";
    }
    params.tmEnd = params.tmStart.clone().addDays(nDays-1);
  } else if (wide) {
    params.tmEnd = db.findLastDay();
    if (!params.tmEnd) {
      return "no last day";
    }
  } else {
    params.tmEnd = params.tmStart;
  }
  // success
  return null;
}

// parse source filter (optional)
function parseSrcFilter(query, params) {
  if (query.src) {
    const result = db.parseSrcFilter(query.src);
    if (typeof result === 'string') {
      return "bad source filter: "+result;
    }
    params.srcFilter = result;
  }
  // success
  return null;
}

// parse channel set (required)
function parseChanSet(query, params) {
  if (query.ch) {
    const result = db.parseChanSet(query.ch);
    if (typeof result === 'string') {
      return "bad channel set: "+result;
    }
    params.chanSet = result;
  } else {
    return "channel set missing";
  }
  // success
  return null;
}

// operations
app.get("/gvyhome/op/loaddays", function(req, res) {
  const params = {};
  const errMsg = parseStartTime(req.query, params, true) || parseEndTime(req.query, params, true);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    db.loadDays(params.tmStart, params.tmEnd);
    res.status(200).end();
  }
});

app.get("/gvyhome/op/sweepdays", function(req, res) {
  const params = {};
  const errMsg = parseStartTime(req.query, params, true) || parseEndTime(req.query, params, true);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    db.sweepDays(params.tmStart, params.tmEnd);
    res.status(200).end();
  }
});

app.get("/gvyhome/op/writeallchanges", function(req, res) {
  const force = !!req.query.force;
  const purge = !!req.query.purge;
  db.writeAllChanges({force: force, purge: purge});
  res.status(200).end();
});

// queries
app.get("/gvyhome/data/latest", function(req, res) {
  res.status(200).json(db.queryLatest());
});

app.get("/gvyhome/data/today", function(req, res) {
  const today = thyme.makeTimeNow().setMidnight();
  const params = {tmStart: today, tmEnd: today};
  const errMsg = parseSrcFilter(req.query, params);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).json(db.queryDays(params));
  }
});

app.get("/gvyhome/data/yesterday", function(req, res) {
  const yesterday = thyme.makeTimeNow().setMidnight().addDays(-1);
  const params = {tmStart: yesterday, tmEnd: yesterday};
  const errMsg = parseSrcFilter(req.query, params);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).json(db.queryDays(params));
  }
});

app.get("/gvyhome/data/days", function(req, res) {
  const params = {};
  const errMsg = parseStartTime(req.query, params) || parseEndTime(req.query, params) ||
                 parseSrcFilter(req.query, params);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).json(db.queryDays(params));
  }
});

app.get("/gvyhome/data/chans", function(req, res) {
  const params = {};
  const errMsg = parseStartTime(req.query, params) || parseEndTime(req.query, params) ||
                 parseChanSet(req.query, params);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).json(db.queryChans(params));
  }
});

// status
app.get("/gvyhome/status", function(req, res) {
  res.status(200).json(db.getStatus());
});

var port = 8082;
app.listen(port, function() {
  console.log("Server listening on port "+port);
});

// once a minute service
let prevEstHour = 999;
setInterval(() => {
  const date = new Date();
  const utcHour = date.getUTCHours();
  const estHour = (utcHour + 24 - 5) % 24;
  if (estHour != prevEstHour) {
    prevEstHour = estHour;
    // get weather once an hour
    weather.getWeather();
    if (estHour == 1) {
      // it is 1:00 AM in Connecticut!
      db.writeAllChanges({purge: true});
      journal.requestRotate();
    }
  }
}, 60000);

// catch interrupt signal, write database to files before exiting
process.on('SIGINT', function() {
  journal.stopJournalTimer();
  journal.closeJournal();
  db.writeAllChanges();
  process.exit();
});

#!/usr/bin/env nodejs
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const journal = require("./datajournal.js");
const db = require("./database.js");
const thyme = require("./thyme.js");
const weather = require("./weather.js");

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
// default is first day in database
function parseStartTime(query, params) {
  if (query.start) {
    params.tmStart = thyme.parseTimeRelaxed(query.start);
    if (!params.tmStart) {
      return "bad start time";
    }
  } else {
    params.tmStart = db.findFirstDay();
    if (!params.tmStart) {
      return "no first day";
    }
  }
  // success
  return null;
}

// parse end time or add ndays to start time
// end time is inclusive so ndays cannot be zero
// default is last day in database
function parseEndTime(query, params) {
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
    // assume you called parseStartTime first
    params.tmEnd = params.tmStart.clone().addDays(nDays-1);
  } else {
    params.tmEnd = db.findLastDay();
    if (!params.tmEnd) {
      return "no last day";
    }
  }
  // success
  return null;
}

function parseChanFilter(query, params) {
  if (query.chans) {
    params.chanFilter = db.parseChanFilter(query.chans);
    if (!params.chanFilter) {
      return "bad channel filter";
    }
  }
  // success
  return null;
}

// operations
app.get("/gvyhome/op/loaddays", function(req, res) {
  const params = {};
  const errMsg = parseStartTime(req.query, params) || parseEndTime(req.query, params);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    db.loadDays(params.tmStart, params.tmEnd);
    res.status(200).end();
  }
});

app.get("/gvyhome/op/sweepdays", function(req, res) {
  const params = {};
  const errMsg = parseStartTime(req.query, params) || parseEndTime(req.query, params);
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
  res.status(200).json(db.latestRecs).end();
});

app.get("/gvyhome/data/today", function(req, res) {
  const today = thyme.makeTimeNow().setMidnight();
  const params = {tmStart: today, tmEnd: today};
  res.status(200).json(db.queryDays(params));
});

app.get("/gvyhome/data/days", function(req, res) {
  const params = {};
  const errMsg = parseStartTime(req.query, params) || parseEndTime(req.query, params) ||
                 parseChanFilter(req.query, params);
  if (errMsg) {
    res.status(400).send(errMsg).end();
  } else {
    res.status(200).json(db.queryDays(params)).end();    
  }
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

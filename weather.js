var axios = require('axios');
var fs = require('fs');
var os = require('os');
var path = require('path');
var thyme = require("./thyme.js");
var journal = require("./datajournal.js");

const openweatherApiKeyPath = path.join(os.homedir(), ".openweather-api-key");
const openweatherApiKey = fs.readFileSync(openweatherApiKeyPath);
const ourHouseCoords = {
  lat: 41.488380,
  lon: -73.319633
};

function getWeather() {
  let url = "http://api.openweathermap.org/data/2.5/weather";
  url += "?lat=" + ourHouseCoords.lat;
  url += "&lon=" + ourHouseCoords.lon;
  url += "&units=imperial";
  url += "&appid=" + openweatherApiKey;
  axios.get(url)
    .then(resp => processWeatherData(resp.data))
    .catch(err => console.log("failed to get weather", err));
}

function processWeatherData(data) {
  if (data && data.main &&
      typeof data.main.temp === 'number' &&
      typeof data.main.humidity === 'number') {
    journal.addRecords({
      t: thyme.makeTimeNow().formatDateTime(),
      src: "ow1",
      temp: data.main.temp,
      humid: data.main.humidity
    });
  } else {
    console.log("bad weather data received", data);
  }
}

module.exports = {
  getWeather: getWeather
};

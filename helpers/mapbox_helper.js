const axios = require('axios');
require("dotenv").config();
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

  const retriveSuggestions = (search)=> axios.get(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${search}.json?country=us&proximity=ip&types=place%2Cpostcode%2Caddress%2Cdistrict%2Cregion&language=en&access_token=${MAPBOX_ACCESS_TOKEN}`
  )

  const estimatedLocationsTime = (locations)=> axios.get(
    `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${locations.staff_long},${locations.staff_lat};${locations.client_long},${locations.client_lat}?approaches=curb;curb&access_token=${MAPBOX_ACCESS_TOKEN}`
  )

module.exports = {
    retriveSuggestions,
    estimatedLocationsTime
}
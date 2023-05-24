const axios = require('axios');
require("dotenv").config();
const NOTIFICATION_FIREBASE_KEY = process.env.NOTIFICATION_FIREBASE_KEY;

function sendNotification(fcm_token,title,message){

    const notification =  {
        body:message,
        title:title,
        sound:"default"
    }

    const pushNotification = {
        notification: notification,
        to: fcm_token
    };

    axios.post('https://fcm.googleapis.com/fcm/send',pushNotification, {
        headers: {
            'Authorization': `key=${NOTIFICATION_FIREBASE_KEY}`
        }
        })
        .then((res) => {
        })
        .catch((error) => {
            
        })
}

module.exports = {
    sendNotification
}
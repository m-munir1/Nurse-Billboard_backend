require("dotenv").config();
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const service = process.env.TWILIO_SMS_SERVICE;
const twilio = require('twilio')(accountSid, authToken);


function sendSms(body,to){

    twilio.messages 
    .create({ 
       body: body,  
       messagingServiceSid: service,      
       to: to 
     }) 
    .then(message => {
        
    }) 
    .done();

}

module.exports = {
    sendSms
}
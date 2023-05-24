var nodemailer = require('nodemailer');
require("dotenv").config();
const NURSEBILLBOARD_EMAIL = process.env.NURSEBILLBOARD_EMAIL;
const NURSEBILLBOARD_PASSWORD = process.env.NURSEBILLBOARD_PASSWORD;

const transporter = nodemailer.createTransport({    //noreply@nursebillboard.com
    host: "p3plmcpnl499098.prod.phx3.secureserver.net",  
    port: 25,
    auth: {
        user: NURSEBILLBOARD_EMAIL,
        pass: NURSEBILLBOARD_PASSWORD
    }
});


function sendEmail(from,to,subject,body) {
    const mailOptions = {
        from, // sender address
        to, // list of receivers
        subject, // Subject line
        text:body
        //html: '<p>Your html here</p>'// plain text body
    };
    
    transporter.sendMail(mailOptions, function (err, info) {
        if(err){
            console.log(err)
        }

    });

}

function sendContactUsEmail(from,to,subject,body,error,response) {
    const mailOptions = {
        from, // sender address
        to, // list of receivers
        subject, // Subject line
        text:body
        //html: '<p>Your html here</p>'// plain text body
    };
    
    transporter.sendMail(mailOptions, function (err, info) {
        if(err){
            error(err)
            console.log(err)
            return
        }

        response("success")

    });

}
//nursebillboard-com.mail.protection.outlook.com.
function sendFileEmail(filename,buffer_xlsx,from,to,subject,body) {
    const mailOptions = {
        from, // sender address
        to, // list of receivers
        subject, // Subject line
        text:body,
        attachments:[
            {
                filename,
                content: buffer_xlsx,
            }]
        //html: '<p>Your html here</p>'// plain text body
    };
    
    transporter.sendMail(mailOptions, function (err, info) {
        if(err){
            console.log(err)
            return
        }

    });

}

module.exports = {
    sendEmail,
    sendContactUsEmail,
    sendFileEmail
};
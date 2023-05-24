require("dotenv").config();
var moment = require('moment');
const notification = require('./notifications')
const  pool = require("../connection");
const twilio = require("./twilio");
const {scheduleIndividualShift} = require("./scheduleShifts")


function postshift(staffList,phone,res,body,invoices_rate,isSchedule){
    pool.query(`
    call POST_INDIVIDUAL_SHIFT('${body.schedule_date}',(SELECT id FROM individuals WHERE phone LIKE '${phone}'),'${body.language}','${body.gender}',${body.lat},${body.long},'${body.details}',
    ${body.hours},'${body.role}',FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(CURRENT_TIMESTAMP) / 900)),
    FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ${body.hours} hour)) / 900)),'${body.tasks}',
    '${body.address}','${body.state}','${body.city}','${body.postal_code}','${body.country}',${invoices_rate.invoice_rate},${invoices_rate.invoice_rate_staff});
    `,(err,results,fields) =>{
        if(err){
            if (!isSchedule){
                res.status(500).send({message:err.sqlMessage})
            }
            return
        }

        //Autotamically cancel/compelete
        scheduleIndividualShift(
            results[0][0].individual_id,
            results[0][0].id,
            moment(results[0][0].start_time).add(15,'m').format('YYYY-MM-DD HH:mm:ss'),
            moment(results[0][0].end_time).add(15,'m').format('YYYY-MM-DD HH:mm:ss'))
        
        notifyStaff(staffList,results[0][0].invoice_rate_staff)

        if (!isSchedule) {
            results[0] = results[0].map(({invoice_rate_staff, ...row}) => (
                row.staff = null, 
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.tasks = row.tasks.split("/"),
                row));
    
            res.send({status:"success",shift:results[0][0]})
        } else{
            deleteScheduledFutureShift(results[0][0].future_schedule_id)
            twilio.sendSms(`Your scheduled shift has been posted`,phone)
            notification.sendNotification(results[0][0].individual_fcm_token,`Scheduled Shift posted`,`Your scheduled shift has been posted`)
        }
      
    })
}

async function notifyStaff(staffList,invoice_rate_staff) {
    await Promise.all(staffList.map(async (staff) => {
        twilio.sendSms(`Hello, a nearby Homecare shift is open now for ${invoice_rate_staff}/hr with Nursebillboard`,staff.phone)
        notification.sendNotification(staff.fcm_token,`Nearby HomeCare Shift`,`Hello, a nearby HomeCare shift is open now for ${invoice_rate_staff}/hr with Nursebillboard`)
    }));
}

function deleteScheduledFutureShift(future_schedule_id) {
    pool.query(`
    DELETE FROM future_individual_schedule WHERE id = ${future_schedule_id};
    `,(err,results,fields) =>{
        if(err){
            console.log()
            return
        }
      
    })
}

module.exports = {
    postshift
}
require("dotenv").config();
const schedule = require('node-schedule');
const MAXIMUM_MILES = process.env.MAXIMUM_MILES;
const post_individual_shift = require("./post-individual-shift");
const notification = require('./notifications')
const  pool = require("../connection");
const twilio = require("./twilio");

function scheduleFutureShift(phone,body,invoices_rate){


    schedule.scheduleJob(`${phone+body.schedule_date}`,body.schedule_date, 
    function(){

        pool.query(`
        SELECT *,
        (SELECT fcm_token FROM individuals WHERE phone LIKE '${phone}') as individual_fcm_token,
        (SELECT future_individual_schedule.id FROM future_individual_schedule WHERE schedule_date = '${body.schedule_date}' AND future_individual_schedule.individual_id = individual_shifts.individual_id) as future_schedule_id
        FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${phone}') HAVING shift_finished = false AND shift_cancelled = false;

        SELECT fcm_token,phone
        FROM staff WHERE account_approved = true AND DISTANCE_BETWEEN(lat,lng,${body.lat},${body.long}) <= ${MAXIMUM_MILES} and
        (SELECT count(id) FROM individual_shifts WHERE staff_hired_id = id AND shift_finished = false AND shift_cancelled = false) = 0 and
        (SELECT count(id) FROM facility_shifts Where 
        CASE WHEN 
        CASE WHEN FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(CURRENT_TIMESTAMP) / 900)) between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
        or 
        CASE WHEN FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ${body.hours} hour)) / 900)) between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end 
        or
        CASE WHEN facility_shifts.start_time between FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(CURRENT_TIMESTAMP) / 900)) and FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ${body.hours} hour)) / 900)) THEN true ELSE false end
        or
        CASE WHEN facility_shifts.end_time between FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(CURRENT_TIMESTAMP) / 900)) and FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ${body.hours} hour)) / 900)) THEN true ELSE false end
        THEN true
        ELSE false END = true
        and facility_shifts.shift_finished = false AND facility_shifts.shift_cancelled = false AND facility_shifts.staff_hired_id = staff.id) = 0;
        `,(err,shift,fields) =>{
            if(err){
                console.log(err)
                return
            }
            
            if(shift[0][0]){
                deleteScheduledFutureShift(shift[0][0].future_schedule_id)
                console.log('Scheduled shift Canceled because you have active shift now')
                twilio.sendSms(`Scheduled shift Canceled because you have active shift now`,phone)
                notification.sendNotification(shift[0][0].individual_fcm_token,`Scheduled shift Canceled`,`Scheduled shift not posted because you have active shift now`)
                return
            }
    
            post_individual_shift.postshift(shift[1],phone,null,body,invoices_rate,true)

        })

    })

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
    scheduleFutureShift
}
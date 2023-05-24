const schedule = require('node-schedule');
var moment = require('moment');
const {sendNotification} = require('./notifications')
const {transferCharge,refundCharge} = require('./stripe_helper')
const  pool = require("../connection");
const twilio = require("../helpers/twilio");
const overtime = require("../helpers/overtime");
const timesheet = require("../helpers/timesheet_form")


function scheduleFacilityShift(facility_id,shift_id,start_time,end_time){
    
    schedule.cancelJob(`${shift_id}start`)
    schedule.cancelJob(`${shift_id}end`)
    schedule.cancelJob(`${shift_id}clockinreminder`)
    schedule.cancelJob(`${shift_id}clockoutreminder`)

    schedule.scheduleJob(`${shift_id}clockinreminder`,moment(start_time).subtract(30,'m').toDate(), 
    function(){
        reminderFacilityShift(
            shift_id,
            `Shift #${shift_id} reminder`,
            'Your Shift will start after 15 mins, please clockin')
    })

    schedule.scheduleJob(`${shift_id}clockinreminder`,moment(end_time).subtract(30,'m').toDate(), 
    function(){
        reminderFacilityShift(
            shift_id,
            `Shift #${shift_id} reminder`,
            'Your Shift will end after 15 mins')
    })

    schedule.scheduleJob(`${shift_id}start`,start_time,
    function(){
        cancelStartFacilityShift(facility_id,shift_id)
    })
    
    schedule.scheduleJob(`${shift_id}end`,end_time,
    function(){
        endFacilityShift(facility_id,shift_id)
    })


    const current_time = moment().format('YYYY-MM-DD HH:mm:ss')

    if(current_time >= end_time){
        console.log("test")
        endFacilityShift(facility_id,shift_id)
        return
    }else if(current_time >= start_time){
        cancelStartFacilityShift(facility_id,shift_id)
    }


}

function cancelStartFacilityShift(facility_id,shift_id){
    pool.query(`SELECT *,
    (SELECT fcm_token FROM staff WHERE id = facility_shifts.staff_hired_id) as staff_fcm,
    (SELECT fcm_token FROM facilites WHERE id = ${facility_id}) as facility_fcm_token
    FROM facility_shifts WHERE id = ${shift_id} HAVING shift_finished = false AND shift_cancelled = false;`,(err,shift,fields) =>{
            if(!err){   
                if(shift[0]){
                    cancelFacilityShiftStartOnTime(shift)
                }else{
                    schedule.cancelJob(`${shift_id}start`)
                }
            }else{
            }
        })
}

function endFacilityShift(facility_id,shift_id){
    const privous_saturday = moment().day(moment().day() > 6 ? 6 :-1).format('YYYY-MM-DD')
    const next_friday = moment(privous_saturday).add(6,'day').format('YYYY-MM-DD')

    pool.query(`SELECT * ,
    (SELECT json_object('first_name',staff.first_name,'last_name',staff.last_name) FROM staff WHERE id = facility_shifts.staff_hired_id) as staff,
    (SELECT json_object('admin_name',facilites.admin_name,'facility_name',facilites.facility_name,'admin_title',facilites.admin_title) FROM facilites WHERE id = facility_shifts.facility_id) as facility,
    CALCULATE_FACILITY_INVOICE(facility_shifts.clockin_time,date_add(DATE_FORMAT(facility_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute),facility_shifts.invoice_rate_staff) as total_price_staff,
    CALCULATE_FACILITY_INVOICE(facility_shifts.clockin_time,date_add(DATE_FORMAT(facility_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute),facility_shifts.invoice_rate) as total_price_facility,
    (SELECT fcm_token FROM staff WHERE id = facility_shifts.staff_hired_id) as staff_fcm_token,
    TIMESTAMPDIFF(MINUTE,facility_shifts.clockin_time,CURRENT_TIMESTAMP) as worked_time,
    (SELECT sum(worked_minutes) FROM facility_shifts as fshift WHERE fshift.staff_hired_id = facility_shifts.staff_hired_id 
    AND shift_finished = true AND fshift.facility_id = facility_shifts.facility_id AND fshift.start_time BETWEEN '${privous_saturday}' AND '${next_friday}') / 60 as worked_hours_facility,
    (SELECT stripe_account FROM staff_requirements WHERE staff_id = facility_shifts.staff_hired_id) as stripe_account,
    (SELECT fcm_token FROM facilites WHERE id = ${facility_id}) as facility_fcm_token
    FROM facility_shifts WHERE id = ${shift_id} HAVING shift_finished = false AND shift_cancelled = false;`,(err,shift,fields) =>{
        if(!err){   
            if(shift[0]){
                compeleteFacilityShiftEnd(shift)
            }else{
                schedule.cancelJob(`${shift_id}end`)
            }
        }else{
            console.log(err)
        }
    })
}

function cancelFacilityShiftStartOnTime(shift){

    if(shift[0].staff_hired_id){ 
        cancelFacilityShiftStartHired(shift)
        return
    }

    cancelFacilityNotHired(shift)

}

function cancelFacilityShiftStartHired(shift){ 

    if(!shift[0].shift_starts){

        pool.query(`
        UPDATE facility_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP, cancelled_reason = 'Automatically Cancelled, staff didn''t comes at shift time' WHERE id = ${shift[0].id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} Cancelled','Shift Canceled due to No Show or No Clock-in',${shift[0].facility_id},CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${shift[0].id} Cancelled','Shift Canceled due to No Show or No Clock-in',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
        DELETE FROM facility_schedule WHERE name = ${shift[0].id};`
        ,(err,response,fields) =>{
            if(!err){ 
                sendNotification(shift[0].facility_fcm_token,`Shift #${shift[0].id} Cancelled`,`Shift Canceled due to No Show or No Clock-in`)
                sendNotification(shift[0].staff_fcm,`Shift #${shift[0].id} Cancelled`,`Shift Canceled due to No Show or No Clock-in`)
            }else{
               console.log(err)

            }
        })  
    }

}
  
function compeleteFacilityShiftEnd(shift){

    const calculate_overtime = overtime.calculateOvertime(shift)

    if(shift[0].staff_hired_id){

        if(shift[0].shift_starts && !shift[0].shift_finished && !shift[0].shift_cancelled){

            const facility = JSON.parse(shift[0].facility)  
            const staff = JSON.parse(shift[0].staff) 

            pool.query(`
            UPDATE facility_shifts SET overtime_hours = ${calculate_overtime.overtime_hours} , overtime_rate = ${calculate_overtime.overtime_rate}, overtime_staff_rate = ${calculate_overtime.overtime_staff_rate}, double_hours = ${calculate_overtime.double_hours}, double_rate = ${calculate_overtime.double_rate} , double_staff_rate = ${calculate_overtime.double_staff_rate} , clockout_signature = '${shift[0].id}sheet.pdf' ,shift_finished = true, clockout_time = date_add(DATE_FORMAT(facility_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute), finished_price_facility = ${calculate_overtime.total_price_facility_overide}, finished_price_staff = ${calculate_overtime.total_price_staff_overide},worked_minutes = ${shift[0].worked_time}, is_overtime_hours = ${calculate_overtime.is_overtime_hours} WHERE id = ${shift[0].id};
            UPDATE invoices SET amount = amount + ${calculate_overtime.total_price_facility_overide} WHERE id = ${shift[0].invoice_id};
            INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} Compeleted','The staff finshed shift #${shift[0].id}',${shift[0].facility_id},CURRENT_TIMESTAMP);
            INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${shift[0].id} Compeleted','The Shift completed automatically',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
            DELETE FROM facility_schedule WHERE name = ${shift[0].id};`
            ,(err,responseFinish,fields) =>{
                if(!err){ 

                    timesheet.addSignSheetToShift({
                        shift_id:shift[0].id,
                        employee_signature:null,
                        facility_name:facility.facility_name,
                        start_time:moment(shift[0].start_time).utcOffset(shift[0].time_zone),
                        floor:shift[0].floor,
                        role:((shift[0].role == 'HomeCare Aide')? 'CNA': shift[0].role),
                        staff_first_name:staff.first_name,
                        staff_last_name:staff.last_name,
                        clockin_time:moment(shift[0].clockin_time).utcOffset(shift[0].time_zone),
                        clockout_time:moment(shift[0].end_time).add(15,'minutes').utcOffset(shift[0].time_zone),
                        admin_name:facility.admin_name,
                        admin_title:facility.admin_title,
                        auto_clockout:true
                    },success=>{
                        sendNotification(shift[0].facility_fcm_token,`Shift #${shift[0].id} Completed`,`The staff has completed shift #${shift[0].id}`)
                        sendNotification(shift[0].staff_fcm_token,`Shift #${shift[0].id} Completed`,`The Shift #${shift[0].id} completed automatically`)
                    })

                }else{
                    console.log(err)
                }
            })

        }else{
            pool.query(`
            UPDATE facility_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP, cancelled_reason = 'Automatically Cancelled, Staff didn''t clocked-In' WHERE id = ${shift[0].id};
            INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} Cancelled','Shift Canceled due to No Show or No Clock-in',${shift[0].facility_id},CURRENT_TIMESTAMP);
            INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${shift[0].id} Cancelled','Shift Canceled due to No Show or No Clock-in',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
            DELETE FROM facility_schedule WHERE name = ${shift[0].id};`
            ,(err,response,fields) =>{
                if(!err){ 
                    sendNotification(shift[0].facility_fcm_token,`Shift #${shift[0].id} Cancelled`,`Shift Canceled due to No Show or No Clock-in`)
                    sendNotification(shift[0].staff_fcm_token,`Shift #${shift[0].id} Cancelled`,`Shift Canceled due to No Show or No Clock-in`)
                }else{
                   console.log(err)

                }
            })  
        }

        return
    }else{
        cancelFacilityNotHired(shift)
    }

}

function cancelFacilityNotHired(shift){

    pool.query(`
    UPDATE facility_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP, cancelled_reason = 'Automatically Cancelled, No staff hired before shift time' WHERE id = ${shift[0].id};
    INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} Cancelled','Automatically Cancelled, No staff hired before shift time',${shift[0].facility_id},CURRENT_TIMESTAMP);
    DELETE FROM facility_schedule WHERE name = ${shift[0].id};`
    ,(err,response,fields) =>{
        if(!err){ 
            sendNotification(shift[0].facility_fcm_token,`Shift #${shift[0].id} Cancelled`,`Automatically Cancelled, No staff hired before shift time`)
        }else{
            console.log(err)
        }
    })  

}

function reminderFacilityShift(shift_id,title,body){

    pool.query(`
    SELECT * , 
    (SELECT fcm_token FROM staff WHERE id = facility_shifts.staff_hired_id) as staff_fcm,
    (SELECT phone FROM staff WHERE id = facility_shifts.staff_hired_id) as staff_phone
    FROM facility_shifts WHERE id = ${shift_id} HAVING shift_finished = false AND shift_cancelled = false;`,(err,shift,fields) =>{
        if(err){   
            console.log(err)
            return
        }

        if(!shift[0]){
            return
        }

        if(shift[0].staff_hired_id){
            pool.query(`
            INSERT INTO staff_notifications(title,body,staff_id,date) values('${title}','${body}',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
            `,(err,response,fields) =>{
                if(!err){   
                    twilio.sendSms(`${title}, ${body}`,shift[0].staff_phone)
                    sendNotification(shift[0].staff_fcm,`${title}`,`${body}`)
                }else{
                    console.log(err)
                }
            })

        }
        
    })

}

//Individual Schedule
function scheduleIndividualShift(individual_id,shift_id,start_time,end_time){

    schedule.cancelJob(`${individual_id}start`)
    schedule.cancelJob(`${individual_id}end`)
    schedule.cancelJob(`${individual_id}clockinreminder`)
    schedule.cancelJob(`${individual_id}clockoutreminder`)

    schedule.scheduleJob(`${individual_id}clockinreminder`,moment(start_time).subtract(30,'m').toDate(), 
    function(){
        reminderIndividualShift(
            shift_id,
            `Live Shift #${shift_id} reminder`,
            'Your Shift will start after 15 mins, please clockin')
    })

    schedule.scheduleJob(`${individual_id}clockoutreminder`,moment(end_time).subtract(30,'m').toDate(), 
    function(){
        reminderIndividualShift(
            shift_id,
            `Live Shift #${shift_id} reminder`,
            'Your Shift will end after 15 mins')
    })

    schedule.scheduleJob(`${individual_id}start`,start_time,
    function(){
    cancelStartIndividualShift(individual_id,shift_id)
    })

    schedule.scheduleJob(`${individual_id}end`,end_time,
    function(){
        endIndividualShift(individual_id,shift_id)
    })

    const current_time = moment().format('YYYY-MM-DD HH:mm:ss')
    if(current_time >= end_time){
        endIndividualShift(individual_id,shift_id)
        return
    }else if(current_time >= start_time){
        cancelStartIndividualShift(individual_id,shift_id)
    }

}

function cancelStartIndividualShift(individual_id,shift_id){
    pool.query(`SELECT *,
        (SELECT mileage FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as mileage,
        (SELECT fcm_token FROM individuals WHERE id = ${individual_id}) as individual_fcm_token,
        (SELECT fcm_token FROM staff WHERE id = individual_shifts.staff_hired_id) as staff_fcm
        FROM individual_shifts WHERE id = ${shift_id} HAVING shift_finished = false AND shift_cancelled = false;`,(err,shift,fields) =>{
            if(err){   
              return
            }

            if(shift[0]){
                cancelIndividualShiftStartOnTime(shift)
            }else{
                schedule.cancelJob(`${individual_id}start`)
            }

        })
}

function cancelIndividualShiftStartOnTime(shift){

        if(shift[0].staff_hired_id){ 
         
            cancelIndividualShiftStartHired(shift)

            return
        }

        if(!shift[0].shift_extended){
            pool.query(`
            UPDATE individual_schedule SET start_time = '${moment(shift[0].start_time).add(1,'h').format('YYYY-MM-DD HH:mm:ss')}' , end_time = '${moment(shift[0].end_time).add(1,'h').format('YYYY-MM-DD HH:mm:ss')}' WHERE name = ${shift[0].id};
            UPDATE individual_shifts SET shift_extended = true, start_time = DATE_ADD(start_time,INTERVAL 1 hour), end_time = DATE_ADD(end_time,INTERVAL 1 hour) WHERE id = ${shift[0].id};
            INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${shift[0].id} Extended','Your Live shift is extended one hour due to no staff hired',${shift[0].individual_id},CURRENT_TIMESTAMP);`
            ,(err,response,fields) =>{
                if(!err){ 
                    sendNotification(shift[0].individual_fcm_token,`Live Shift #${shift[0].id} Extended`,"Your Live shift is extended one hour due to no staff hired")
                    scheduleIndividualShift(shift[0].individual_id,shift[0].id,moment(shift[0].start_time).add(1,'h').add(15,'m').toDate(),moment(shift[0].end_time).add(1,'h').add(15,'m').toDate())
                }else{
                    console.log(err)
                }
            }) 
            return                
        }


        cancelIndividualNotHired(shift) 
 
}

function cancelIndividualShiftStartHired(shift){

    if(!shift[0].shift_starts){
        refundCharge(shift[0].payment_intent_stripe,
            (success)=>{
                cancelShiftHired(shift,true,success.id)
            },
            (error)=>{
                cancelShiftHired(shift,false,null)
            })
    }

}

function cancelShiftHired(shift,refunded,refund_id){
    pool.query(`
    UPDATE individual_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP, cancelled_reason = 'Automatically Cancelled, staff didn''t comes at shift time',shift_refunded = ${refunded}, payment_refund_stripe = if('${refund_id}' is not null,'${refund_id}',payment_refund_stripe) WHERE id = ${shift[0].id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${shift[0].id} Cancelled','Live Shift Canceled due to No Show or No Clock-in',${shift[0].individual_id},CURRENT_TIMESTAMP);
    INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift #${shift[0].id} Cancelled','Live Shift Canceled due to No Show or No Clock-in',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
    DELETE FROM individual_schedule WHERE name = ${shift[0].id};`
    ,(err,response,fields) =>{
        if(!err){ 
            sendNotification(shift[0].individual_fcm_token,`Live Shift #${shift[0].id} Cancelled`,"Live Shift Canceled due to No Show or No Clock-in, your money will refund")
            sendNotification(shift[0].staff_fcm,`Live Shift #${shift[0].id} Cancelled`,"Live Shift Canceled due to No Show or No Clock-in")
        }else{
            console.log(err)

        }
    })  
}

function endIndividualShift(individual_id,shift_id){
    pool.query(`
    SELECT *,
    (SELECT fcm_token FROM individuals WHERE id = ${individual_id}) as individual_fcm_token,
    (SELECT fcm_token FROM staff WHERE id = individual_shifts.staff_hired_id) as staff_fcm_token,
    (SELECT mileage FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as mileage,
    (SELECT stripe_account FROM staff_requirements WHERE staff_id = individual_shifts.staff_hired_id) as stripe_account
    FROM individual_shifts WHERE id = ${shift_id} HAVING shift_finished = false AND shift_cancelled = false;`,(err,shift,fields) =>{
        if(!err){   
            if(shift[0]){
                compeleteIndividualShiftEnd(shift)
            }else{
                schedule.cancelJob(`${individual_id}start`)
                schedule.cancelJob(`${individual_id}end`)
                schedule.cancelJob(`${individual_id}clockinreminder`)
                schedule.cancelJob(`${individual_id}clockoutreminder`)
            }
        }else{
        }
    })
}

function compeleteIndividualShiftEnd(shift){

    if(shift[0].staff_hired_id){
        
        if(shift[0].shift_starts && !shift[0].shift_finished && !shift[0].shift_cancelled){

            transferCharge((shift[0].invoice_rate_staff + shift[0].mileage) * 100, shift[0].stripe_account, shift[0].payment_charge_stripe,
                (success)=>{
                    pool.query(`
                    INSERT INTO staff_transfers(shift_id,staff_id,transfer_id) values(${shift[0].id},${shift[0].staff_hired_id},'${success.id}');
                    UPDATE individual_shifts SET shift_finished = true,clockout_time = date_add(DATE_FORMAT(individual_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute), staff_paid = true WHERE id = ${shift[0].id};
                    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${shift[0].id} Compeleted','The Shift completed automatically',${shift[0].individual_id},CURRENT_TIMESTAMP);
                    INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift #${shift[0].id} Compeleted','The Shift completed automatically',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
                    DELETE FROM individual_schedule WHERE name = ${shift[0].id};`
                    ,(err,responseFinish,fields) =>{
                        if(!err){ 
                            sendNotification(shift[0].individual_fcm_token,`Live Shift ${shift[0].id} Completed`,"The Shift completed automatically")
                            sendNotification(shift[0].staff_fcm_token,`Live Shift ${shift[0].id} Completed`,"The Shift completed automatically")
                        }else{
                            console.log(err)
                        }
                    })
                },
                (error)=>{
                    pool.query(`
                    UPDATE individual_shifts SET shift_finished = true,clockout_time = date_add(DATE_FORMAT(individual_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute), staff_paid = false, transfer_error = '${error.err.raw.message}' WHERE id = ${shift[0].id};
                    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${shift[0].id} Compeleted','The Shift completed automatically',${shift[0].individual_id},CURRENT_TIMESTAMP);
                    INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift #${shift[0].id} Compeleted','The Shift completed automatically',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
                    DELETE FROM individual_schedule WHERE name = ${shift[0].id};`
                    ,(err,responseFinish,fields) =>{
                        if(!err){ 
                            sendNotification(shift[0].individual_fcm_token,`Live Shift ${shift[0].id} Completed`,"The Shift completed automatically")
                            sendNotification(shift[0].staff_fcm_token,`Live Shift ${shift[0].id} Completed`,"The Shift completed automatically")
                        }else{
                            console.log(err)
                        }
                    })
                })

        }else{

            refundCharge(shift[0].payment_charge_stripe,shift[0].payment_intent_stripe,
                (success)=>{
                    cancelShiftHired(shift,true)
                },
                (error)=>{
                    cancelShiftHired(shift,false)
                })
        }

        return
    }else{
        cancelIndividualNotHired()
    }
            
   
}

function cancelIndividualNotHired(shift){
    pool.query(`
    UPDATE individual_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP, cancelled_reason = 'Automatically Cancelled, No staff hired before shift time' WHERE id = ${shift[0].id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${shift[0].id} Cancelled','Automatically Cancelled, No staff hired before shift time',${shift[0].individual_id},CURRENT_TIMESTAMP);
    DELETE FROM individual_schedule WHERE name = ${shift[0].id};`
    ,(err,response,fields) =>{
        if(!err){ 
            sendNotification(shift[0].individual_fcm_token,`Live Shift #${shift[0].id} Cancelled`,"Automatically Cancelled  No staff hired before shift time")
        }else{
            console.log(err)
        }
    })   
}


function reminderIndividualShift(shift_id,title,body){

        pool.query(`
        SELECT *,
        (SELECT fcm_token FROM staff WHERE id = individual_shifts.staff_hired_id) as staff_fcm,
        (SELECT phone FROM staff WHERE id = individual_shifts.staff_hired_id) as staff_phone
        FROM individual_shifts WHERE id = ${shift_id} HAVING shift_finished = false AND shift_cancelled = false;`,(err,shift,fields) =>{
            if(err){   
                console.log(err)
                return
            }

            if(!shift[0]){
                return
            }

            if(shift[0].staff_hired_id){
                pool.query(`
                INSERT INTO staff_notifications(title,body,staff_id,date) values('${title}','${body}',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
                `,(err,response,fields) =>{
                    if(err){   
                        console.log(err)
                    }
                    twilio.sendSms(`${title}, ${body}`,shift[0].staff_phone)
                    sendNotification(shift[0].staff_fcm,`${title}`,`${body}`)
                })
            }
            
        })

}

module.exports = {
    scheduleFacilityShift,
    scheduleIndividualShift
}
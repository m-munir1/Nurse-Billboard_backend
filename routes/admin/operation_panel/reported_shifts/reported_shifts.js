const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const { sendNotification } = require('../../../../helpers/notifications')
const {transferCharge, refundCharge} = require("../../../../helpers/stripe_helper");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
var moment = require('moment');

app.get("/individual_reports",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{

    const date = req.query.date //FORMAT = 'YYYY-MM-DD' 
    var time_zone = req.query.time_zone

    if(!time_zone.includes("+")){
        time_zone = '+'+req.query.time_zone.replace(/\s+/g, '')
      }

    var machine_timezone = new Date().toString().match(/([-\+][0-9]+)\s/)[1]
    var len = machine_timezone.length;
    machine_timezone = machine_timezone.substring(0, len-2) + ":" + machine_timezone.substring(len-2);

    pool.query(`
    SELECT *,
    (SELECT json_object('id',staff.id,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role,'email',staff.email)  
    FROM staff WHERE id = individual_shifts.staff_hired_id) as staff,
    (SELECT json_object('id',individuals.id,'full_name',individuals.full_name,'phone',individuals.phone,'email',individuals.email)  
    FROM individuals WHERE id = individual_shifts.individual_id) as individual
    FROM reports_individual_shifts
    INNER JOIN individual_shifts ON individual_shifts.id = reports_individual_shifts.shift_id WHERE 
    DATE_FORMAT(CONVERT_TZ(individual_shifts.start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}' AND
    reports_individual_shifts.solved = false`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({shift_id, ...row}) => (
            row.staff = JSON.parse(row.staff),
            row.individual = JSON.parse(row.individual),
            row));

        res.send(rows)

    })
})

app.post("/individual_refund",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    const shift_id = req.query.shift_id 

    pool.query(`
    SELECT *,
    (SELECT fcm_token FROM staff WHERE id = individual_shifts.staff_hired_id) as staff_fcm_token,
    (SELECT fcm_token FROM individuals WHERE id = individual_shifts.individual_id) as individual_fcm_token,
    (SELECT solved FROM reports_individual_shifts WHERE shift_id = ${shift_id}) as reported_shift_solved,
    (SELECT id FROM reports_individual_shifts WHERE shift_id = ${shift_id}) as reported_shift_id
    FROM individual_shifts WHERE id = ${shift_id} AND shift_reported = true`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(rows[0].reported_shift_solved = true){
            res.status(409).send({status:"refunded",message:"This report is already solved"})
            return
        }

        refundCharge(rows[0].payment_intent_stripe,
            (success)=>{
                refundIndividualShift(res,rows,refund_id)
            },
            (error)=>{
                res.send({status:"error",error})
            })
                   
    })

})

app.post("/individual_pay_staff",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    const shift_id = req.query.shift_id 

    pool.query(`
    SELECT *,
    (SELECT fcm_token FROM staff WHERE id = individual_shifts.staff_hired_id) as staff_fcm_token,
    (SELECT fcm_token FROM individuals WHERE id = individual_shifts.individual_id) as individual_fcm_token,
    (SELECT solved FROM reports_individual_shifts WHERE shift_id = ${shift_id}) as reported_shift_solved,
    (SELECT staff_requirements.stripe_account FROM staff_requirements WHERE staff_id = individual_shifts.staff_hired_id) as stripe_account,
    (SELECT mileage FROM staff_applyshifts WHERE shift_id = individual_shifts.id AND staff_id = individual_shifts.staff_hired_id) as mileage,
    (SELECT id FROM reports_individual_shifts WHERE shift_id = ${shift_id}) as reported_shift_id
    FROM individual_shifts WHERE id = ${shift_id} AND shift_reported = true`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(rows[0].reported_shift_solved = true){
            res.status(409).send({status:"refunded",message:"This report is already solved"})
            return
        }

        transferCharge((rows[0].invoice_rate_staff + rows[0].mileage) * 100 ,rows[0].stripe_account,rows[0].payment_charge_stripe,
        (success)=>{
            payStaffIndividualShift(res,rows,success)
        },
        (error)=>{
            res.send({status:"error",error})
        })                   
    })

})

function refundIndividualShift(res,rows,refund_id){
    pool.query(`
    UPDATE individual_shifts SET shift_refunded = true, payment_refund_stripe = '${refund_id}' WHERE id = ${rows[0].id};
    UPDATE reports_individual_shifts SET solved = true WEHERE id = ${rows[0].reported_shift_id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Shift #${rows[0].id} refunded','Your shift is refunded, wait some days until deposit into your payment method.',${rows[0].individual_id},CURRENT_TIMESTAMP);
    INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift #${rows[0].id}','This shift is reviewed and refunded to client.',${rows[0].staff_hired_id},CURRENT_TIMESTAMP);
    `,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
        sendNotification(rows[0].individual_fcm_token,`Shift #${rows[0].id} refunded`,`Your shift is refunded, wait some days until deposit into your payment method.`)
        sendNotification(rows[0].staff_fcm_token,`Live Shift #${rows[0].id}`,`This shift is reviewed and refunded to client.`)

        res.send({status:"success",message:"Shift successfully refunded"})
    })
}

function payStaffIndividualShift(res,rows,success){
    pool.query(`
    INSERT INTO staff_transfers(shift_id,staff_id,transfer_id) values('${rows[0].id}',${rows[0].staff_hired_id},'${success.id}');
    UPDATE individual_shifts SET shift_finished = true , staff_paid = true WHERE id = ${rows[0].id};
    UPDATE reports_individual_shifts SET solved = true WEHERE id = ${rows[0].reported_shift_id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${rows[0].id} Compeleted','After reviewing we compeleted the shift',${rows[0].individual_id},CURRENT_TIMESTAMP);
    INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift #${rows[0].id} Compeleted','After reviewing we compeleted the Live shift',${rows[0].staff_hired_id},CURRENT_TIMESTAMP);`
    ,(err,responseFinish,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }
        sendNotification(rows[0].individual_fcm_token,`Live Shift #${rows[0].id} Completed`,"After reviewing we compeleted the shift")
        sendNotification(rows[0].staff_fcm_token,`Live Shift #${rows[0].id} Completed`,"After reviewing we compeleted the Live shift")
        res.send({status:"success",message:"Shift successfully paid staff"})
    })
}

//Facility
app.get("/facility_reports",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    const date = req.query.date //FORMAT = 'YYYY-MM-DD'
    var time_zone = req.query.time_zone

    if(!time_zone.includes("+")){
        time_zone = '+'+req.query.time_zone.replace(/\s+/g, '')
      }

    var machine_timezone = new Date().toString().match(/([-\+][0-9]+)\s/)[1]
    var len = machine_timezone.length;
    machine_timezone = machine_timezone.substring(0, len-2) + ":" + machine_timezone.substring(len-2);

    pool.query(`
    SELECT *,
    (SELECT json_object('id',staff.id,'full_name',staff.full_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role,'email',staff.email)  
    FROM staff WHERE id = facility_shifts.staff_hired_id) as staff,
    (SELECT json_object('id',facilites.id,'facility_name',facilites.facility_name,'phone',facilites.phone,'email',facilites.email,'lat',facilites.lat,'lng',facilites.lng)  
    FROM facilites WHERE id = facility_shifts.facility_id) as facility
    FROM reports_facility_shifts
    INNER JOIN facility_shifts ON facility_shifts.id = reports_facility_shifts.shift_id WHERE 
    DATE_FORMAT(CONVERT_TZ(facility_shifts.start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}' AND
    reports_facility_shifts.solved = false`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({shift_id, ...row}) => (
            row.staff = JSON.parse(row.staff),
            row.facility = JSON.parse(row.facility),
            row));
                   
        res.send(rows)

    })
})

app.post("/facility_close",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    const shift_id = req.query.shift_id 

    pool.query(`
    SELECT *,
    (SELECT fcm_token FROM staff WHERE id = facility_shifts.staff_hired_id) as staff_fcm_token,
    (SELECT solved FROM reports_facility_shifts WHERE shift_id = ${shift_id}) as reported_shift_solved,
    (SELECT facilites.fcm_token FROM facilites WHERE id LIKE facility_shifts.facility_id) as facility_fcm_token,
    (SELECT id FROM reports_facility_shifts WHERE shift_id = ${shift_id}) as reported_shift_id
    FROM facility_shifts WHERE id = ${shift_id} AND shift_reported = true`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(rows[0].reported_shift_solved = true){
            res.status(409).send({status:"refunded",message:"This report is already solved"})
            return
        }

        pool.query(`
        UPDATE reports_facility_shifts SET solved = true WEHERE id = ${rows[0].reported_shift_id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${rows[0].id} closed','After reviewing we closed the shift',${rows[0].facility_id},CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${rows[0].id} closed','After reviewing we closed the shift',${rows[0].staff_hired_id},CURRENT_TIMESTAMP);`
        ,(err,responseFinish,fields) =>{
            if(err){ 
                res.status(500).send({message:err.sqlMessage})
                return
            }
            sendNotification(rows[0].facility_fcm_token,`Shift #${rows[0].id} closed`,"After reviewing we closed the shift")
            sendNotification(rows[0].staff_fcm_token,`Shift #${rows[0].id} closed `,"After reviewing we closed the shift")
            res.send({status:"success",message:"Shift successfully closed"})
        })
                   
    })

})

app.post("/facility_complete",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    const shift_id = req.query.shift_id 

    pool.query(`
    SELECT *,
    CALCULATE_FACILITY_INVOICE(facility_shifts.clockin_time,facility_shifts.reported_time,facility_shifts.invoice_rate_staff) as total_price_staff,
    CALCULATE_FACILITY_INVOICE(facility_shifts.clockin_time,facility_shifts.reported_time,facility_shifts.invoice_rate) as total_price_facility,
    (SELECT fcm_token FROM staff WHERE id = facility_shifts.staff_hired_id) as staff_fcm_token,
    (SELECT solved FROM reports_facility_shifts WHERE shift_id = ${shift_id}) as reported_shift_solved,
    (SELECT facilites.fcm_token FROM facilites WHERE id LIKE facility_shifts.facility_id) as facility_fcm_token,
    (SELECT id FROM reports_facility_shifts WHERE shift_id = ${shift_id}) as reported_shift_id
    FROM facility_shifts WHERE id = ${shift_id} AND shift_reported = true`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(rows[0].reported_shift_solved = true){
            res.status(409).send({status:"refunded",message:"This report is already solved"})
            return
        }

        pool.query(`
        UPDATE facility_shifts SET shift_finished = true, finished_price_facility = ${rows[0].total_price_facility},finished_price_staff = ${rows[0].total_price_staff} WHERE id = ${rows[0].id};
        UPDATE reports_facility_shifts SET solved = true WEHERE id = ${rows[0].reported_shift_id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${response[0].id} compeleted','After reviewing report we completed shift and we will pay staff worked time.',${rows[0].facility_id},CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${rows[0].id} compeleted','After reviewing report we completed shift and we will pay staff worked time.',${rows[0].staff_hired_id},CURRENT_TIMESTAMP);`
        ,(err,responseFinish,fields) =>{
            if(err){ 
                res.status(500).send({message:err.sqlMessage})
                return
            }
            sendNotification(rows[0].facility_fcm_token,`Shift #${rows[0].id} compeleted`,"After reviewing report we completed shift and we will pay staff worked time.")
            sendNotification(rows[0].staff_fcm_token,`Shift #${rows[0].id} compeleted `,"After reviewing report we completed shift and we will pay staff worked time.")
            res.send({status:"success",message:"Shift successfully compeleted"})
        })
                   
    })

})

module.exports = app;
const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const { sendNotification } = require('../../../../helpers/notifications')
const {transferCharge, refundCharge} = require("../../../../helpers/stripe_helper");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
var moment = require('moment');

//Individual
app.get("/individual_canceled",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{

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
    FROM individual_shifts WHERE shift_canceled = true AND 
    DATE_FORMAT(CONVERT_TZ(individual_shifts.start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}'`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(row => (
            row.staff = JSON.parse(row.staff),
            row.individual = JSON.parse(row.individual),
            row));

        res.send(rows)

    })
})

//Facility
app.get("/facility_canceled",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
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
    FROM facility_shifts WHERE shift_canceled = true AND 
    DATE_FORMAT(CONVERT_TZ(facility_shifts.start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}' `,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(row => (
            row.staff = JSON.parse(row.staff),
            row.facility = JSON.parse(row.facility),
            row.shift_starts = ((row.shift_starts == 0) ? false : true),
            row.shift_finished = ((row.shift_finished == 0) ? false : true),
            row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
            row.payment_status = ((row.payment_status == 0) ? false : true),
            row.role = ((row.role == 'HomeCare Aide')? 'CNA': row.role),
            row.start_time = moment(row.start_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
            row.end_time = moment(row.end_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
            row.requested_time = moment(row.requested_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
            row.clockin_time = ((!row.clockin_time)? row.clockin_time: moment(row.clockin_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
            row.clockout_time = ((!row.clockout_time)? row.clockout_time: moment(row.clockout_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
            row.booked_time = ((!row.booked_time)? row.booked_time: moment(row.booked_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
            row.reported_time = ((!row.reported_time)? row.reported_time: moment(row.reported_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
            row.canceled_time =((!row.canceled_time)? row.canceled_time: moment(row.canceled_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
            row));
                   
        res.send(rows)

    })
})


module.exports = app;
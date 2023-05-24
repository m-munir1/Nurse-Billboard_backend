const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
var moment = require('moment');

app.get("/facilities",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{

    pool.query(`
    SELECT * FROM facilites;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        rows = rows.map(({password, ...row}) => (
            row.account_approved = ((row.account_approved == 0) ? false : true),
            row));
            
        res.send(rows )

    })
})

app.get("/shifts",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    const date = req.query.date
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    pool.query(`
    SELECT * FROM facility_shifts WHERE DATE_FORMAT(CONVERT_TZ(start_time,'+00:00','${time_zone}'),'%Y-%m-%d') = '${date}';`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({finished_price_staff,invoice_rate_staff, ...row}) => (
            row.staff = JSON.parse(row.staff),
            row.shift_starts = ((row.shift_starts == 0) ? false : true),
            row.shift_finished = ((row.shift_finished == 0) ? false : true),
            row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
            row.payment_status = ((row.payment_status == 0) ? false : true),
            row.finished_price = row.finished_price_facility,
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
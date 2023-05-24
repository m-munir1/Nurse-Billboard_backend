const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
var moment = require('moment');

app.get("/details",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{

    pool.query(`
    SELECT 
    (SELECT count(id) FROM individual_shifts WHERE shift_finished = false AND shift_cancelled = false) + 
    (SELECT count(id) FROM facility_shifts WHERE shift_finished = false AND shift_cancelled = false) as live_shifts,

    (SELECT count(id) FROM individual_shifts WHERE shift_cancelled = true AND shift_reported = false) + 
    (SELECT count(id) FROM facility_shifts WHERE shift_cancelled = true AND shift_reported = false) as canceled_shifts,

    (SELECT count(id) FROM individual_shifts WHERE shift_cancelled = true AND shift_reported = true) + 
    (SELECT count(id) FROM facility_shifts WHERE shift_cancelled = true AND shift_reported = true) as reported_shifts
    ;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send(rows[0])

    })
})

app.get("/staff",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    pool.query(`
    SELECT * FROM staff WHERE account_approved = true;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
        rows = rows.map(({password, ...row}) => (
            row.account_approved = ((row.account_approved == 0) ? false : true),
            row));
       
        res.send(rows)
    })

})


module.exports = app;
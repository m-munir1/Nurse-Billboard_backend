const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
var moment = require('moment');

app.get("/details",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    pool.query(`
    SELECT 
    (SELECT count(id) FROM facilites WHERE account_approved = false AND contract_pdf is not null) as facilites_onboard,
    (SELECT count(id) FROM available_facilites WHERE contacted = false AND not_interested = false) as facilites_pending,
    (SELECT count(id) FROM available_facilites WHERE contacted = true) as facilites_contacted,
    (SELECT count(id) FROM available_facilites WHERE not_interested = true) as facilites_not_interested
   ;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send({
            facilites_onboard: rows[0].facilites_onboard,
            facilites_pending: rows[0].facilites_pending,
            facilites_contacted: rows[0].facilites_contacted,
            facilites_not_interested: rows[0].facilites_not_interested,
        })

    })
})

app.get("/facilites",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    pool.query(`
    SELECT 
    DISTINCT county, 
    (SELECT count(id) FROM available_facilites WHERE county LIKE county) as available_facilites,
    (SELECT count(id) FROM facilites WHERE account_approved = false AND contract_pdf is not null AND city LIKE county) as facilites_onboarding,
    (SELECT count(id) FROM available_facilites WHERE contacted = false AND not_interested = false AND county LIKE county) as target_left
    FROM available_facilites;
    ;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send(rows)

    })
})

module.exports = app;
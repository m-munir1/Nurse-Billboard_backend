const express = require("express");
const app = express.Router();
const pool = require("../../../connection");

app.get("/",(req,res)=>{
    pool.query(`
    SELECT *, 
    (SELECT DISTANCE_BETWEEN(individual_shifts.lat,individual_shifts.lng,staff_applyshifts.lat,staff_applyshifts.lng) as staff_distance_miles
    FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND shift_id = individual_shifts.id) as staff_distance_miles,
    (SELECT json_object('id', staff_applyshifts.id,'shift_id', staff_applyshifts.shift_id,'lat',staff_applyshifts.lat,'lng',staff_applyshifts.lng,
    'staff_details',(SELECT json_object('full_name',staff.full_name,'fcm_token',staff.fcm_token,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role) FROM staff WHERE id LIKE individual_shifts.staff_hired_id))
    FROM staff_applyshifts WHERE staff_id LIKE individual_shifts.staff_hired_id AND shift_id = individual_shifts.id) AS staff 
    FROM individual_shifts
`,(err,results,fields) =>{
        if(!err){   
            if(results.length){
                results = results.map(row => (row.staff = JSON.parse(row.staff),
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row));
                res.send(results)
            }else{
                res.status(404).send("There's no individual shifts yet")
            }
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
})

app.get("/retrieve/:id",(req,res)=>{
    pool.query(`
    SELECT *, 
    (SELECT ST_Distance_Sphere(staff_applyshifts.location, individual_shifts.location) * .000621371192 
    FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id) as staff_distance_miles,
    (SELECT json_object('id', staff_applyshifts.id,'shift_id', staff_applyshifts.shift_id,'location',staff_applyshifts.location,
    'staff_details',(SELECT json_object('full_name',staff.full_name,'fcm_token',staff.fcm_token,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role)
    FROM staff WHERE id LIKE individual_shifts.staff_hired_id))
    FROM staff_applyshifts WHERE staff_id LIKE individual_shifts.staff_hired_id) AS staff 
    FROM individual_shifts WHERE id = ${req.params.id};
    `,(err,results,fields) =>{
        if(!err){   
            if(results.length){
                results = results.map(row => (row.staff = JSON.parse(row.staff),
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row));
                res.send(results[0])
            }else{
                res.status(404).send({message:"There's no shift with this id"})
            }
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
})

module.exports = app;
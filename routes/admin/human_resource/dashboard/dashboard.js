const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
var moment = require('moment');

app.get("/details",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const current_time = moment(new Date()).format('YYYY-MM-DD')
    
    pool.query(`
    SELECT 
    (SELECT count(id) FROM staff) as total_healthcare,
    (SELECT count(id) FROM staff WHERE account_approved = true) as hired_healthcare,
    (SELECT count(id) FROM staff WHERE account_approved = false) as pending_healthcare,
    (SELECT COUNT(id) FROM staff WHERE phone_interview = false AND '${current_time}' = DATE_FORMAT(register_date, '%Y-%m-%d')) as current_interviews,
    (SELECT COUNT(id) FROM staff WHERE phone_interview = false AND '${current_time}' > DATE_FORMAT(register_date, '%Y-%m-%d')) as past_due_interviews,
    (SELECT COUNT(id) FROM staff WHERE on_boarding = false AND 7 > TIMESTAMPDIFF(DAY,DATE_FORMAT(register_date, '%Y-%m-%d'),'${current_time}')) as current_onboarding,
    (SELECT COUNT(id) FROM staff WHERE on_boarding = false AND 7 < TIMESTAMPDIFF(DAY,DATE_FORMAT(register_date, '%Y-%m-%d'),'${current_time}')) as past_due_onboarding,
    (SELECT COUNT(id) FROM staff_orientations WHERE (SELECT oreintation FROM staff WHERE id = staff_orientations.staff_id) = false  AND 7 > TIMESTAMPDIFF(DAY,DATE_FORMAT(meeting_url, '%Y-%m-%d'),'${current_time}')) as current_oreintations,
    (SELECT COUNT(id) FROM staff_orientations WHERE (SELECT oreintation FROM staff WHERE id = staff_orientations.staff_id) = false  AND 7 < TIMESTAMPDIFF(DAY,DATE_FORMAT(meeting_url, '%Y-%m-%d'),'${current_time}')) as past_due_oreintations
    ;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send({
            total_healthcare: rows[0].total_healthcare,
            hired_healthcare: rows[0].hired_healthcare,
            pending_healthcare: rows[0].pending_healthcare,
            interviews:{current_interviews:rows[0].current_interviews,past_due_interviews:rows[0].past_due_interviews},
            onboarding:{current_onboarding:rows[0].current_onboarding,past_due_onboarding:rows[0].past_due_onboarding},
            orientations:{current_oreintations:rows[0].current_oreintations,past_due_oreintations:rows[0].past_due_oreintations}
        })

    })
})

app.get("/new-hires",verifyTokenAndPermission(["human_resources"]),(req,res)=>{
    
    pool.query(`
    SELECT first_name,last_name,role FROM staff WHERE phone_interview = true AND on_boarding = true AND oreintation = false;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send(rows[0])

    })
})

module.exports = app;
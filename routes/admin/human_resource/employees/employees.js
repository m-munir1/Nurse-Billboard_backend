const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
const { sendNotification } = require('../../../../helpers/notifications')
const {individual_timesheet, facility_timesheet} = require('../../../../helpers/validation_schema/admin/human_resources/employees');

app.get("/staff",verifyTokenAndPermission(["human_resources"]),(req,res)=>{
    
    pool.query(`
    SELECT *,
    (SELECT COUNT(id) FROM facility_shifts WHERE staff_hired_id = staff.id AND shift_finished = false AND shift_cancelled = false) as facility_scheduled,
    (SELECT COUNT(id) FROM facility_shifts WHERE staff_hired_id = staff.id AND shift_finished = false AND shift_cancelled = true) as facility_cancelled,
    (SELECT COUNT(id) FROM facility_shifts WHERE staff_hired_id = staff.id AND shift_reported = true AND shift_cancelled = true) as facility_reported,
    (SELECT COUNT(id) FROM facility_shifts WHERE staff_hired_id = staff.id AND shift_finished = true) as facility_completed,

    (SELECT COUNT(id) FROM individual_shifts WHERE staff_hired_id = staff.id AND shift_finished = false AND shift_cancelled = false) as homecare_scheduled,
    (SELECT COUNT(id) FROM individual_shifts WHERE staff_hired_id = staff.id AND shift_finished = false AND shift_cancelled = true) as homecare_cancelled,
    (SELECT COUNT(id) FROM individual_shifts WHERE staff_hired_id = staff.id AND shift_reported = true AND shift_cancelled = true) as homecare_reported,
    (SELECT COUNT(id) FROM individual_shifts WHERE staff_hired_id = staff.id AND shift_finished = true) as homecare_completed
    FROM staff WHERE account_approved = true;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        rows = rows.map(row => (
            row.phone_interview = ((row.phone_interview == 0) ? false : true),
            row.on_boarding = ((row.on_boarding == 0) ? false : true),
            row.oreintation = ((row.oreintation == 0) ? false : true),
            row.shifts = {
                all_time_shifts:row.facility_scheduled + row.homecare_scheduled + row.facility_completed + row.homecare_completed + row.facility_cancelled + row.homecare_cancelled,
                scheduled:row.facility_scheduled + row.homecare_scheduled,
                cancelled:row.facility_cancelled + row.homecare_cancelled,
                reported:row.facility_reported + row.homecare_reported,
                completed:row.facility_completed + row.homecare_completed,
                facilities:{
                    facility_scheduled:row.facility_scheduled,
                    facility_cancelled:row.facility_cancelled,
                    facility_reported:row.facility_reported,
                    facility_completed:row.facility_completed,
                },
                homeCare:{
                    homecare_scheduled:row.homecare_scheduled,
                    homecare_cancelled:row.homecare_cancelled,
                    homecare_reported:row.homecare_reported,
                    homecare_completed:row.homecare_completed,
                },
            },
            row));

            rows = rows.map(({fcm_token,facility_scheduled,
                facility_cancelled,facility_reported,
                facility_completed,homecare_scheduled,
                homecare_cancelled,homecare_reported,homecare_completed,password, ...row}) => (row));

        res.send(rows)

    })
})

app.get("/staff/:id",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.params.id

    pool.query(`SELECT * FROM staff WHERE id = ${staff_id}`,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({password, ...row}) => (
            row.account_approved = ((row.account_approved == 0) ? false : true),
            row.on_boarding = ((row.on_boarding == 0) ? false : true),
            row.oreintation = ((row.oreintation == 0) ? false : true),
            row.phone_interview = ((row.phone_interview == 0) ? false : true),
            row));
        res.send(rows) 
    })

})

app.get("/individual/time-sheets",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.query.staff_id

    const result = individual_timesheet.validate({staff_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
    
    pool.query(`
    SELECT *,
    (SELECT mileage FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as mileage,
    (SELECT DISTANCE_BETWEEN(individual_shifts.lat,individual_shifts.lng,staff_applyshifts.lat,staff_applyshifts.lng)
    FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as staff_distance_miles,
    (SELECT json_object('full_name',individuals.full_name,'profile_pic',individuals.profile_pic,'phone',individuals.phone)  
    FROM individuals WHERE id = individual_shifts.individual_id) as individual 
    FROM individual_shifts WHERE staff_hired_id = ${staff_id} HAVING shift_finished = true or shift_cancelled = true ORDER BY start_time DESC;`,(err,rows,fields) =>{
        if(!err){   
            rows = rows.map(({invoice_rate, ...row}) => (
                row.individual = JSON.parse(row.individual), 
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.invoice_rate = row.invoice_rate_staff,
                row
                ));

            rows = rows.map(({invoice_rate_staff, ...row}) => (row)) 

            res.send(rows)
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.get("/facility/time-sheet",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    //const date = req.query.date
    const staff_id = req.query.staff_id
    // var time_zone = req.query.time_zone

    // if(!time_zone.includes("+")){
    //     time_zone = '+'+req.query.time_zone.replace(/\s+/g, '')
    //   }

      const result = facility_timesheet.validate({staff_id})

      if(result.error){
          res.status(400).send({
              message: result.error.details[0].message
           });
          return
      }

    pool.query(`
    SELECT * ,
    CALCULATE_FACILITY_INVOICE_STAFF(facility_shifts.invoice_rate,facility_shifts.role) as invoice_rate_staff,
    (SELECT json_object('id',facilites.id,'facility_name',facilites.facility_name,'phone',facilites.phone)  
    FROM facilites WHERE id = facility_shifts.facility_id) as facility
    FROM facility_shifts WHERE staff_hired_id = ${staff_id}
    HAVING shift_finished = true or shift_cancelled = true AND staff_hired_id is not null ORDER BY start_time DESC; `,(err,rows,fields) =>{
        if(!err){   
            rows = rows.map(({invoice_rate,finished_price_facility, ...row}) => (
                row.facility = JSON.parse(row.facility),
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.payment_status = ((row.payment_status == 0) ? false : true),
                row.finished_price = row.finished_price_staff,
                row.invoice_rate = row.invoice_rate_staff,
                row.role = ((row.role == 'HomeCare Aide')? 'CNA': row.role),
                row)) 

                rows = rows.map(({invoice_rate_staff,finished_price_staff, ...row}) => (row)) 

            res.send(rows)
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

module.exports = app;
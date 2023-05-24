const express = require("express");
const app = express.Router();
const pool = require("../../../connection");
const {verifyTokenAndPermission} = require("../../../helpers/jwt_helper");
const notification = require('../../../helpers/notifications')
const stripe = require('../../../helpers/stripe_helper')
const validation_schema = require('../../../helpers/validation_schema/client/individual_schema');
const {scheduleIndividualShift} = require("../../../helpers/scheduleShifts")
const future_schedule = require("../../../helpers/schedule-future-shifts")
const moment = require('moment')
const multer = require("multer")
const path = require("path")
const minimum_price = require("../../../helpers/minimum_price");
require("dotenv").config();
const MILES_MILEAGE = process.env.MILES_MILEAGE;
const MAXIMUM_MILES = process.env.MAXIMUM_MILES;
const post_individual_shift = require('../../../helpers/post-individual-shift')

const storageProfilePic = multer.diskStorage({
    destination:(req,file,cb) =>{
        cb(null,'./profilepictures/');
    },
    filename : (req,file,cb) => {
        cb(null,req.user.phone.replace("+","") + "pp" + path.extname(file.originalname));
    }
})

const uploadProfilePic = multer({storage:storageProfilePic,
    fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if(ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            return callback('Only images are allowed',false)
        }
        callback(null, true)
    }
    }).single("profile_pic")

app.put("/account/profile-pic",verifyTokenAndPermission(["individual"]),(req,res)=>{

    uploadProfilePic(req, res, function (err) {
        if (err) {
            // An error occurred when uploading 
            res.status(400).send(err)
            return
        }

        if(!req.file){
            res.status(500).send({message:"Please Provide the picture"})
            return
        }

        pool.query(`
        UPDATE individuals SET 
        profile_pic =  case when '${req.file.filename}' != 'undefined' or not null then '${req.file.filename}' else profile_pic end
        WHERE phone LIKE '${req.user.phone}';
        `,(err,rows,fields) =>{
            if(err){  
                res.status(500).send({message:err.sqlMessage})
            }
            res.send({status:"success",img:`${req.file.filename}`})
        })
        // Everything went fine 
        })
    
})  

app.put("/account",verifyTokenAndPermission(["individual"]),(req,res)=>{
    const email = req.query.email
    const full_name = req.query.full_name
    const fcm_token = req.query.fcm_token
    
    const result = validation_schema.updateSchema.validate({email,full_name,fcm_token})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(!email && !full_name && !fcm_token){
        res.status(400).send({
            message: 'Missing email and full name'
            });
        return
    }

    pool.query(`
    UPDATE individuals SET 
    full_name =  case when '${full_name}' != 'undefined' or not null then '${full_name}' else full_name end,
    fcm_token =  case when '${fcm_token}' != 'undefined' or not null then '${fcm_token}' else fcm_token end,
    email = case when '${email}' != 'undefined' or not null then '${email}' else email end
    WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(!err){  
                res.send({status:"success",full_name:full_name,email:email,phone:req.user.phone})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
       
})

//Retrieve Individual
app.get("/account" ,verifyTokenAndPermission(["individual"]),(req,res)=>{

    pool.query(`SELECT * FROM individuals WHERE phone LIKE '${req.user.phone}'`,(err,rows,fields) =>{
        if(!err){  
            if(rows.length){
                rows = rows.map(({password, ...row}) => (
                    row.account_approved = ((row.account_approved == 0) ? false : true),
                    row));
                res.send(rows[0])
            }else{
                res.status(404).send({
                    message: "The server has not found individual"
                 });
            }
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    }) 

})

app.post("/healthquestions",verifyTokenAndPermission(["individual"]),(req,res)=>{
    const q1 = req.query.q1
    const q2 = req.query.q2
    const q3 = req.query.q3
    const q4 = req.query.q4

    const result = validation_schema.questionsSchema.validate({q1,q2,q3,q4})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    INSERT INTO individuals_healthquestions (q1,q2,q3,q4,individual_id)
    VALUES (${q1},${q2},${q3},${q4},(SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}')) 
    ON DUPLICATE KEY
    UPDATE q1=${q1}, q2=${q2}, q3=${q3}, q4=${q4}, individual_id=(SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}');
    UPDATE individuals SET account_approved = true WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(!err){  
                res.send({status:"update_success",q1,q2,q3,q4})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

//Retrieve healthquestions
app.get("/healthquestions" ,verifyTokenAndPermission(["individual"]),(req,res)=>{

        pool.query(`SELECT * FROM individuals_healthquestions WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}')`,(err,rows,fields) =>{
            if(!err){  
                if(rows[0]){
                    rows = rows.map(row => (
                        row.q1 = ((row.q1 == 0) ? false : true),
                        row.q2 = ((row.q2 == 0) ? false : true),
                        row.q3 = ((row.q3 == 0) ? false : true),
                        row.q4 = ((row.q4 == 0) ? false : true),
                        row));
                    res.send(rows[0])
                }else{
                    res.status(404).send({message:"Please Answer Questions"})
                }
            }else{
                res.status(500).send({message:err.sqlMessage})
            }
        })
  
})

app.get("/history",verifyTokenAndPermission(["individual"]),(req,res)=>{

    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.historyShiftSchema.validate({time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
    
    pool.query(`
    SELECT *,
    (SELECT json_object('id', staff_applyshifts.id,'shift_id', staff_applyshifts.shift_id,'lat',staff_applyshifts.lat,'lng',staff_applyshifts.lng,
    'mileage',staff_applyshifts.mileage,'staff_distance_miles',
    (SELECT DISTANCE_BETWEEN(individual_shifts.lat,individual_shifts.lng,staff_applyshifts.lat,staff_applyshifts.lng) 
    FROM staff_applyshifts WHERE staff_applyshifts.staff_id = individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id ),
    'staff_details',(SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role) 
    FROM staff WHERE id = individual_shifts.staff_hired_id))
    FROM staff_applyshifts WHERE staff_id = individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id  ) AS staff
    FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = true or shift_cancelled = true ORDER BY start_time DESC;`,(err,rows,fields) =>{
        if(!err){   
            rows = rows.map(({invoice_rate_staff, ...row}) => (
                row.staff = JSON.parse(row.staff), 
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.start_time = moment(row.start_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.end_time = moment(row.end_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.requested_time = moment(row.requested_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.applied_time = ((!row.applied_time)? row.applied_time: moment(row.applied_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.clockin_time = ((!row.clockin_time)? row.clockin_time: moment(row.clockin_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.clockout_time = ((!row.clockout_time)? row.clockout_time: moment(row.clockout_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.hiring_time = ((!row.hiring_time)? row.hiring_time: moment(row.hiring_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.canceled_time = ((!row.canceled_time)? row.canceled_time: moment(row.canceled_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.reported_time = ((!row.reported_time)? row.reported_time: moment(row.reported_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.tasks = row.tasks.split("/"),
                row.shift_status = ((row.shift_reported == 0)? ((row.shift_cancelled == 0)? ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ) : "canceled" ) : "reported"),
                row));
            res.send(rows)
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.get("/messages",verifyTokenAndPermission(["individual"]),(req,res)=>{
    
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.messages.validate({time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT id , role, shift_finished, shift_cancelled ,individual_id, staff_hired_id,
    (SELECT json_object('first_name',staff.first_name,'last_name',staff.last_name,'phone',staff.phone)  
    FROM staff WHERE id = individual_shifts.staff_hired_id) as staff,
    (SELECT json_object('message_date',messages.message_date,'message',messages.message,'sender_phone',messages.sender_phone,'receiver_phone',messages.receiver_phone,'receiver_seen',messages.receiver_seen)  
    FROM messages WHERE 
    sender_phone LIKE (SELECT phone FROM staff WHERE id = individual_shifts.staff_hired_id) 
    AND receiver_phone LIKE '${req.user.phone}'
    AND shift_id = individual_shifts.id
    or 
    sender_phone LIKE '${req.user.phone}' 
    AND receiver_phone LIKE (SELECT phone FROM staff WHERE id = individual_shifts.staff_hired_id) 
    AND shift_id = individual_shifts.id
    ORDER BY message_date DESC LIMIT 1) as last_message,
    (SELECT COUNT(*) FROM messages WHERE shift_id = individual_shifts.id AND receiver_phone LIKE '${req.user.phone}' AND receiver_seen = false) as unread_messages
    FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') AND staff_hired_id is not null HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,rows,fields) =>{
        if(err){
            res.status(500).send({message:err.sqlMessage})
          return
        }

        rows = rows.map(row => (
        row.staff = JSON.parse(row.staff), 
        row.last_message = ((JSON.parse(row.last_message)) ? 
        JSON.parse(`{"message":"${JSON.parse(row.last_message).message}","message_date":"${moment(JSON.parse(row.last_message).message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")}","sender_phone":"${JSON.parse(row.last_message).sender_phone}","receiver_seen":"${((JSON.parse(row.last_message).receiver_seen == 0) ? false : true)}","receiver_phone":"${JSON.parse(row.last_message).receiver_phone}"}`) : JSON.parse(row.last_message)),
        row));
        res.send(rows)
        
    })  

})

app.get("/messages/:phone",verifyTokenAndPermission(["individual"]),(req,res)=>{

    const staffPhone = req.params.phone
    const shift_id = req.query.shift_id
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }
    const result = validation_schema.messagesUser.validate({staffPhone,shift_id,time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * FROM messages WHERE
    sender_phone LIKE '${staffPhone}'
    AND receiver_phone LIKE '${req.user.phone}'
    AND shift_id = ${shift_id}
    or 
    sender_phone LIKE '${req.user.phone}' 
    AND receiver_phone LIKE '${staffPhone}'
    AND shift_id = ${shift_id}
    ORDER BY message_date ASC
    `,(err,rows,fields) =>{
        if(err){
            res.status(500).send({message:err.sqlMessage})
          return
        }
        rows = rows.map(row => (
        row.message_date = moment(row.message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
        row.receiver_seen = ((row.receiver_seen == 0) ? false : true),
        row));
        res.send(rows)
    })  

})

//Retrieve if there's Active Shift
app.get("/shift/active-shift",verifyTokenAndPermission(["individual"]),(req,res)=>{

    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.activeShiftSchema.validate({time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT *,
    (SELECT json_object('id',staff_applyshifts.id,'shift_id',staff_applyshifts.shift_id,'lat',staff_applyshifts.lat,'lng',staff_applyshifts.lng,
    'mileage',staff_applyshifts.mileage,'staff_distance_miles',
    (SELECT DISTANCE_BETWEEN(staff_applyshifts.lat,staff_applyshifts.lng,individual_shifts.lat,individual_shifts.lng)
    FROM staff_applyshifts WHERE staff_applyshifts.staff_id = individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id),
    'staff_details',(SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role) 
    FROM staff WHERE id = individual_shifts.staff_hired_id))
    FROM staff_applyshifts WHERE staff_id = individual_shifts.staff_hired_id AND shift_id = individual_shifts.id) AS staff 
    FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false ;
    `,(err,shift,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
            
        }

        if(shift[0]){

            shift = shift.map(({invoice_rate_staff, ...row}) => (
                row.staff = JSON.parse(row.staff), 
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.start_time = moment(row.start_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.end_time = moment(row.end_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.requested_time = moment(row.requested_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.applied_time = ((!row.applied_time)? row.applied_time: moment(row.applied_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.clockin_time = ((!row.clockin_time)? row.clockin_time: moment(row.clockin_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.clockout_time = ((!row.clockout_time)? row.clockout_time: moment(row.clockout_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.hiring_time = ((!row.hiring_time)? row.hiring_time: moment(row.hiring_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.canceled_time = ((!row.canceled_time)? row.canceled_time: moment(row.canceled_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.reported_time = ((!row.reported_time)? row.reported_time: moment(row.reported_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.tasks = row.tasks.split("/"),
                row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting on Hire" ),
                row));

                res.send({status:"active_shift",shift:shift[0]})

        }else{
            res.send({status:"no_active_shift",shift:null})
        }
        
    })

})

app.get("/connected-payments",verifyTokenAndPermission(["individual"]),(req,res)=>{
    //const type = req.query.type
    const type = "card"

    const result = validation_schema.connectedPayments.validate({type})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(type !== "card" && type !== "us_bank_account"){
        res.status(400).send({message:`error: type provided '${type}' but must be: (us_bank_account) or (card)`})
        return
    }

    pool.query(`
    SELECT connected_customer_account FROM individuals WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(!err){  
           
            if(rows[0].connected_customer_account){
                stripe.customerPaymentMethods(rows[0].connected_customer_account,type,
                    error=>{
                        res.status(500).send(error)
                    },
                    resposne=>{
                        res.send(resposne)
                    })
            }else{
                res.status(404).send({message:"You should add atleast one payment method."})
            }
           
                
        }else{
            res.status(500).send(err)
        }
    })

})

app.post("/connect-payment",verifyTokenAndPermission(["individual"]),(req,res)=>{
    //const type = req.query.type
    const type = "card"
    const billing_name = req.query.billing_name

    const card_number = req.query.card_number
    const card_exp_month = req.query.card_exp_month
    const card_exp_year = req.query.card_exp_year
    const card_cvc = req.query.card_cvc

    // const us_bank_account_number = req.query.us_bank_account_number
    // const us_bank_account_type = req.query.us_bank_account_type
    // const us_bank_routing_number = req.query.us_bank_routing_number
    // const us_bank_account_holder_type = req.query.us_bank_account_holder_type
    
    const result = validation_schema.connectPaymentSchema.validate({type,billing_name})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    var paymentMethod = {}

    // if(type == "us_bank_account"){

    //     const result = us_bank_account_schema.validate({us_bank_account_number,us_bank_account_type,us_bank_routing_number,us_bank_account_holder_type})

    //     if(result.error){
    //         res.status(400).send({
    //             message: result.error.details[0].message
    //          });
    //         return
    //     }

    //     paymentMethod = {
    //         type: type,
    //         billing_details:{
    //             name:billing_name
    //         },
    //         us_bank_account:{
    //             account_number: us_bank_account_number,
    //             account_type: us_bank_account_type,
    //             routing_number: us_bank_routing_number,
    //             account_holder_type: us_bank_account_holder_type,
    //         }
    //     }

    // }else 
    if(type == "card"){

        const result = validation_schema.card_schema.validate({card_number,card_exp_month,card_exp_year,card_cvc})

        if(result.error){
            res.status(400).send({
                message: result.error.details[0].message
             });
            return
        }

        paymentMethod = {
            type: "card",
            billing_details:{
                name:billing_name
            },
            card:{
                number: card_number,
                exp_month: card_exp_month,
                exp_year: card_exp_year,
                cvc: card_cvc,
            }
        }

    }else{
        res.status(400).send({message:`type provided '${type}' but must be: (us_bank_account) or (card)`})
        return
    }

    pool.query(`SELECT connected_customer_account FROM individuals WHERE phone LIKE '${req.user.phone}'`,(err,rows,fields) =>{
        if(!err){  
            if(rows[0].connected_customer_account){
                createPaymentMethod(res,paymentMethod,rows[0].connected_customer_account)
            }else{
                stripe.customer(error=>{
                    res.status(error.err.statusCode).send({message:error.err.raw.message})
                },
                response=>{
                    pool.query(`UPDATE individuals SET connected_customer_account = '${response.id}' WHERE phone LIKE '${req.user.phone}'`,(err,rows,fields) =>{
                        if(!err){  
                            createPaymentMethod(res,paymentMethod,response.id)
                        }else{
                            res.status(500).send({message: err.sqlMessage})
                        }
                    }) 
                })
            }
        }else{
            res.status(500).send({message: err.sqlMessage})
        }
    })

})

function createPaymentMethod(res,paymentMethod,cus_id){
    stripe.connectPaymentMethod(paymentMethod,
        error=>{
            res.status(error.err.statusCode).send({message:error.err.raw.message})
        },
        pm_response=>{

            stripe.attachPaymentMethod(cus_id,pm_response.id,
                error=>{
                    res.status(error.err.statusCode).send({message:error.err.raw.message})
                },
                response=>{
                    res.send(response)
                })

        })
}

app.get("/notifications",verifyTokenAndPermission(["individual"]),(req,res)=>{
   
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.notificationSchema.validate({time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

        pool.query(`SELECT * FROM individuals_notifications WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') ORDER BY date DESC`,(err,rows,fields) =>{
            if(!err){   

                rows = rows.map(row => (
                    row.date = moment(row.date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row));

                res.send(rows)
            }else{
                res.status(500).send({message: err.sqlMessage})
            }
        })
        
})


app.get("/shift/calculate-price",verifyTokenAndPermission(["individual"]),(req,res)=>{
    const role = req.query.role
    const hours = req.query.hours
    const city = req.query.city

    const result = validation_schema.calculatePriceSchema.validate({city,role,hours})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(role != "HomeCare Aide" && role != "LVN | LPN" && role != "RN"){
        res.status(400).send({
            message: `Wrong Role provided '${role}' should be (HomeCare Aide), (LVN | LPN), (RN)`
            });
        return
    }

    res.send({invoice_rate:minimum_price.minimumPriceIndividual(city,hours,role).inovice_rate})

    // pool.query(`
    // SELECT CALCULATE_HOMECARE_INVOICE(${hours},'${role}') as invoice_rate;
    // `,(err,results,fields) =>{
    //     if(!err){   
    //         res.send({invoice_rate:results[0].invoice_rate})
    //     }else{
    //         res.status(500).send({message:err.sqlMessage})
    //     }
    // })
    
})

app.post("/shift/request",verifyTokenAndPermission(["individual"]),(req,res)=>{
    const body = req.body
    const result = validation_schema.shiftSchema.validate(body)

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(body.role != "HomeCare Aide" && body.role != "LVN | LPN" && body.role != "RN"){
        res.status(400).send({
            message: `Wrong Role provided '${body.role}' should be (HomeCare Aide), (LVN | LPN), (RN)`
            });
        return
    }

    const invoices_rate = minimum_price.minimumPriceIndividual(body.city,body.hours,body.role)
    var machine_timezone = new Date().toString().match(/([-\+][0-9]+)\s/)[1]
    var len = machine_timezone.length;
    machine_timezone = machine_timezone.substring(0, len-2) + ":" + machine_timezone.substring(len-2);


    var time_zone = body.time_zone

    if(!time_zone.includes("-")){
        time_zone = time_zone.replace(" ","+")
    }

    pool.query(`
    SELECT id as individual_id, account_approved, account_balance, full_name, 
    CURRENT_TIMESTAMP as teest,
    DATE_FORMAT(CONVERT_TZ('${body.schedule_date}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T') as teest2,
    (SELECT CURRENT_TIMESTAMP >= DATE_FORMAT(CONVERT_TZ('${body.schedule_date}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T')) as is_time_past,
    (SELECT id FROM future_individual_schedule WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') AND  schedule_date = '${moment(body.schedule_date).utcOffset(body.time_zone).format("YYYY-MM-DD HH:mm:ss")}') as future_scheduled_shift
    FROM individuals WHERE phone LIKE '${req.user.phone}';

    SELECT * FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;

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
    
    `,(err,response,fields) =>{

        if(err){
            return res.status(500).send({message:err.sqlMessage});
        }

        if(response[0][0].account_approved == 0){
            res.status(409).send({
                message: 'Your account not approved'
                });
            return
        }

        if(!body.schedule_date){
            if(response[1][0]){
                res.status(404).send({
                    message: "There's already an active shift"
                    });
                return
            }
        }
            
        if(!response[0][0].full_name){
            res.status(409).send({
                message: 'Full name missing'
                });
            return
        }

        if (body.schedule_date) {
            if(response[0][0].future_scheduled_shift > 0){
                res.status(409).send({
                    message: 'You already scheduled shift at this time'
                    });
                return
            }

            if(response[0][0].is_time_past){
                res.status(400).send({
                    message:"You can't choose past time"
                    });
                return
            }
        }

        if(body.schedule_date){
            //scheduled shift
            body.schedule_date = moment(body.schedule_date).utcOffset(machine_timezone).format("YYYY-MM-DD HH:mm:ss")
            scheduleFutureShift(req,res,body,invoices_rate)
        }else{
            // Post shift now
            post_individual_shift.postshift(response[2],req.user.phone,res,body,invoices_rate,false)
        }
        
    })    

})

function scheduleFutureShift(req,res,body,invoices_rate) {


    pool.query(`
    INSERT INTO future_individual_schedule(
        individual_id, language, gender, 
        schedule_date, lat, lng, 
        details, invoice_rate,role, 
        tasks, invoice_rate_staff, hours, 
        city, country, state, 
        postal_code, address, phone
    ) values(
        (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}'),
        '${body.language}','${body.gender}','${body.schedule_date}',
        '${body.lat}', '${body.long}','${body.details}',
        '${invoices_rate.invoice_rate}','${body.role}','${body.tasks}',
        '${invoices_rate.invoice_rate_staff}','${body.hours}','${body.city}',
        '${body.country}','${body.state}','${body.postal_code}',
        '${body.address}','${req.user.phone}'
    );
    `,(err,results,fields) =>{
        if(err){
            res.status(500).send({message:err})
            return
        }

        future_schedule.scheduleFutureShift(req.user.phone,body,invoices_rate)

        res.send({status:"success"})
    })
}

//////AND OR HAVING? WE WILL SEE
app.get("/shift/staff-applying",verifyTokenAndPermission(["individual"]),(req,res)=>{
    
    pool.query(`
    SELECT id,shift_finished,shift_cancelled FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,shift,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return  
        }

        pool.query(`
        SELECT *,
        (SELECT DISTANCE_BETWEEN(staff_applyshifts.lat,staff_applyshifts.lng,individual_shifts.lat,individual_shifts.lng)
        FROM individual_shifts WHERE individual_shifts.id = staff_applyshifts.shift_id) as staff_distance_miles,
        (SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role) 
        FROM staff WHERE id = staff_applyshifts.staff_id) as staff_details
        FROM staff_applyshifts WHERE shift_id = ${shift[0].id};
        `,(err,result,fields) =>{
            if(err){  
                res.status(500).send({message:err.sqlMessage})
                return  
            }
          
            result = result.map(row => (
                row.staff_details = JSON.parse(row.staff_details), 
                row));
            res.send(result)
        }) 
    }) 

})

app.post("/shift/hire",verifyTokenAndPermission(["individual"]),(req,res)=>{

    const staff_id = req.query.staff_id
    const pm_id = req.query.pm_id
    const result = validation_schema.hireSchema.validate({staff_id,pm_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT *,
    (SELECT connected_customer_account FROM individuals WHERE phone LIKE '${req.user.phone}') as connected_customer_account,

    (SELECT count(id) FROM facility_shifts Where 
    CASE WHEN 
    CASE WHEN individual_shifts.start_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    or 
    CASE WHEN individual_shifts.end_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end 
    or
    CASE WHEN facility_shifts.start_time between individual_shifts.start_time and individual_shifts.end_time THEN true ELSE false end
    or
    CASE WHEN facility_shifts.end_time between individual_shifts.start_time and individual_shifts.end_time THEN true ELSE false end
    THEN true
    ELSE false END = true
    and facility_shifts.shift_finished = false AND facility_shifts.shift_cancelled = false AND facility_shifts.staff_hired_id = '${staff_id}') as booked_facility_shifts,

    (SELECT CURRENT_TIMESTAMP >= date_sub(individual_shifts.start_time,INTERVAL 15 minute)) as is_need_extend,

    (SELECT individual_shifts.id FROM individual_shifts WHERE staff_hired_id = '${staff_id}' AND individual_shifts.shift_finished = false AND shift_cancelled = false) as staff_hired_shift,
    (SELECT CURRENT_TIMESTAMP >= date_add(individual_shifts.start_time,INTERVAL 15 minute)) as is_time_past,
    (SELECT DISTANCE_BETWEEN(staff_applyshifts.lat,staff_applyshifts.lng,individual_shifts.lat,individual_shifts.lng) FROM staff_applyshifts WHERE staff_applyshifts.staff_id = ${staff_id} AND staff_applyshifts.shift_id = individual_shifts.id) * ${MILES_MILEAGE} as calculated_mileage,
    (SELECT staff.fcm_token FROM staff WHERE id = ${staff_id}) as staff_fcm_token
    FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') AND staff_hired_id is null HAVING shift_finished = false AND shift_cancelled = false ;
    `,(err,response,fields) =>{
        if(!err){   
        
            if(response[0]){


                if(response[0].staff_hired_id){
                    if(response[0].staff_hired_id == staff_id){
                        res.status(404).send({
                            message: 'already hired to this shift'
                            });
                        return
                    }else{
                        res.status(404).send({
                            message: 'You already hired another staff to this shift'
                            });
                        return
                    }
                }


                if(response[0].staff_hired_shift){
                    res.status(409).send({
                        message: 'This Staff is no more available for hire.'
                        });
                    return
                }

                if(response[0].is_time_past){
                    res.status(409).send({message:"Can't Hire staff because this shift is in the past, please cancel"})
                    return
                }

                if(response[0].booked_facility_shifts != 0){
                    res.status(409).send({
                        message: 'This Staff is no more available for hire.'
                        });
                    return
                }

                if(!response[0].connected_customer_account){
                    res.status(409).send({
                        message: "You didn't connected payment method yet."
                        });
                    return
                }
            
              
                const amount = (response[0].invoice_rate + response[0].calculated_mileage) * 100

                stripe.createCharge(response[0].connected_customer_account,amount,pm_id,
                    (success)=>{
                        pool.query(` 
                        UPDATE individual_shifts SET 
                        staff_hired_id = '${staff_id}', 
                        payment_intent_stripe = '${success.id}',
                        payment_charge_stripe = '${success.charges.data[0].id}',
                        start_time = CASE WHEN ${response[0].is_need_extend} THEN date_add(individual_shifts.start_time,INTERVAL 30 minute) ELSE start_time END,
                        end_time = CASE WHEN ${response[0].is_need_extend} THEN date_add(individual_shifts.end_time,INTERVAL 30 minute) ELSE end_time END,
                        hiring_time = CURRENT_TIMESTAMP
                        WHERE individual_shifts.id = ${response[0].id};

                        INSERT INTO staff_notifications(title,body,staff_id,date) values('You are Hired!',
                        CASE WHEN ${response[0].is_need_extend} THEN 'Good news!, You just got Hired for homeCare and shift extend 30 minutes.' ELSE 'Good news!, You just got Hired for homeCare.' END,'${staff_id}',CURRENT_TIMESTAMP);
                        
                        UPDATE individual_schedule SET 
                        start_time = CASE WHEN ${response[0].is_need_extend} THEN date_add('${response[0].start_time}',INTERVAL 45 minute) ELSE start_time END,
                        end_time = CASE WHEN ${response[0].is_need_extend} THEN date_add('${response[0].end_time}',INTERVAL 45 minute) ELSE end_time END
                        WHERE name = ${response[0].id};
                        `,(err,results,fields) =>{
                            if(err){   
                                res.status(500).send({message:err.sqlMessage})
                               return 
                            }
                            if(response[0].is_need_extend){

                                scheduleIndividualShift(
                                    response[0].individual_id,
                                    response[0].id,
                                    moment(response[0].start_time).add(45,'m').format('YYYY-MM-DD HH:mm:ss'), //Normal extra 30 minutes + 15 minutes for automatically schedualds
                                    moment(response[0].end_time).add(45,'m').format('YYYY-MM-DD HH:mm:ss'))
                
                                notification.sendNotification(response[0].staff_fcm_token,"You are Hired!","Good news!, You just got Hired for homeCare and shift extend 30 minutes.")
                            }else{
                                notification.sendNotification(response[0].staff_fcm_token,"You are Hired!","Good news!, You just got Hired for homeCare.")
                            }
                            res.send({'status':'success'})
                        })
                    },
                    (error)=>{
                        res.status(500).send({message:error.raw.message})
                    })


            }else{
                res.status(404).send({
                    message: "There's No Shift with this id"
                    });
            }

        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.post("/shift/dismiss",verifyTokenAndPermission(["individual"]),(req,res)=>{

    const staff_id = req.query.staff_id
    const result = validation_schema.dismissSchema.validate({staff_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') AND staff_hired_id is null HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,response,fields) =>{
        if(!err){   
        
            if(response[0]){

                pool.query(`DELETE FROM staff_applyshifts WHERE staff_id = ${staff_id} AND shift_id = ${response[0].id};`,(err,results,fields) =>{
                    if(!err){   
                        res.send({'status':'success_dismissed'})
                    }else{
                        res.status(500).send({message:err.sqlMessage})
                    }
                })

            }else{
                res.status(404).send({
                    message: "There's No Shift with this id"
                    });
            }

        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.post("/shift/cancel",verifyTokenAndPermission(["individual"]),(req,res)=>{

    pool.query(`
    SELECT * ,
    (SELECT fcm_token FROM staff WHERE id LIKE staff_hired_id) as staff_fcm
    FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,shift,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }
        
        if(!shift[0]){
            res.status(404).send({
                message: "There's no active shift for this user"
             });
             return
        }
        
        if(shift[0].shift_starts){
            res.status(409).send({
                message: "You cant cancel after clockin"
             });
            return
        }
        
        if(shift[0].staff_hired_id){
            //Shift has staff Hired
            stripe.refundCharge(shift[0].payment_charge_stripe,shift[0].payment_intent_stripe,
                (success)=>{
                    cancelIndividualShiftAfterHire(shift,true,res)
                },
                (error)=>{
                    cancelIndividualShiftAfterHire(shift,false,res)
                })
        }else{
            //Shift didn't Hired staff yet
            cancelIndividualShiftBeforeHire(shift,res)
        }
       
    })

})

function cancelIndividualShiftAfterHire(shift,refunded,res){
    pool.query(`
    UPDATE individual_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP , cancelled_reason = 'Individual cancelled before clockin',shift_refunded = ${refunded} WHERE id = ${shift[0].id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift Cancelled','You Cancelled the requested shfit #${shift[0].id}',${shift[0].individual_id},CURRENT_TIMESTAMP);
    INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift Cancelled','Individual Cancelled the shift ${shift[0].id}','${shift[0].staff_hired_id}',CURRENT_TIMESTAMP);
    DELETE FROM individual_schedule WHERE name = ${shift[0].id};`
    ,(err,response,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }
        notification.sendNotification(shift[0].staff_fcm,"Live Shift cancelled","Individual cancelled this shift.")
        res.send({message: "success"})
    })
}

function cancelIndividualShiftBeforeHire(shift,res){
    pool.query(`
    UPDATE individual_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP , cancelled_reason = 'Individual cancelled before clockin' WHERE id = ${shift[0].id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift Cancelled','You Cancelled the requested shfit #${shift[0].id}',${shift[0].individual_id},CURRENT_TIMESTAMP);
    DELETE FROM individual_schedule WHERE name = ${shift[0].id};`
    ,(err,response,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }
        res.send({message: "success"})
    })
}

app.post("/shift/report/",verifyTokenAndPermission(["individual"]),(req,res)=>{
    const reason = req.query.reason

    const result = validation_schema.report_shift.validate({reason})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
  
    pool.query(`
    SELECT *,
    (SELECT fcm_token FROM staff WHERE id LIKE staff_hired_id) as staff_fcm
    FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') and staff_hired_id is not null HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,shift,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(!shift[0]){
            res.status(404).send({message:"there's no active shift"})
            return
        }

        if(!shift[0].shift_starts){
            res.status(409).send({
                message:"You can't report before clockin"
            })
            return
        }

        pool.query(`
        INSERT IGNORE INTO reports_individual_shifts(shift_id,reason) values(${shift[0].id},'${reason.replace("'","''")}');
        UPDATE individual_shifts SET shift_cancelled = true,shift_reported = true, reported_time = CURRENT_TIMESTAMP, cancelled_reason = 'Individual reported shift'  WHERE id = ${shift[0].id};
        INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift holded','You reported the shift ${shift[0].id}.','${shift[0].individual_id}',CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift holded','Individual reported the shift ${shift[0].id}','${shift[0].staff_hired_id}',CURRENT_TIMESTAMP);
        DELETE FROM individual_schedule WHERE name = ${shift[0].id};
        `,(err,rows,fields) =>{
            if(err){  
                res.status(500).send({
                    message: err.sqlMessage
                })
                return
            }
            notification.sendNotification(shift[0].staff_fcm,"Live Shift holded",`Individual reported this shift ${shift[0].id}.`)
            res.send({message: "success"})
        })
    })

})

app.get("/history",verifyTokenAndPermission(["individual"]),(req,res)=>{

    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.historyShiftSchema.validate({time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
    
    pool.query(`
    SELECT * FROM future_individual_schedule WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}')`,(err,rows,fields) =>{
        if(!err){   
            rows = rows.map(({invoice_rate_staff, ...row}) => (
                row.schedule_date = moment(row.schedule_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.tasks = row.tasks.split("/"),
                row));
            res.send(rows)
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

module.exports = app;
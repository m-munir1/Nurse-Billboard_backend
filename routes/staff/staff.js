const express = require("express");
const app = express.Router();
const pool = require("../../connection");
const validation_schema = require('../../helpers/validation_schema/staff/staff_schema')
const { sendNotification } = require('../../helpers/notifications')
const {verifyTokenAndPermission} = require("../../helpers/jwt_helper");
const stripe = require("../../helpers/stripe_helper");
const overtime = require("../../helpers/overtime");
const multer = require("multer");
const path = require("path");
var moment = require('moment');
const {scheduleFacilityShift} = require("../../helpers/scheduleShifts")
require("dotenv").config();
const MAXIMUM_MILES = process.env.MAXIMUM_MILES;
const timesheet = require("../../helpers/timesheet_form")

const storage = multer.diskStorage({
    destination:(req,file,cb) =>{
        cb(null,'./requirements/');
    },
    filename : (req,file,cb) => {
        cb(null,req.user.phone.replace("+","") + req.params.requirement + path.extname(file.originalname));
    }
})

const storageProfilePic = multer.diskStorage({
    destination:(req,file,cb) =>{
        cb(null,'./profilepictures/');
    },
    filename : (req,file,cb) => {
        cb(null,req.user.phone.replace("+","") + "pp" + path.extname(file.originalname));
    }
})

const uploadRequirment = multer({storage,
    fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if(ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            return callback('Only images are allowed',false)
        }
        callback(null, true)
    }
    }).single("image")

const uploadProfilePic = multer({storage:storageProfilePic,
    fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if(ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            return callback('Only images are allowed',false)
        }
        callback(null, true)
    }
    }).single("profile_pic")

const uploadDocument = multer({
    fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if(ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            return callback('Only images are allowed',false)
        }
        callback(null, true)
    }
    }).single("document")


app.get("/account",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const privous_saturday = moment().day(moment().day() >= 6 ? 6 :-1).format('YYYY-MM-DD')
            pool.query(`SELECT *,
            (SELECT TRUNCATE(sum(finished_price_staff),2)
            FROM facility_shifts WHERE 
            staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') AND shift_finished = true AND payment_status = false AND clockout_time between '${privous_saturday}' and date_add('${privous_saturday}',INTERVAL 6 DAY)) as this_week_total,
            (SELECT staff_requirements.stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')) as stripe_account
            FROM staff WHERE phone = '${req.user.phone}'`,(err,rows,fields) =>{
                if(!err){   
                    if(rows.length){
                        const facility_this_week_earnings = ((rows[0].this_week_total)? rows[0].this_week_total : 0)

                        stripe.retrieveBalance(rows[0].stripe_account,
                            (balance)=>{
                                const availableFunds = ((rows[0].stripe_account) ? (balance.available[0].amount/100) + facility_this_week_earnings : 0 + facility_this_week_earnings)
                                rows = rows.map(({password, ...row}) => (
                                    row.account_approved = ((row.account_approved == 0) ? false : true),
                                    row.available_funds = ((availableFunds < 0)? 0 : availableFunds) ,
                                    row));
                                    res.send(rows[0])
                            },
                                (error)=>{
                                    rows = rows.map(({password, ...row}) => (
                                        row.account_approved = ((row.account_approved == 0) ? false : true),
                                        row.available_funds = 0 + facility_this_week_earnings,
                                        row));
                                        res.send(rows[0])
                                })
                    }else{
                        res.status(404).send("The server has not found staff")
                    }
                }else{
                    res.status(500).send({message:err.sqlMessage})
                }
            })

})

app.put("/account",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const first_name = req.query.first_name
    const last_name = req.query.last_name
    const fcm_token = req.query.fcm_token
    const email = req.query.email
    const gender = req.query.gender
    const language = req.query.language
    const role = req.query.role

    const city = req.query.city
    const country = req.query.country
    const postal_code = req.query.postal_code
    const state = req.query.state
    const address = req.query.address
    const lat = req.query.lat
    const long = req.query.long

    const result = validation_schema.updateAccountSchema.validate({first_name,last_name,fcm_token,address,email,gender,language,role,lat,long,city,country,postal_code,state})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(!fcm_token && !email && !gender && !language 
        && !role && !first_name && !last_name && !city && !country 
        && !state && !postal_code && !lat && !long && !address){
        res.status(400).send({
            message: 'Missing info'
         });
        return
    }

    if(lat || long || address || city || country || postal_code || state){
        if(!lat || !long || !address || !city || !country || !postal_code || !state){
            res.status(400).send({message: 'missing Location paramaters, Choose location again'});
            return
        }
    }

    pool.query(`
    UPDATE staff SET 
    first_name =  case when '${first_name}' != 'undefined' or not null then '${first_name}' else first_name end,
    last_name =  case when '${last_name}' != 'undefined' or not null then '${last_name}' else last_name end,
    fcm_token = case when '${fcm_token}' != 'undefined'  or not null then '${fcm_token}' else fcm_token end,
    city = case when '${city}' != 'undefined'  or not null then '${city}' else city end,
    country = case when '${country}' != 'undefined'  or not null then '${country}' else country end,
    postal_code = case when '${postal_code}' != 'undefined'  or not null then '${postal_code}' else postal_code end,
    state = case when '${state}' != 'undefined'  or not null then '${state}' else state end,
    address = case when '${address}' != 'undefined'  or not null then '${address}' else address end,
    lat = case when '${lat}' != 'undefined' or not null then '${lat}' else lat end,
    lng = case when '${long}' != 'undefined' or not null then '${long}' else lng end,
    email =  case when '${email}' != 'undefined' or not null then '${email}' else email end,
    gender =  case when '${gender}' != 'undefined' or not null then '${gender}' else gender end,
    language =  case when '${language}' != 'undefined' or not null then '${language}' else language end,
    role =  case when '${role}' != 'undefined' or not null then '${role}' else role end
    WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(!err){  
                res.send({status:"success"})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
   
})

app.put("/account/profile-pic",verifyTokenAndPermission(["staff"]),(req,res)=>{
    
    
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
        UPDATE staff SET 
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

app.post("/requirements/:requirement",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const requirement = req.params.requirement

    if(requirement != "nursing_certificate" && requirement != "driver_license" && 
    requirement != "backgroundCheck" && 
    requirement != "physical" && 
    requirement != "tb_test" && 
    requirement != "blsCpr" && 
    requirement != "vaccinations" && 
    requirement != "covid_vaccine_declination"&& 
    requirement != "live_scan"&& 
    requirement != "covid_test"&& 
    requirement != "oig_gsa"&& 
    requirement != "skills_assessment"){
        return res.status(400).send({message:"There's no requriement with this name"})
    }
    
    pool.query(`
    SELECT 
    ${requirement} as document_url,
    ${requirement}_approved as approved
    FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
    `,(err,rows,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(rows[0]){
            if(rows[0].approved){
                res.status(409).send({message:"Document already approved, can't upload new document."})
                return
            }
        }
       

        uploadRequirment(req, res, function (err) {
            if (err) {
              // An error occurred when uploading 
              res.status(400).send(err)
              return
            }

            if(!req.file){
                res.status(500).send({message:"Please Provide the requirment file"})
                return
            }

            pool.query(`
            INSERT INTO staff_requirements (${requirement},staff_id)
            VALUES ('${req.file.filename}',(SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')) 
            ON DUPLICATE KEY
            UPDATE ${requirement}='${req.file.filename}', staff_id=(SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
            `,(err,rows,fields) =>{
                if(!err){  
                    res.send({status:"success",img:`${req.file.filename}`})
                }else{
                    res.status(500).send({message:err.sqlMessage})
                }
            })
            // Everything went fine 
          })

    })

    
})

app.get("/requirements/:requirement",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const requirement = req.params.requirement

    if(requirement != "nursing_certificate" && requirement != "driver_license" && 
    requirement != "backgroundCheck" && 
    requirement != "physical" && 
    requirement != "tb_test" && 
    requirement != "blsCpr" && 
    requirement != "vaccinations" && 
    requirement != "covid_vaccine_declination"&& 
    requirement != "live_scan"&& 
    requirement != "covid_test"&& 
    requirement != "oig_gsa"&& 
    requirement != "skills_assessment"){
        return res.status(400).send({message:"There's no requriement with this name"})
    }

    pool.query(`
    SELECT 
    ${requirement} as document_url,
    ${requirement}_approved as approved
    FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
    `,(err,rows,fields) =>{
        if(!err){  
            if(!rows[0]) return res.status(404).send({message:`${req.params.requirement} not a requirement`})
            rows = rows.map(row => (
                row.approved = ((row.approved == 0) ? false : true),
                row.pending = ((row.document_url && row.approved == 0) ? true : false),
                row));
            res.send(rows[0])
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.get("/requirements",verifyTokenAndPermission(["staff"]),(req,res)=>{

    pool.query(`SELECT *,
    (SELECT staff.account_approved FROM staff WHERE phone LIKE '${req.user.phone}') as account_approved,
    (SELECT phone_interview FROM staff WHERE phone LIKE '${req.user.phone}') as phone_interview ,
    (SELECT on_boarding FROM staff WHERE phone LIKE '${req.user.phone}') as on_boarding ,
    (SELECT oreintation FROM staff WHERE phone LIKE '${req.user.phone}') as oreintation, 
    (SELECT register_date FROM staff WHERE phone LIKE '${req.user.phone}') as register_date
    FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')`,(err,rows,fields) =>{
        if(!err){ 
            if(rows.length){
                res.send({
                    stripe_account:rows[0].stripe_account,
                    account_approved:((rows[0].account_approved == 0) ? false : true),
                    phone_interview:((rows[0].phone_interview == 0) ? false : true),
                    on_boarding:((rows[0].on_boarding == 0) ? false : true),
                    oreintation:((rows[0].oreintation == 0) ? false : true),
                    register_date:rows[0].register_date ,
                    requirements:{
                        nursing_certificate:{
                            document_url:rows[0].nursing_certificate,
                            approved:((rows[0].nursing_certificate_approved == 0) ? false : true),
                            pending:((rows[0].nursing_certificate && rows[0].nursing_certificate_approved == 0) ? true : false)
                        },
                        driver_license:{
                            document_url:rows[0].driver_license,
                            approved:((rows[0].driver_license_approved == 0) ? false : true),
                            pending:((rows[0].driver_license && rows[0].driver_license_approved == 0) ? true : false)
                        },
                        backgroundCheck:{
                            document_url:rows[0].backgroundCheck,
                            approved:((rows[0].backgroundCheck_approved == 0) ? false : true),
                            pending:((rows[0].backgroundCheck && rows[0].backgroundCheck_approved == 0) ? true : false)
                        },
                        physical:{
                            document_url:rows[0].physical,
                            approved:((rows[0].physical_approved == 0) ? false : true),
                            pending:((rows[0].physical && rows[0].physical_approved == 0) ? true : false)
                        },
                        tb_test:{
                            document_url:rows[0].tb_test,
                            approved:((rows[0].tb_test_approved == 0) ? false : true),
                            pending:((rows[0].tb_test && rows[0].tb_test_approved == 0) ? true : false)
                        },
                        blsCpr:{
                            document_url:rows[0].blsCpr,
                            approved:((rows[0].blsCpr_approved == 0) ? false : true),
                            pending:((rows[0].blsCpr && rows[0].blsCpr_approved == 0) ? true : false)
                        },
                        vaccinations:{
                            document_url:rows[0].vaccinations,
                            approved:((rows[0].vaccinations_approved == 0) ? false : true),
                            pending:((rows[0].vaccinations && rows[0].vaccinations_approved == 0) ? true : false)
                        },
                        covid_vaccine_declination:{
                            document_url:rows[0].covid_vaccine_declination,
                            approved:((rows[0].covid_vaccine_declination_approved == 0) ? false : true),
                            pending:((rows[0].covid_vaccine_declination && rows[0].covid_vaccine_declination_approved == 0) ? true : false)
                        },
                        live_scan:{
                            document_url:rows[0].live_scan,
                            approved:((rows[0].live_scan_approved == 0) ? false : true),
                            pending:((rows[0].live_scan && rows[0].live_scan_approved == 0) ? true : false)
                        },
                        covid_test:{
                            document_url:rows[0].covid_test,
                            approved:((rows[0].covid_test_approved == 0) ? false : true),
                            pending:((rows[0].covid_test && rows[0].covid_test_approved == 0) ? true : false)
                        },
                        oig_gsa:{
                            document_url:rows[0].oig_gsa,
                            approved:((rows[0].oig_gsa_approved == 0) ? false : true),
                            pending:((rows[0].oig_gsa && rows[0].oig_gsa_approved == 0) ? true : false)
                        },
                        skills_assessment:{
                            document_url:rows[0].skills_assessment,
                            approved:((rows[0].skills_assessment_approved == 0) ? false : true),
                            pending:((rows[0].skills_assessment && rows[0].skills_assessment_approved == 0) ? true : false)
                        }
                    }
                })
            }else{        
                res.send(
                    {
                        stripe_account:null,
                        account_approved:false,
                        phone_interview:false,
                        on_boarding:false,
                        oreintation:false,
                        register_date:null,
                        requirements:{
                            nursing_certificate:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            driver_license:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            backgroundCheck:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            physical:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            tb_test:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            blsCpr:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            vaccinations:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            covid_vaccine_declination:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            live_scan:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            covid_test:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            oig_gsa:{
                                document_url:null,
                                approved:false,
                                pending:false
                            },
                            skills_assessment:{
                                document_url:null,
                                approved:false,
                                pending:false
                            }
                        }
                    })
            } 
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

//Payment Method
app.post("/payment-account",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const body = req.body

    const result = validation_schema.stripeAccount.validate(req.body)

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
    
    pool.query(`
    SELECT * ,
    (SELECT stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')) as stripe_account
    FROM staff WHERE id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
    `,(err,rows,fields) =>{
        if(!err){  
            if(rows[0].stripe_account) return res.send({message:"You already have stripe account",stripe_account:"use endpoint GET payment-account"})
            if(!rows[0].first_name || !rows[0].last_name || !rows[0].city || !rows[0].country  || !rows[0].postal_code  || !rows[0].state || !rows[0].address || !rows[0].email ) return res.status(409).send({message:"Fill all the info in your profile"})

            stripe.createStripeAccount({
                type: 'custom',
                country:'US',
                'capabilities[card_payments][requested]':true,
                'capabilities[transfers][requested]':true,
                'capabilities[us_bank_account_ach_payments][requested]':true,
                business_type:'individual',
                'business_profile[mcc]':8050,
                'individual[first_name]':rows[0].first_name,
                'individual[last_name]':rows[0].last_name,
                'tos_acceptance[date]':body.tos_acceptance.date,
                'tos_acceptance[ip]':body.tos_acceptance.ip,
                'individual[address][city]':rows[0].city,
                'individual[address][country]':rows[0].country,
                'individual[address][line1]':rows[0].address,
                'individual[address][postal_code]':rows[0].postal_code,
                'individual[address][state]':rows[0].state,
                'individual[dob][day]':body.dob.day,
                'individual[dob][month]':body.dob.month,
                'individual[dob][year]':body.dob.year,
                'individual[email]':rows[0].email,
                'individual[phone]':req.user.phone,
                'individual[id_number]':body.id_number,
                'individual[ssn_last_4]':body.id_number.slice(-4),
                'business_profile[product_description]':'Nursing'
            },
            (response)=>{
                pool.query(`
                INSERT INTO staff_requirements (stripe_account,staff_id) VALUES('${response.id}',(SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')) 
                ON DUPLICATE KEY UPDATE stripe_account='${response.id}';
                `,(err,rows,fields) =>{
                    if(!err){  
                        res.send({status:"success",message:"Created stripe account."})
                    }else{
                        res.status(500).send({message:err.sqlMessage})
                    }
                })
            },
            (error)=>{
                res.status(error.raw.statusCode).send({message:error.raw.message})
            }
            )
            
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.get("/payment-account",verifyTokenAndPermission(["staff"]),(req,res)=>{
    
    pool.query(`
    SELECT stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
    `,(err,rows,fields) =>{
        if(!err){  
            if(!rows[0]) return res.send({message:"You don't have stripe account",stripe_account:null})
            if(!rows[0].stripe_account) return res.send({message:"You don't have stripe account",stripe_account:null})

            stripe.retrieveStripeAccount(
                rows[0].stripe_account,
                response=>{
                    res.send({message:"Stripe account",stripe_account:{
                        first_name:response.individual.first_name,
                        last_name:response.individual.last_name,
                        phone:response.individual.phone,
                        email:response.individual.email,
                        account:response.individual.account,
                        address:{
                            city:response.individual.address.city,
                            country:response.individual.address.country,
                            line1:response.individual.address.line1,
                            postal_code:response.individual.address.postal_code,
                            state:response.individual.address.state,
                        },
                        dob:{
                            day:response.individual.dob.day,
                            month:response.individual.dob.month,
                            year:response.individual.dob.year,
                        },
                        details_submitted:response.details_submitted,
                        charges_enabled:response.charges_enabled,
                        payouts_enabled:response.payouts_enabled,
                        document_verification:{
                            document:response.individual.verification.document,
                            status:response.individual.verification.status
                        },
                        default_currency:response.default_currency,
                        requirements:response.requirements,
                        payment_methods:response.external_accounts
                    }})
                },
                error=>{
                    res.status(error.raw.statusCode).send({message:error.raw.message})
                        return
                }
                
            );
           
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.put("/payment-account",verifyTokenAndPermission(["staff"]),(req,res)=>{

    var first_name = ((req.query.first_name)? req.query.first_name : undefined)
    var last_name =  ((req.query.last_name)? req.query.last_name : undefined)
    var email = ((req.query.email)? req.query.email : undefined)
    var phone = ((req.query.phone)? req.query.phone : undefined)
    var ssn_last_4 = ((req.query.ssn_last_4)? req.query.ssn_last_4 : undefined)
    var id_number = ((req.query.id_number)? req.query.id_number : undefined)
    var address_city = ((req.query.address_city)? req.query.address_city : undefined)
    var address_line1 = ((req.query.address_line1)? req.query.address_line1 : undefined)
    var address_postal_code = ((req.query.address_postal_code)? req.query.address_postal_code : undefined)
    var address_state = ((req.query.address_state)? req.query.address_state : undefined)
    var dob_day = ((req.query.dob_day)? req.query.dob_day : undefined)
    var dob_month = ((req.query.dob_month)? req.query.dob_month : undefined)
    var dob_year = ((req.query.dob_year)? req.query.dob_year : undefined)

    const result = validation_schema.stripeAccountUpdate.validate({
        person:{
            first_name,
            last_name,
            email,
            phone,
            ssn_last_4,
            id_number,
            address:{
                city:address_city,
                address:address_line1,
                postal_code:address_postal_code,
                state:address_state
            },
            dob:{
                day:dob_day,
                month:dob_month,
                year:dob_year
            }
        }
    })

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
    
    pool.query(`
    SELECT stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
    `,(err,rows,fields) =>{
        if(!err){  
            if(!rows[0]) return res.send({message:"You don't have stripe account",stripe_account:null})
            if(!rows[0].stripe_account) return res.send({message:"You don't have stripe account",stripe_account:null})

            stripe.updateAccount(rows[0].stripe_account, {
                'individual[first_name]':first_name,
                'individual[last_name]':last_name,
                'individual[address][city]':address_city,
                'individual[address][line1]':address_line1,
                'individual[address][postal_code]':address_postal_code,
                'individual[address][state]':address_state,
                'individual[dob][day]':dob_day,
                'individual[dob][month]':dob_month,
                'individual[dob][year]':dob_year,
                'individual[email]':email,
                'individual[phone]':phone,
                'individual[ssn_last_4]':ssn_last_4,
                'individual[id_number]':id_number,
            },
            (response)=>{
                    res.send(response)
            },
            (error)=>{
                    res.status(error.raw.statusCode).send({message:error.raw.message})
            }) 

        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.post("/payment-verification",verifyTokenAndPermission(["staff"]),(req,res)=>{

    pool.query(`
    SELECT stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
    `,(err,rows,fields) =>{
        if(!err){  
            if(!rows[0]) return res.send({message:"You don't have stripe account",stripe_account:null})
            if(!rows[0].stripe_account) return res.send({message:"You don't have stripe account",stripe_account:null})

            uploadDocument(req, res, function (err) {
                if (err) {
                  // An error occurred when uploading 
                  res.status(503).send(err)
                  return
                }

                if(!req.file){
                    res.status(500).send({message:"Please Provide the document"})
                    return
                }
        
                stripe.createFile(req.file.buffer,
                    (response)=>{
                        stripe.updateAccount(rows[0].stripe_account, {
                                'individual[verification][document][front]':response.id
                                },
                                (response)=>{
                                    res.send(response)
                                },
                                (error)=>{
                                    res.status(error.raw.statusCode).send({message:error.raw.message})
                                })                      
                    },
                    (error)=>{
                        res.status(error.raw.statusCode).send({message:error.raw.message})
                    })
           
                // Everything went fine 
              })
          
           
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.post("/payment-method",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const payment_type = req.query.payment_type

    const card_holder_name = req.query.card_holder_name
    const card_number = req.query.card_number
    const card_exp_month = req.query.card_exp_month
    const card_exp_year = req.query.card_exp_year
    const card_cvc = req.query.card_cvc

    const account_holder_name = req.query.account_holder_name
    const routing_number = req.query.routing_number
    const account_number = req.query.account_number

    var payment_method = {}

    const card = {
        card:{
            name:card_holder_name,
            currency: 'usd',
            number: card_number,
            exp_month: card_exp_month,
            exp_year: card_exp_year,
            cvc: card_cvc
        }
    }
    const bank = { 
        bank_account:{
            country: 'US',
            currency: 'usd',
            account_holder_name: account_holder_name,
            account_holder_type: 'individual',
            routing_number: routing_number,
            account_number: account_number
        }
    }


    if(payment_type == 'card'){
        payment_method = card
        const result = validation_schema.paymentMethodCard.validate(payment_method.card)

        if(result.error){
            res.status(400).send({
                message: result.error.details[0].message
             });
            return
        }

    }else if(payment_type == 'bank_account'){
        payment_method = bank

        const result = validation_schema.paymentMethodBank.validate(payment_method.bank_account)

        if(result.error){
            res.status(400).send({
                message: result.error.details[0].message
             });
            return
        }
    }else{
        res.status(400).send({
            message: "Wrong payment type card or bank_account"
         });
        return
    }

    pool.query(`
    SELECT stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}');
    `,(err,rows,fields) =>{
        if(!err){  
            if(!rows[0]) return res.status(404).send({status:"no_stripe_account",message:"You don't have stripe account"})
            if(!rows[0].stripe_account) return res.status(404).send({status:"no_stripe_account",message:"You don't have stripe account"})

            stripe.paymentToken(payment_method,
                (response)=>{
                    stripe.addAccountPayment(rows[0].stripe_account,response.id,
                        (response)=>{
                            res.send({status:"success",message:"Payment Method added successfully"})
                        },
                        (error)=>{
                            res.status(error.raw.statusCode).send({message:error.raw.message})
                        })
                },
                (error)=>{
                    res.status(error.raw.statusCode).send({message:error.raw.message})
                })
           
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
})
//Payment Method

app.get("/notifications",verifyTokenAndPermission(["staff"]),(req,res)=>{
   
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

    pool.query(`SELECT * FROM staff_notifications WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') ORDER BY date DESC`,(err,rows,fields) =>{
        if(!err){   

            rows = rows.map(row => (
                row.date = moment(row.date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
            row));

            res.send(rows)
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.get("/earnings/homecare",verifyTokenAndPermission(["staff"]),(req,res)=>{

    pool.query(`SELECT staff_requirements.stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
          return
        }

        if(!rows[0]){
            res.status(404).send({message:"You didn't created stripe account yet"})
            return
        }

        if(!rows[0].stripe_account){
            //null
            res.status(404).send({message:"You didn't created stripe account yet"})
            return
        }

        stripe.retrieveEarnings(rows[0].stripe_account,
            (error)=>{
                res.status(500).send({message:"There's an error happened"})
            },
            (success)=>{
                res.send(success)
            })
    })
   
})

app.get("/earnings/facility",verifyTokenAndPermission(["staff"]),(req,res)=>{

    var start_payroll_date = ''
    var end_payroll_date = ''

    const current_day = moment().format('DD') 
    const current_date = moment().format('YYYY-MM')
    const endOfMonth  = moment().endOf('month').format('DD')

    if(current_day < 16){
        //Payroll from 1 to 15
        start_payroll_date = `${current_date}-01`
        end_payroll_date = `${current_date}-15`

    }else if(current_day >= 16 ){
        //Payroll from 16 to end of the month
        start_payroll_date = `${current_date}-16`
        end_payroll_date = `${current_date}-${endOfMonth}`
    }

    pool.query(`
    SELECT TRUNCATE(sum(finished_price_staff),2) as this_week_total , '${moment(end_payroll_date).add(1,'day').format('YYYY-MM-DD')}' as next_payroll_date,
    TRUNCATE((SELECT sum(finished_price_staff) FROM facility_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') AND shift_finished = true),2) as life_time_earnings
    FROM facility_shifts WHERE 
    staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') AND shift_finished = true AND payment_status = false AND clockout_time between '${start_payroll_date}' and '${end_payroll_date}';
 
    SELECT payroll_id as id, sum(finished_price_staff) as payroll_staff_total, 
    (SELECT payroll_date FROM payrolls WHERE id = payroll_id) as payroll_date
    FROM facility_shifts WHERE 
    staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') 
    AND shift_finished = true
    AND (SELECT payroll_date FROM payrolls WHERE id = payroll_id) is not null
    AND start_time Between (SELECT invoice_date FROM invoices WHERE id = invoice_id) AND (SELECT invoice_due_date FROM invoices WHERE id = invoice_id) GROUP BY id;
;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows[1] = rows[1].map((row) => (
            row.payroll_staff_total = ((row.payroll_staff_total) ? row.payroll_staff_total : 0),
            row));

        res.send({
            this_week_total:((rows[0][0].this_week_total)? rows[0][0].this_week_total : 0),
            next_payroll_date:rows[0][0].next_payroll_date,
            life_time_earnings:rows[0][0].life_time_earnings,
            payrolls:rows[1]})
    })
   
})

app.post("/get-paid",verifyTokenAndPermission(["staff"]),(req,res)=>{ 
    const method = req.query.method

    if(method != "instant" && method != "standard"){
        res.status(400).send({
            message: "method must be instant or standard"
         });
        return
    }

    pool.query(`SELECT staff_requirements.stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')`,(err,rows,fields) =>{
        if(!err){   

            if(!rows[0]){
                //null
                res.status(404).send({message:"This staff didn't created stripe account yet"})
                return
            }

            if(!rows[0].stripe_account){
                //null
                res.status(404).send({message:"This staff didn't created stripe account yet"})
                return
            }
            
            stripe.getPaid(method,rows[0].stripe_account,
                (error)=>{
                    res.status(500).send(error)
                },
                (success)=>{
                    res.send({status:"success",message:"successfully paid"})
                })
        
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
   
})

app.get("/payouts",verifyTokenAndPermission(["staff"]),(req,res)=>{
  
    pool.query(`SELECT staff_requirements.stripe_account FROM staff_requirements WHERE staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')`,(err,rows,fields) =>{
        if(!err){   

            if(!rows[0].stripe_account){
                //null
                res.status(404).send({message:"This staff didn't created stripe account yet"})
                return
            }
            
            stripe.getPayouts(rows[0].stripe_account,
                (error)=>{
                    res.status(500).send(error)
                },
                (success)=>{
                    res.send(success)
                })
        
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})
 
app.get("/messages",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const messages_type = req.query.messages_type
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.messages.validate({messages_type,time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(messages_type == "facility"){
        //distincet facility_id
        pool.query(`
        SELECT id, shift_finished,shift_cancelled ,facility_id, staff_hired_id, 
        (SELECT json_object('facility_name',facilites.facility_name,'phone',facilites.phone)  
        FROM facilites WHERE id = facility_shifts.facility_id) as facility,
        (SELECT json_object('message_date',messages.message_date,'message',messages.message,'sender_phone',messages.sender_phone,'receiver_phone',messages.receiver_phone,'receiver_seen',messages.receiver_seen)  
        FROM messages WHERE 
        sender_phone LIKE (SELECT phone FROM facilites WHERE id = facility_shifts.facility_id) 
        AND receiver_phone LIKE '${req.user.phone}'
        AND shift_id = facility_shifts.id
        or 
        sender_phone LIKE '${req.user.phone}' 
        AND receiver_phone LIKE (SELECT phone FROM facilites WHERE id = facility_shifts.facility_id)
        AND shift_id = facility_shifts.id
        ORDER BY message_date DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE shift_id = facility_shifts.id AND receiver_phone LIKE '${req.user.phone}' AND receiver_seen = false) as unread_messages
        FROM facility_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
        `,(err,rows,fields) =>{

            if(err){
                res.status(500).send({message:err.sqlMessage})
              return
            }

            rows = rows.map(row => (
                row.facility = JSON.parse(row.facility), 
                row.last_message = ((JSON.parse(row.last_message)) ? 
                JSON.parse(`{"message":"${JSON.parse(row.last_message).message}","message_date":"${moment(JSON.parse(row.last_message).message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")}","sender_phone":"${JSON.parse(row.last_message).sender_phone}","receiver_seen":"${((JSON.parse(row.last_message).receiver_seen == 0) ? false : true)}","receiver_phone":"${JSON.parse(row.last_message).receiver_phone}"}`) : JSON.parse(row.last_message)),
                row));
                res.send(rows)
            
        })  

    }else if (messages_type == "individual"){

        pool.query(`
        SELECT id, shift_finished,shift_cancelled ,individual_id, staff_hired_id, 
        (SELECT json_object('full_name',individuals.full_name,'phone',individuals.phone)  
        FROM individuals WHERE id = individual_shifts.individual_id) as individual,
        (SELECT json_object('message_date',messages.message_date,'message',messages.message,'sender_phone',messages.sender_phone,'receiver_phone',messages.receiver_phone,'receiver_seen',messages.receiver_seen)  
        FROM messages WHERE 
        sender_phone LIKE (SELECT phone FROM individuals WHERE id = individual_shifts.individual_id) 
        AND receiver_phone LIKE '${req.user.phone}'
        AND shift_id = individual_shifts.id
        or 
        sender_phone LIKE '${req.user.phone}' 
        AND receiver_phone LIKE (SELECT phone FROM individuals WHERE id = individual_shifts.individual_id)
        AND shift_id = individual_shifts.id 
        ORDER BY message_date DESC LIMIT 1) as last_message,
        (SELECT COUNT(*) FROM messages WHERE shift_id = individual_shifts.id AND receiver_phone LIKE '${req.user.phone}' AND receiver_seen = false) as unread_messages
        FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
        `,(err,rows,fields) =>{
            if(err){
                res.status(500).send({message:err.sqlMessage})
              return
            }

            rows = rows.map(row => (
            row.individual = JSON.parse(row.individual), 
            row.last_message = ((JSON.parse(row.last_message)) ? 
            JSON.parse(`{"message":"${JSON.parse(row.last_message).message}","message_date":"${moment(JSON.parse(row.last_message).message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")}","sender_phone":"${JSON.parse(row.last_message).sender_phone}","receiver_seen":"${((JSON.parse(row.last_message).receiver_seen == 0) ? false : true)}","receiver_phone":"${JSON.parse(row.last_message).receiver_phone}"}`) : JSON.parse(row.last_message)),
            row));
            res.send(rows)
            
        })  

    }else{
        res.status(400).send({message:"Wrong messages type should be 'facility' or 'individual' "})
        return
    }


})

app.get("/messages/:phone",verifyTokenAndPermission(["staff"]),(req,res)=>{
    
    const clientPhone = req.params.phone
    const shift_id = req.query.shift_id
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.messagesUser.validate({clientPhone,shift_id,time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * 
    FROM messages WHERE
    sender_phone LIKE '${clientPhone}'
    AND receiver_phone LIKE '${req.user.phone}'
    AND shift_id = ${shift_id}
    or 
    sender_phone LIKE '${req.user.phone}' 
    AND receiver_phone LIKE '${clientPhone}'
    AND shift_id = ${shift_id}
    ORDER BY message_date ASC;

    UPDATE messages SET receiver_seen = true WHERE shift_id = ${shift_id} AND receiver_phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{

        if(err){
            res.status(500).send({message:err.sqlMessage})
          return
        }

        rows = rows[0].map(row => (
            row.message_date = moment(row.message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
            row.receiver_seen = ((row.receiver_seen == 0) ? false : true),
            row));
            res.send(rows)
    })   

})

// INDIVIDUAL SIDE
app.get("/individual_shift/active-shift",verifyTokenAndPermission(["staff"]),(req,res)=>{
  
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.activeIndividualShiftSchema.validate({time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT *,
    (SELECT mileage FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as mileage,
    (SELECT DISTANCE_BETWEEN(staff_applyshifts.lat,staff_applyshifts.lng,individual_shifts.lat,individual_shifts.lng)
    FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as staff_distance_miles,
    (SELECT json_object('full_name',individuals.full_name,'profile_pic',individuals.profile_pic,'phone',individuals.phone)  
    FROM individuals WHERE id = individual_shifts.individual_id) as individual 
    FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,shift,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return            
        }

        if(shift[0]){
            
            shift = shift.map(({invoice_rate, ...row}) => (
                row.individual = JSON.parse(row.individual), 
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.invoice_rate = row.invoice_rate_staff,
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

                shift = shift.map(({invoice_rate_staff, ...row}) => (row)) 

                res.send({status:"active_shift",shift:shift[0]})

        }else{
            res.send({status:"no_active_shift",shift:null})
        }
  
    })

})

app.get("/individual_shift/nearby-shifts",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const lat = req.query.lat
    const long = req.query.long
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.nearbyIndividualShiftsSchema.validate({lat,long,time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    select *,

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
    and facility_shifts.shift_finished = false AND facility_shifts.shift_cancelled = false AND facility_shifts.staff_hired_id = (SELECT id FROM staff WHERE phone = '${req.user.phone}')) AS booked_facility_shifts,

    (SELECT staff_id FROM staff_applyshifts WHERE shift_id = individual_shifts.id AND staff_applyshifts.staff_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')) as staff_applied,
    DISTANCE_BETWEEN(individual_shifts.lat,individual_shifts.lng,${lat},${long}) as staff_distance_miles,
    (SELECT end_time FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') AND shift_finished = false AND shift_cancelled = false) as live_end_time,
    (SELECT json_object('full_name',individuals.full_name,'profile_pic',individuals.profile_pic,'phone',individuals.phone)  
    FROM individuals WHERE id = individual_shifts.individual_id) as individual
    from individual_shifts
    WHERE 
    individual_shifts.staff_hired_id  IS NULL AND 
    shift_finished = false AND 
    shift_cancelled = false AND
    CASE WHEN (SELECT role FROM staff WHERE phone LIKE '${req.user.phone}') = 'HomeCare Aide' and role = 'HomeCare Aide' THEN true ELSE 
    CASE WHEN (SELECT role FROM staff WHERE phone LIKE '${req.user.phone}') = 'RN' or (SELECT role FROM staff WHERE phone LIKE '${req.user.phone}') = 'LVN | LPN' and role = 'RN' or role = 'LVN | LPN' or role = 'HomeCare Aide' THEN true ELSE false END END
    HAVING
    booked_facility_shifts = 0 AND  
    staff_distance_miles <= ${MAXIMUM_MILES} and 
    case when live_end_time != null then 
    live_end_time >= individual_shifts.start_time
    else  individual_shifts.start_time = individual_shifts.start_time end
    order by 
    staff_distance_miles asc,
    start_time asc,
    role LIKE (SELECT role FROM staff WHERE id = staff_applied ) DESC, 
    language LIKE (SELECT language FROM staff WHERE id = staff_applied ) DESC,
    gender LIKE (SELECT gender FROM staff WHERE id = staff_applied ) DESC;`,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({live_start_time,live_end_time,invoice_rate,booked_facility_shifts, ...row}) => (
            row.individual = JSON.parse(row.individual),
            row.staff_applied = ((row.staff_applied) ? true : false),
            row.shift_starts = ((row.shift_starts == 0) ? false : true),
            row.shift_finished = ((row.shift_finished == 0) ? false : true),
            row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
            row.invoice_rate = row.invoice_rate_staff,
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
            row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
            row)) 

        rows = rows.map(({invoice_rate_staff, ...row}) => (row)) 

        res.send(rows)
    })
   
})

app.post("/individual_shift/apply",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const shift_id = req.query.shift_id
    const lat = req.query.lat
    const long = req.query.long

    const result = validation_schema.applyIndividualSchema.validate({shift_id,lat,long})

    if(result.error){
        res.status(400).send(result.error.details[0].message)
        return
    }

    pool.query(`
    SELECT individual_shifts.id as shift_id, individual_shifts.individual_id , individual_shifts.shift_finished, individual_shifts.shift_cancelled, individual_shifts.staff_hired_id, individual_shifts.start_time,
    (SELECT CURRENT_TIMESTAMP >= date_add(individual_shifts.start_time,INTERVAL 15 minute)) as is_time_past,
    (SELECT DISTANCE_BETWEEN(individual_shifts.lat,individual_shifts.lng,${lat},${long})) as shift_distance,
    (SELECT id from staff WHERE phone LIKE '${req.user.phone}') as user_staff_id, 
    (SELECT individuals.fcm_token FROM individuals WHERE id = individual_shifts.individual_id) as individual_fcm_token,
    (SELECT staff.first_name FROM staff WHERE id = user_staff_id) as staff_first_name,
    (SELECT staff.last_name FROM staff WHERE id = user_staff_id) as staff_last_name,
    (SELECT individual_shifts.id FROM individual_shifts WHERE staff_hired_id = user_staff_id AND shift_finished = false AND shift_cancelled = false) as staff_already_hired,
    (SELECT staff_applyshifts.staff_id FROM staff_applyshifts WHERE staff_applyshifts.staff_id = user_staff_id AND staff_applyshifts.shift_id = ${shift_id}) as already_applied, 
    (SELECT staff.account_approved FROM staff WHERE id = user_staff_id) as staff_account_approved,
    (SELECT stripe_account FROM staff_requirements WHERE staff_id = user_staff_id) as stripe_account
    FROM individual_shifts WHERE id = ${shift_id} HAVING individual_shifts.staff_hired_id IS NULL AND individual_shifts.shift_finished = false AND individual_shifts.shift_cancelled = false;

    SELECT count(id) as booked_shifts FROM facility_shifts Where 
    CASE WHEN 
    CASE WHEN (SELECT start_time FROM individual_shifts where id = ${shift_id}) between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    or 
    CASE WHEN (SELECT end_time FROM individual_shifts where id = ${shift_id}) between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end 
    or
    CASE WHEN facility_shifts.start_time between (SELECT start_time FROM individual_shifts where id = ${shift_id}) and (SELECT end_time FROM individual_shifts where id = ${shift_id}) THEN true ELSE false end
    or
    CASE WHEN facility_shifts.end_time between (SELECT start_time FROM individual_shifts where id = ${shift_id}) and (SELECT end_time FROM individual_shifts where id = ${shift_id}) THEN true ELSE false end
    THEN true
    ELSE false END = true
    and facility_shifts.shift_finished = false AND facility_shifts.shift_cancelled = false AND facility_shifts.staff_hired_id = (SELECT id FROM staff WHERE phone = '${req.user.phone}');
    `
    ,(err,response,fields) =>{

        if(!err){

            if(!response[0][0]){
                res.status(409).send({message:"its already has working staff or it doesn't exists anymore"})
                return
            }

            if(!response[0][0].user_staff_id){
                //staff Not Exists
                res.status(404).send({
                    message: 'staff Not Exists, wrong id'
                    });
                return
            }

            if(response[0][0].is_time_past){
                res.status(409).send({message:"Can't apply to this shift, start time in past"})
                return
            }

            
            if(response[0][0].staff_already_hired){
                res.status(409).send({
                    message: 'you already hired'
                    });
                return
            }

            if(response[0][0].user_staff_id == response[0][0].already_applied){
                res.status(409).send({
                    message: 'already applied to this shift'
                    });
                return
            }

            if(response[0][0].staff_account_approved == 0){
                res.status(409).send({
                    message: 'Your account not approved'
                    });
                return
            }

            if(!response[0][0].stripe_account){
                res.status(409).send({
                    message: 'Create Payment account first'
                    });
                return
            }

            if(!response[0][0].staff_first_name || !response[0][0].staff_last_name){
                res.status(409).send({
                    message: 'Full name missing'
                    });
                return
            }

            if(response[1][0].booked_shifts != 0){
                res.status(409).send({message:"You already have a shift at this time"})
                return
            }

            if(response[0][0].shift_distance > 35){
                res.status(409).send({
                    message: 'This shift is far away +35 mile'
                    });
                return
            }


            pool.query(`
            UPDATE facility_shifts SET applied_time = CURRENT_TIMESTAMP WHERE id = ${shift_id};
            INSERT INTO staff_applyshifts(shift_id,staff_id,lat,lng,mileage,applied_time) values(${shift_id},'${response[0][0].user_staff_id}',${lat} ,${long},TRUNCATE(${response[0][0].shift_distance * 0.58},2),CURRENT_TIMESTAMP);
            INSERT INTO individuals_notifications(title,body,individual_id,date) values('Staff Applied','Staff just Applied for your Live Request',${response[0][0].individual_id},CURRENT_TIMESTAMP);`
            ,(err,result,fields) =>{
                if(!err){
                    sendNotification(response[0][0].individual_fcm_token,"Staff Applied","Staff just Applied for your Live Request")
                    res.send({'status':'success'})
                }else{
                    res.status(500).send({message:err.sqlMessage})
                }
            })

        }else{
            console.log(err)
            res.status(500).send({message:err.sqlMessage})
        }

    })

})

app.post("/individual_shift/clockin",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const lat = req.query.lat
    const long = req.query.long
    const result = validation_schema.clockInIndividualSchema.validate({lat,long})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * ,
    (DISTANCE_BETWEEN(individual_shifts.lat,individual_shifts.lng,${lat},${long})) as staff_distance_miles,
    (SELECT TIMESTAMPDIFF(MINUTE,CURRENT_TIMESTAMP,individual_shifts.start_time)) as difference_time,
    (SELECT individuals.fcm_token FROM individuals WHERE id LIKE individual_shifts.individual_id) as individual_fcm_token
    FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false`
    ,(err,response,fields) =>{
        if(!err){ 
            if(response[0]){

                if(response[0].shift_finished == 1){
                    res.status(404).send({
                        message: `You clocked out already`
                        });
                        return
                }

                if(response[0].shift_starts == 1){
                    res.status(404).send({
                        message: `Already clocked in`
                        });
                        return
                }

                if(response[0].staff_distance_miles > 0.1){
                    res.status(404).send({
                        message: `You didn't arrive yet, ${response[0].staff_distance_miles} miles left`
                        });
                        return
                }

                if(response[0].difference_time >= 15){
                    res.status(404).send({
                        message: `Your shift has not yet started. Please wait..`
                        });
                        return
                }

                pool.query(`
                UPDATE individual_shifts SET shift_starts = true, clockin_time = CURRENT_TIMESTAMP WHERE id = ${response[0].id};
                INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${response[0].id} Started','Staff just Clocked-In',${response[0].individual_id},CURRENT_TIMESTAMP);`
                ,(err,responseStart,fields) =>{
                    if(!err){ 
                            sendNotification(response[0].individual_fcm_token,`Live Shift #${response[0].id} Started`,"Staff just Clocked-In")
                            res.send({status:"success"})
                    }else{
                        res.status(500).send({message:err.sqlMessage})
                    }
                })

            }else{
                res.status(404).send({
                    message: `There's no active shift to start`
                    });
                    return
            }
        }else{
            res.status(500).send({message:err.sqlMessage})
                return
        }
    })


})

app.post("/individual_shift/clockout",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const signature = req.query.signature
    const lat = req.query.lat
    const long = req.query.long

    const result = validation_schema.clockOutIndividualSchema.validate({lat,long,signature})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * ,
    (DISTANCE_BETWEEN(individual_shifts.lat,individual_shifts.lng,${lat},${long})) as staff_distance_miles,
    (SELECT transfer_id FROM staff_transfers WHERE shift_id = individual_shifts.id) as transfer_id,
    individual_shifts.staff_hired_id,TIMESTAMPDIFF(MINUTE,CURRENT_TIMESTAMP,individual_shifts.end_time) as difference_time,
    (SELECT individuals.fcm_token FROM individuals WHERE id LIKE individual_shifts.individual_id) as individual_fcm_token,
    (SELECT staff_requirements.stripe_account FROM staff_requirements WHERE staff_id LIKE individual_shifts.staff_hired_id) as stripe_account,
    (SELECT mileage FROM staff_applyshifts WHERE shift_id = individual_shifts.id AND staff_id = individual_shifts.staff_hired_id) as mileage,
    (CASE WHEN CURRENT_TIMESTAMP >= date_add(individual_shifts.end_time,INTERVAL 15 minute) THEN date_add(DATE_FORMAT(individual_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute) else CURRENT_TIMESTAMP END) as clockout_calculated_time
    FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false AND shift_starts = true;`
    ,(err,response,fields) =>{
        if(!err){ 

            if(response[0]){

                if(response[0].shift_starts == 0){
                    res.status(404).send({
                        message: `Clock in first`
                        });
                        return
                }

                if(response[0].shift_finished == 1){
                    res.status(404).send({
                        message: `Already clocked out`
                        });
                        return
                }

                if(response[0].difference_time >= 0){
                    res.status(404).send({
                        message: `You can clockout in ${response[0].difference_time} Minutes`
                        });
                        return
                }
                
                if(response[0].staff_distance_miles > 0.1){
                    res.status(404).send({
                        message: `Get close and let client clockout with signature, ${response[0].staff_distance_miles} miles left`
                        });
                        return
                }

                stripe.transferCharge((response[0].invoice_rate_staff + response[0].mileage) * 100 ,response[0].stripe_account, response[0].payment_charge_stripe,
                    (success)=>{
                        clockoutShiftWithTransfer(res,response,success,signature)
                    },
                    (error)=>{
                        res.status(500).send({message:error.err.raw.message})
                    })

            }else{
                res.status(404).send({
                    message: `You don't have active shift or you didn't started the shift yet`
                    });
            }
                
        }else{
            res.status(500).send({message:err.sqlMessage})
        }

    })

})

function clockoutShiftWithTransfer(res,response,success,signature){
    pool.query(`
    INSERT INTO staff_transfers(shift_id,staff_id,transfer_id) values('${response[0].id}',${response[0].staff_hired_id},'${success.id}');
    UPDATE individual_shifts SET shift_finished = true, clockout_signature = '${signature}',clockout_time = '${response[0].clockout_calculated_time}' , staff_paid = true WHERE id = ${response[0].id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift #${response[0].id} Compeleted','Staff just Compeleted the Live shift',${response[0].individual_id},CURRENT_TIMESTAMP);
    DELETE FROM individual_schedule WHERE name = ${response[0].id};`
    ,(err,responseFinish,fields) =>{
        if(!err){ 
            sendNotification(response[0].individual_fcm_token,`Live Shift #${response[0].id} Completed`,"Staff just Compeleted the Live shift")
            res.send({status:"success"})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
}

app.get("/individual_shift/history",verifyTokenAndPermission(["staff"]),(req,res)=>{
   
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.historyIndividualShiftSchema.validate({time_zone})

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
    FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = true or shift_cancelled = true ORDER BY start_time DESC;`,(err,rows,fields) =>{
        if(!err){   
            rows = rows.map(({invoice_rate, ...row}) => (
                row.individual = JSON.parse(row.individual), 
                row.shift_starts = ((row.shift_starts == 0) ? false : true),
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.invoice_rate = row.invoice_rate_staff,
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
                row
                ));

                rows = rows.map(({invoice_rate_staff, ...row}) => (row)) 

            res.send(rows)
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.post("/individual_shift/cancel",verifyTokenAndPermission(["staff"]),(req,res)=>{
   
    pool.query(`
    SELECT *, 
    (SELECT mileage FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as mileage,
    (SELECT fcm_token FROM individuals WHERE id = individual_shifts.individual_id) as individual_fcm_token
    FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false; 
    `,(err,shift,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }
        
        if(!shift[0]){
            res.status(404).send({message:"You don't have active shift"})
            return
        }

        if(shift[0].shift_starts){
            res.status(409).send({message:"You cant cancel after clockin"})
            return
        }

        stripe.refundCharge(shift[0].payment_intent_stripe,
            (success)=>{
                cancelIndividualShiftBeforeClockin(shift,true,res,success.id)
            },
            (error)=>{
                console.log(error)
                cancelIndividualShiftBeforeClockin(shift,false,res,null)
            })

    })
})

function cancelIndividualShiftBeforeClockin(shift,refunded,res,refund_id){
    pool.query(`
    UPDATE individual_shifts SET shift_cancelled = true, cancelled_reason = 'Staff cancelled',shift_refunded = ${refunded}, payment_refund_stripe = if('${refund_id}' is not null,'${refund_id}',payment_refund_stripe)  WHERE id = ${shift[0].id};
    INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift Cancelled','Staff Cancelled the shift',${shift[0].individual_id},CURRENT_TIMESTAMP);
    INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift Cancelled','You Cancelled the shift',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);
    DELETE FROM individual_schedule WHERE name = ${shift[0].id};`
    ,(err,response,fields) =>{
        if(!err){ 
                sendNotification(shift[0].individual_fcm_token,"Live Shift canceled",`Staff has canceled the live shift ${shift[0].id}.`)
                res.send({status:"shift_cancelled"})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
}

app.post("/individual_shift/report",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const reason = req.query.reason

    const result = validation_schema.report_individual_shift.validate({reason})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
  
    pool.query(`
    SELECT *,
    (SELECT mileage FROM staff_applyshifts WHERE staff_applyshifts.staff_id LIKE individual_shifts.staff_hired_id AND staff_applyshifts.shift_id = individual_shifts.id) as mileage,
    (SELECT fcm_token FROM individuals WHERE id = individual_shifts.individual_id) as individual_fcm_token
    FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,shift,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(!shift[0]){
            res.status(500).send({
                message:"there's no active shift"
            })
        }

        if(!shift[0].shift_starts){
            res.status(409).send({message:"You cant report before clockin"})
            return
        }

        pool.query(`
        INSERT IGNORE INTO reports_individual_shifts(shift_id,reason) values(${shift[0].id},'${reason.replace("'","''")}');
        UPDATE individual_shifts SET shift_cancelled = true,shift_reported = true, reported_time = CURRENT_TIMESTAMP, cancelled_reason = 'Staff reported shift'  WHERE id = ${shift[0].id};
        INSERT INTO individuals_notifications(title,body,individual_id,date) values('Live Shift holded','Staff reported the shift ${shift[0].id}.','${shift[0].individual_id}',CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Live Shift holded','You reported the shift ${shift[0].id}','${shift[0].staff_hired_id}',CURRENT_TIMESTAMP);
        DELETE FROM individual_schedule WHERE name = ${shift[0].id};
        `,(err,rows,fields) =>{
            if(!err){  
                sendNotification(shift[0].individual_fcm_token,"Live Shift holded",`Staff has reported the live shift ${shift[0].id}.`)
                res.send({
                    message: "success"
                })
            }else{
                res.status(500).send({
                    message: err.sqlMessage
                })
            }
        })

    })

})

//FACILITY SIDE 
app.get("/facility_shifts/booked",verifyTokenAndPermission(['staff']),(req,res)=>{

    const lat = req.query.lat
    const long = req.query.long
    const date = req.query.date
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.nearbyFacilityShiftsSchema.validate({date,lat,long,time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    var machine_timezone = new Date().toString().match(/([-\+][0-9]+)\s/)[1]
    var len = machine_timezone.length;
    machine_timezone = machine_timezone.substring(0, len-2) + ":" + machine_timezone.substring(len-2);

    pool.query(`
    SELECT * ,
    DISTANCE_BETWEEN(facility_shifts.lat,facility_shifts.lng,${lat},${long}) as distance_miles,
    (SELECT json_object('id',facilites.id,'facility_name',facilites.facility_name,'phone',facilites.phone)  
    FROM facilites WHERE id = facility_shifts.facility_id) as facility
    FROM facility_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')
    AND DATE_FORMAT(CONVERT_TZ(start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}'
    HAVING shift_finished = false AND shift_cancelled = false AND staff_hired_id is not null ORDER BY start_time asc; 
    `,(err,rows,fields) =>{
        if(!err){  
            if(rows.length){
                rows = rows.map(({invoice_rate,finished_price_facility, ...row}) => (
                    row.facility = JSON.parse(row.facility),
                    row.shift_starts = ((row.shift_starts == 0) ? false : true),
                    row.shift_finished = ((row.shift_finished == 0) ? false : true),
                    row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                    row.payment_status = ((row.payment_status == 0) ? false : true),
                    row.finished_price = row.finished_price_staff,
                    row.invoice_rate = row.invoice_rate_staff,
                    row.role = ((row.role == 'HomeCare Aide')? 'CNA': row.role),
                    row.start_time = moment(row.start_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                    row.end_time = moment(row.end_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                    row.requested_time = moment(row.requested_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                    row.clockin_time = ((!row.clockin_time)? row.clockin_time: moment(row.clockin_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.clockout_time = ((!row.clockout_time)? row.clockout_time: moment(row.clockout_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.booked_time = ((!row.booked_time)? row.booked_time: moment(row.booked_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.reported_time = ((!row.reported_time)? row.reported_time: moment(row.reported_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.canceled_time =((!row.canceled_time)? row.canceled_time: moment(row.canceled_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
                    row)) 

                    rows = rows.map(({invoice_rate_staff,finished_price_staff, ...row}) => (row)) 


                res.send(rows)
            }else{
                res.send(rows)
            }  
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
    
})

app.get("/facility_shifts/nearby-shifts",verifyTokenAndPermission(["staff"]),(req,res)=>{
 
    const date = req.query.date
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.dateSchema.validate({date,time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
    
    var machine_timezone = new Date().toString().match(/([-\+][0-9]+)\s/)[1]
    var len = machine_timezone.length;
    machine_timezone = machine_timezone.substring(0, len-2) + ":" + machine_timezone.substring(len-2);

    pool.query(`   
    select *,

    (SELECT count(id) FROM facility_shifts as bf_shift Where 
    CASE WHEN 
    CASE WHEN facility_shifts.start_time between bf_shift.start_time and bf_shift.end_time THEN true ELSE false end
    or 
    CASE WHEN facility_shifts.end_time between bf_shift.start_time and bf_shift.end_time THEN true ELSE false end 
    or
    CASE WHEN bf_shift.start_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    or
    CASE WHEN bf_shift.end_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    THEN true
    ELSE false END = true
    and bf_shift.shift_finished = false AND bf_shift.shift_cancelled = false AND bf_shift.staff_hired_id = (SELECT id FROM staff WHERE phone = '${req.user.phone}')) AS booked_facility_shifts,

    (SELECT count(id) FROM individual_shifts as bi_shifts Where 
    CASE WHEN 
    CASE WHEN facility_shifts.start_time between bi_shifts.start_time and bi_shifts.end_time THEN true ELSE false end
    or
    CASE WHEN facility_shifts.end_time between bi_shifts.start_time and bi_shifts.end_time THEN true ELSE false end 
    or
    CASE WHEN bi_shifts.start_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    or
    CASE WHEN bi_shifts.end_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end 
    THEN true
    ELSE false END = true
    and bi_shifts.shift_finished = false AND bi_shifts.shift_cancelled = false AND bi_shifts.staff_hired_id = (SELECT id FROM staff WHERE phone = '${req.user.phone}')) AS booked_individual_shifts,

    DISTANCE_BETWEEN(facility_shifts.lat,facility_shifts.lng,(SELECT lat FROM staff WHERE phone = '${req.user.phone}'),(SELECT lng FROM staff WHERE phone = '${req.user.phone}')) as distance_miles,
    (SELECT json_object('facility_name',facilites.facility_name,'phone',facilites.phone)  
    FROM facilites WHERE id = facility_shifts.facility_id) as facility
    from facility_shifts
    WHERE     
    facility_shifts.staff_hired_id  IS NULL AND shift_finished = false AND shift_cancelled = false AND
    role LIKE (SELECT role FROM staff WHERE phone = '${req.user.phone}') AND DATE_FORMAT(CONVERT_TZ(facility_shifts.start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}' 
    having distance_miles <= ${MAXIMUM_MILES} and booked_facility_shifts = 0 and booked_individual_shifts = 0
    order by distance_miles asc , facility_shifts.start_time asc;`,(err,rows,fields) =>{
        if(!err){ 
            if(rows.length){
                rows = rows.map(({invoice_rate,finished_price_facility,booked_individual_shifts,booked_facility_shifts, ...row}) => (
                    row.facility = JSON.parse(row.facility),
                    row.shift_starts = ((row.shift_starts == 0) ? false : true),
                    row.shift_finished = ((row.shift_finished == 0) ? false : true),
                    row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                    row.payment_status = ((row.payment_status == 0) ? false : true),
                    row.finished_price = row.finished_price_staff,
                    row.invoice_rate = row.invoice_rate_staff,
                    row.role = ((row.role == 'HomeCare Aide')? 'CNA': row.role),
                    row.start_time = moment(row.start_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                    row.end_time = moment(row.end_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                    row.requested_time = moment(row.requested_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                    row.clockin_time = ((!row.clockin_time)? row.clockin_time: moment(row.clockin_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.clockout_time = ((!row.clockout_time)? row.clockout_time: moment(row.clockout_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.booked_time = ((!row.booked_time)? row.booked_time: moment(row.booked_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.reported_time = ((!row.reported_time)? row.reported_time: moment(row.reported_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.canceled_time =((!row.canceled_time)? row.canceled_time: moment(row.canceled_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                    row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
                    row)) 

                    rows = rows.map(({invoice_rate_staff,finished_price_staff, ...row}) => (row)) 

                    const resultt = rows.filter(
                        (value, index) => index === rows.findIndex(
                          other => 
                          value.invoice_rate_staff == other.invoice_rate_staff &&
                          value.facility_id === other.facility_id && 
                          value.hours === other.hours && 
                          value.floor === other.floor &&
                          value.lat === other.lat && 
                          value.lng === other.lng &&
                          value.role === other.role &&  
                          value.start_time === other.start_time &&  
                          value.end_time === other.end_time
                        ));

                res.send(resultt)
            }else{
                res.send(rows)
            }  
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    }) 

})

app.post("/facility_shifts/book",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const shift_id = req.query.shift_id

    const result = validation_schema.shiftIdSchema.validate({shift_id})

    if(result.error){
        res.status(400).send(result.error.details[0].message)
        return
    }

    pool.query(`
    SELECT facility_shifts.id as shift_id, facility_shifts.facility_id , facility_shifts.start_time, facility_shifts.end_time,

    (SELECT count(id) FROM facility_shifts as bf_shift Where 
    CASE WHEN 
    CASE WHEN facility_shifts.start_time between bf_shift.start_time and bf_shift.end_time THEN true ELSE false end
    or 
    CASE WHEN facility_shifts.end_time between bf_shift.start_time and bf_shift.end_time THEN true ELSE false end 
    or
    CASE WHEN bf_shift.start_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    or
    CASE WHEN bf_shift.end_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    THEN true
    ELSE false END = true
    and bf_shift.shift_finished = false AND bf_shift.shift_cancelled = false AND bf_shift.staff_hired_id = (SELECT id FROM staff WHERE phone = '${req.user.phone}')) AS booked_facility_shifts,

    (SELECT count(id) FROM individual_shifts as bi_shifts Where 
    CASE WHEN 
    CASE WHEN facility_shifts.start_time between bi_shifts.start_time and bi_shifts.end_time THEN true ELSE false end
    or
    CASE WHEN facility_shifts.end_time between bi_shifts.start_time and bi_shifts.end_time THEN true ELSE false end 
    or
    CASE WHEN bi_shifts.start_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    or
    CASE WHEN bi_shifts.end_time between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end 
    THEN true
    ELSE false END = true
    and bi_shifts.shift_finished = false AND bi_shifts.shift_cancelled = false AND bi_shifts.staff_hired_id = (SELECT id FROM staff WHERE phone = '${req.user.phone}')) AS booked_individual_shifts,

    (SELECT CURRENT_TIMESTAMP >= date_add(facility_shifts.start_time,INTERVAL 15 minute)) as is_time_past,

    (SELECT CURRENT_TIMESTAMP >= date_sub(facility_shifts.start_time,INTERVAL 15 minute)) as is_need_extend,

    (SELECT DISTANCE_BETWEEN(facility_shifts.lat,facility_shifts.lng,(SELECT lat FROM staff WHERE phone = '${req.user.phone}'),(SELECT lng FROM staff WHERE phone = '${req.user.phone}'))) as shift_distance,
    (SELECT id from staff WHERE phone LIKE '${req.user.phone}') as user_staff_id, 
    (SELECT facilites.fcm_token FROM facilites WHERE id = facility_shifts.facility_id) as facility_fcm_token,
    (SELECT staff.first_name FROM staff WHERE id = user_staff_id) as staff_first_name,
    (SELECT staff.last_name FROM staff WHERE id = user_staff_id) as staff_last_name,
    (SELECT staff.account_approved FROM staff WHERE id = user_staff_id) as staff_account_approved,
    (SELECT stripe_account FROM staff_requirements WHERE staff_id = user_staff_id) as stripe_account
    FROM facility_shifts WHERE id = ${shift_id} AND facility_shifts.staff_hired_id IS NULL;
    `,(err,response,fields) =>{

        if(err){
            console.log(err)
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(!response[0]){
            res.status(404).send({message:"There's a staff booked or it doesn't exists anymore"})
            return
        }

        if(!response[0].user_staff_id){
            //staff Not Exists
            res.status(404).send({
                message: 'staff Not Exists, wrong id'
                });
            return
        }

        if(response[0].is_time_past){
            res.status(409).send({message:"Can't book this shift, start time in past"})
            return
        }

        if(response[0].booked_facility_shifts != 0){
            res.status(409).send({message:"You already booked shift at this time"})
            return
        }

        if(response[0].booked_individual_shifts != 0){
            res.status(409).send({message:"You already have HomeCare shift at this time"})
            return
        }

        if(response[0].staff_account_approved == 0){
            res.status(404).send({
                message: 'Your account not approved'
                });
            return
        }

        if(!response[0].stripe_account){
            res.status(404).send({
                message: 'Create Payment account first'
                });
            return
        }

        if(!response[0].staff_first_name || !response[0].staff_last_name){
            res.status(409).send({
                message: 'Add your name first from profile section'
                });
            return
        }

        if(response[0].shift_distance > MAXIMUM_MILES){
            res.status(409).send({
                message: 'This shift is far away +35 mile'
                });
            return
        }

        pool.query(`
        UPDATE facility_shifts SET 
        staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') ,
        start_time = CASE WHEN ${response[0].is_need_extend} THEN date_add(facility_shifts.start_time,INTERVAL 30 minute) ELSE start_time END,
        end_time = CASE WHEN ${response[0].is_need_extend} THEN date_add(facility_shifts.end_time,INTERVAL 30 minute) ELSE end_time END,
        booked_time = CURRENT_TIMESTAMP
        WHERE id = ${shift_id};
       
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Staff booked',
        CASE WHEN ${response[0].is_need_extend} THEN 'There''s a staff booked your shift #${shift_id} and the shift extend 30 minutes.' ELSE 'There''s a staff booked your shift #${shift_id}' END ,${response[0].facility_id},CURRENT_TIMESTAMP);
       
        UPDATE facility_schedule SET 
        start_time = CASE WHEN ${response[0].is_need_extend} THEN date_add('${response[0].start_time}',INTERVAL 45 minute) ELSE start_time END,
        end_time = CASE WHEN ${response[0].is_need_extend} THEN date_add('${response[0].end_time}',INTERVAL 45 minute) ELSE end_time END
        WHERE name = ${shift_id};
        `
        ,(err,result,fields) =>{
            if(err){
                res.status(500).send({message:err.sqlMessage})
               return
            }
      
            if(response[0].is_need_extend){
                scheduleFacilityShift(
                    response[0].facility_id,
                    response[0].shift_id,
                    moment(response[0].start_time).add(45,'m').format('YYYY-MM-DD HH:mm:ss'), //Normal extra 30 minutes + 15 minutes for automatically schedualds
                    moment(response[0].end_time).add(45,'m').format('YYYY-MM-DD HH:mm:ss'))

                sendNotification(response[0].facility_fcm_token,`Staff booked`,`The shift #${shift_id} is booked and extended 30 minutes`)
            }else{
                sendNotification(response[0].facility_fcm_token,`Staff booked`,`There's a staff booked your shift #${shift_id}`)
            }
            res.send({'status':'success'})
        })
        
    })

})

app.post("/facility_shifts/clockin",verifyTokenAndPermission(["staff"]),(req,res)=>{
    const lat = req.query.lat
    const long = req.query.long
    const shift_id =  req.query.shift_id

    const result = validation_schema.clockinFacilitySchema.validate({lat,long,shift_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * , 
    (SELECT DISTANCE_BETWEEN(facility_shifts.lat,facility_shifts.lng,${lat},${long})) as distance_miles,
    (SELECT TIMESTAMPDIFF(MINUTE,CURRENT_TIMESTAMP,facility_shifts.start_time)) as difference_time,
    (SELECT facilites.fcm_token FROM facilites WHERE id LIKE facility_shifts.facility_id) as facility_fcm_token
    FROM facility_shifts WHERE id = ${shift_id} AND staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false`
    ,(err,response,fields) =>{
        if(!err){ 

            if(!response[0]){
                res.status(404).send({
                    message: `There's no active shift to start`
                    });
                return
            }

            if(response[0].shift_finished == 1){
                res.status(409).send({
                    message: `You already clocked out`
                    });
                    return
            }

            if(response[0].shift_starts == 1){
                res.status(409).send({
                    message: `You already clocked in`
                    });
                    return
            }

            if(response[0].distance_miles > 0.1){
                res.status(404).send({
                    message: `You didn't arrive yet, ${response[0].distance_miles} miles left`
                    });
                    return
            }

            if(response[0].difference_time >= 15){ // && response[0].difference_time <= -15
                res.status(404).send({
                    message: `Your shift has not yet started. Please wait..`
                    });
                    return
            }

            pool.query(`
            UPDATE facility_shifts SET shift_starts = true,clockin_time = CURRENT_TIMESTAMP WHERE id = ${shift_id};
            INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift_id} started','The staff had started shift #${shift_id}',${response[0].facility_id},CURRENT_TIMESTAMP);`
            ,(err,responseStart,fields) =>{
                if(!err){ 
                        sendNotification(response[0].facility_fcm_token,`Shift #${shift_id} started`,`The staff had started shift #${shift_id}`)
                        res.send({status:"success"})
                }else{
                    res.status(500).send({message:err.sqlMessage})
                }
            })
                
        }else{
            res.status(500).send({message:err.sqlMessage})
        }

    })

    

})

app.post("/facility_shifts/clockout",verifyTokenAndPermission(["staff"]),(req,res)=>{


    const body = req.body

    const result = validation_schema.clockOutFacilitySchema.validate(body)

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    const privous_saturday = moment().day(moment().day() > 6 ? 6 :-1).format('YYYY-MM-DD')
    const next_friday = moment(privous_saturday).add(6,'day').format('YYYY-MM-DD')

    pool.query(`
    SELECT *,
    (SELECT json_object('first_name',staff.first_name,'last_name',staff.last_name) FROM staff WHERE id = facility_shifts.staff_hired_id) as staff,
    (SELECT json_object('admin_name',facilites.admin_name,'facility_name',facilites.facility_name,'admin_title',facilites.admin_title) FROM facilites WHERE id = facility_shifts.facility_id) as facility,
    (DISTANCE_BETWEEN(facility_shifts.lat,facility_shifts.lng,${body.lat},${body.long})) as staff_distance_miles,
    TIMESTAMPDIFF(MINUTE,CURRENT_TIMESTAMP,facility_shifts.start_time) as difference_time,
    TIMESTAMPDIFF(MINUTE,facility_shifts.clockin_time,CURRENT_TIMESTAMP) as worked_time,
    (SELECT sum(worked_minutes) FROM facility_shifts as fshift WHERE fshift.staff_hired_id = facility_shifts.staff_hired_id AND shift_finished = true AND fshift.facility_id = facility_shifts.facility_id AND fshift.start_time BETWEEN '${privous_saturday}' AND '${next_friday}') / 60 as worked_hours_facility,
    (SELECT facilites.fcm_token FROM facilites WHERE id LIKE facility_shifts.facility_id) as facility_fcm_token,
    (SELECT staff_requirements.stripe_account FROM staff_requirements WHERE staff_id LIKE facility_shifts.staff_hired_id) as stripe_account,
    CALCULATE_FACILITY_INVOICE(facility_shifts.clockin_time,(CASE WHEN CURRENT_TIMESTAMP >= date_add(facility_shifts.end_time,INTERVAL 15 minute) THEN date_add(DATE_FORMAT(facility_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute) else CURRENT_TIMESTAMP END),facility_shifts.invoice_rate_staff) as total_price_staff,
    CALCULATE_FACILITY_INVOICE(facility_shifts.clockin_time,(CASE WHEN CURRENT_TIMESTAMP >= date_add(facility_shifts.end_time,INTERVAL 15 minute) THEN date_add(DATE_FORMAT(facility_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute) else CURRENT_TIMESTAMP END),facility_shifts.invoice_rate) as total_price_facility,
    (CASE WHEN CURRENT_TIMESTAMP >= date_add(facility_shifts.end_time,INTERVAL 15 minute) THEN date_add(DATE_FORMAT(facility_shifts.end_time, '%Y-%m-%d %T'),INTERVAL 15 minute) else CURRENT_TIMESTAMP END) as clockout_calculated_time
    FROM facility_shifts WHERE id = ${body.shift_id} AND staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false AND shift_starts = true;`
    ,(err,response,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return   
        }

        if(!response[0]){
            res.status(404).send({
                message: `Wrong Shift id or you didn't started the shift yet`
                });
                return
         
        }

        if(response[0].shift_finished == 1){
            res.status(409).send({
                message: `You already clocked out`
                });
                return
        }

        if(response[0].shift_starts == 0){
            res.status(409).send({
                message: `Clock in first`
                });
                return
        }

        if(response[0].difference_time >= 0){
            res.status(404).send({
                message: `You didn't worked yet!`
                });
                return
        }

        if(response[0].staff_distance_miles > 0.1){
            res.status(404).send({
                message: `Get close and let client clockout with signature, ${response[0].staff_distance_miles} miles left`
                });
                return
        }
        
        finishShiftFacility(res,response,overtime.calculateOvertime(response),body.signature_base64)

    })

})


function finishShiftFacility(res,response,calculate_overtime,signature_base64){
    const facility = JSON.parse(response[0].facility)  
    const staff = JSON.parse(response[0].staff) 

    pool.query(`
    UPDATE facility_shifts SET overtime_hours = ${calculate_overtime.overtime_hours} , overtime_rate = ${calculate_overtime.overtime_rate}, overtime_staff_rate = ${calculate_overtime.overtime_staff_rate}, double_hours = ${calculate_overtime.double_hours}, double_rate = ${calculate_overtime.double_rate} , double_staff_rate = ${calculate_overtime.double_staff_rate} , clockout_signature = '${response[0].id}sheet.pdf' , shift_finished = true, clockout_time = '${response[0].clockout_calculated_time}', finished_price_facility = ${calculate_overtime.total_price_facility_overide},finished_price_staff = ${calculate_overtime.total_price_staff_overide},worked_minutes = ${response[0].worked_time}, is_overtime_hours = ${calculate_overtime.is_overtime_hours} WHERE id = ${response[0].id};
    UPDATE invoices SET amount = amount + ${calculate_overtime.total_price_facility_overide} WHERE id = ${response[0].invoice_id};
    INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${response[0].id} Compeleted','The staff finshed shift #${response[0].id}',${response[0].facility_id},CURRENT_TIMESTAMP);
    DELETE FROM facility_schedule WHERE name = ${response[0].id};`
    ,(err,responseFinish,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        timesheet.addSignSheetToShift({
            shift_id:response[0].id,
            employee_signature:signature_base64,
            facility_name:facility.facility_name,
            start_time:moment(response[0].start_time).utcOffset(response[0].time_zone),
            floor:response[0].floor,
            role:((response[0].role == 'HomeCare Aide')? 'CNA': response[0].role),
            staff_first_name:staff.first_name,
            staff_last_name:staff.last_name,
            clockin_time:moment(response[0].clockin_time).utcOffset(response[0].time_zone) ,
            clockout_time:moment(response[0].clockout_calculated_time).utcOffset(response[0].time_zone),
            admin_name:facility.admin_name,
            admin_title:facility.admin_title,
            auto_clockout:false
        },success=>{
            sendNotification(response[0].facility_fcm_token,`Shift #${response[0].id} Completed`,`The staff has completed shift #${response[0].id}`)
            res.send({status:"success"})
        })

    })
}

app.get("/facility_shifts/history",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const date = req.query.date
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.dateSchema.validate({date,time_zone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    var machine_timezone = new Date().toString().match(/([-\+][0-9]+)\s/)[1]
    var len = machine_timezone.length;
    machine_timezone = machine_timezone.substring(0, len-2) + ":" + machine_timezone.substring(len-2);

    pool.query(`
    SELECT * ,
    (SELECT json_object('id',facilites.id,'facility_name',facilites.facility_name,'phone',facilites.phone)  
    FROM facilites WHERE id = facility_shifts.facility_id) as facility
    FROM facility_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}')
    AND DATE_FORMAT(CONVERT_TZ(start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}'
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
                row.start_time = moment(row.start_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.end_time = moment(row.end_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.requested_time = moment(row.requested_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
                row.clockin_time = ((!row.clockin_time)? row.clockin_time: moment(row.clockin_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.clockout_time = ((!row.clockout_time)? row.clockout_time: moment(row.clockout_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.booked_time = ((!row.booked_time)? row.booked_time: moment(row.booked_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.reported_time = ((!row.reported_time)? row.reported_time: moment(row.reported_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.canceled_time =((!row.canceled_time)? row.canceled_time: moment(row.canceled_time).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")) ,
                row.shift_status = ((row.shift_reported == 0)? ((row.shift_cancelled == 0)? ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ) : "canceled" ) : "reported"),
                row)) 

                rows = rows.map(({invoice_rate_staff,finished_price_staff, ...row}) => (row)) 

            res.send(rows)
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
  
})

app.post("/facility_shifts/cancel",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const shift_id  = req.query.shift_id
    const result = validation_schema.shiftIdSchema.validate({shift_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT *, 
    (SELECT fcm_token FROM facilites WHERE id = facility_shifts.facility_id) as facility_fcm_token
    FROM facility_shifts WHERE id = ${shift_id} AND staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false; 
    `,(err,shift,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return   
        }

        if(!shift[0]){
            res.status(404).send({message:"There's no booked shift to cancel"})
            return
        }

        if(shift[0].shift_starts){
            res.status(409).send({
                message: "You cant cancel after clock-in"
             });
            return
        }
 
        pool.query(`
        UPDATE facility_shifts SET staff_hired_id = null WHERE id = ${shift[0].id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift_id} Cancelled','Staff Cancelled shift #${shift_id}',${shift[0].facility_id},CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${shift_id} Cancelled','You Cancelled shift #${shift_id}',${shift[0].staff_hired_id},CURRENT_TIMESTAMP);`
        ,(err,response,fields) =>{
            if(err){ 
                res.status(500).send({message:err.sqlMessage})
                return
            }
            sendNotification(shift[0].facility_fcm_token,`Shift #${shift_id} canceled`,`Staff has canceled shift #${shift_id}`)
            res.send({status:"shift_cancelled"})
        })
    })

})

app.post("/facility_shifts/report/",verifyTokenAndPermission(["staff"]),(req,res)=>{

    const reason = req.query.reason
    const shift_id = req.query.shift_id

    const result = validation_schema.report_facility_shift.validate({reason,shift_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
  
    pool.query(`
    SELECT *, 
    (SELECT fcm_token FROM facilites WHERE id = facility_shifts.facility_id) as facility_fcm_token
    FROM facility_shifts WHERE id = ${shift_id} AND staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,shift,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(!shift[0]){
            res.status(404).send({
                message:"This shift not active"
            })
         return
        }

        if(!shift[0].shift_starts){
            res.status(409).send({
                message:"You cant report before clock-in"
            })
        }

        pool.query(`
        INSERT IGNORE INTO reports_facility_shifts(shift_id,reason) values(${shift[0].id},'${reason.replace("'","''")}');
        UPDATE facility_shifts SET shift_cancelled = true,shift_reported = true, reported_time = CURRENT_TIMESTAMP, cancelled_reason = 'Staff reported shift' WHERE id = ${shift[0].id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} holded','Staff reported the shift.','${shift[0].facility_id}',CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${shift[0].id} holded','You reported the shift','${shift[0].staff_hired_id}',CURRENT_TIMESTAMP);
        DELETE FROM facility_schedule WHERE name = ${shift[0].id};
        `,(err,rows,fields) =>{
            if(err){  
                res.status(500).send({message: err.sqlMessage})
                return
            }
            sendNotification(shift[0].facility_fcm_token,"Shift reported",`Staff reported shift #${shift[0].id}.`)
            res.send({message: "success"})
        })
    })

})

module.exports = app;
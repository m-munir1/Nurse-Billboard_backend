const express = require("express");
const app = express.Router();
const pool = require("../../../connection");
const {verifyTokenAndPermission} = require("../../../helpers/jwt_helper");
const validation_schema = require('../../../helpers/validation_schema/client/facility_schema');
var moment = require('moment');
const stripe = require('../../../helpers/stripe_helper')
const {scheduleFacilityShift} = require("../../../helpers/scheduleShifts")
const invoices_schedule = require("../../../helpers/scheduleInvoices")
const notification = require('../../../helpers/notifications')
var PDFLib = require('pdf-lib') 
const twilio = require("../../../helpers/twilio");
const fs = require('fs') 
const minimum_price = require("../../../helpers/minimum_price");
require("dotenv").config();
const emails = require("../../../helpers/emaills")
const NURSEBILLBOARD_EMAIL = process.env.NURSEBILLBOARD_EMAIL;
const MAXIMUM_MILES = process.env.MAXIMUM_MILES;

const run = async ({ pathToPDF, pathToUserSignature, pathToWillSignature, body ,req, res, payment_method}) => {

    //Read Files
    const pdfDoc = await PDFLib.PDFDocument.load(fs.readFileSync(pathToPDF));
    const userSignature = await pdfDoc.embedPng(fs.readFileSync(pathToUserSignature));
    const willSignature = await pdfDoc.embedPng(fs.readFileSync(pathToWillSignature));
    addFieldds(pdfDoc,body)
    //adding signture to pdf pages
    for (let i = 0; i < pdfDoc.getPageCount();) {

        //We need to add the signture on page 0 and 3 and 5 only
        if(i != 1 && i != 2 && i != 4){
            const page = pdfDoc.getPage(i);
            page.drawImage(userSignature, {
                x: 60, 
                y: ((i == 3)? 170 : ((i == 5)? 190 : 205)), //every page has different Y position
                width: 100, //Image must be static 100 width, 50 height
                height: 50
                });

            page.drawImage(willSignature, {
                x: 60, 
                y: ((i == 3)? 100 : ((i == 5)? 128 : 140)), //every page has different Y position
                width: 100, //Image must be static 100 width, 50 height
                height: 50
                });
        }
        i++
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFile(`contracts/${req.user.phone}contract.pdf`,pdfBytes, function (error) {
        fs.unlinkSync(pathToUserSignature)
        if(error){
            console.log("error")
            return
        }

        if(body.invoice_option == 1){
            pool.query(`SELECT connected_customer_account,invoice_option FROM facilites WHERE phone LIKE '${req.user.phone}'`,(err,rows,fields) =>{
                if(err){  
                    res.status(500).send({message: err.sqlMessage})
                    return
                }
        
                if(rows[0].connected_customer_account){
                    createPaymentMethod(res,payment_method,req,res,rows[0].connected_customer_account,body)
                }else{
                    stripe.customer(error=>{
                        res.status(error.err.statusCode).send({message:error.err.raw.message})
                    },
                    response=>{
                        createPaymentMethod(res,payment_method,req,res,response.id,body)
                    })
                }
            })
            return
        }  

        facilityContract(body,req,res,undefined,undefined)
    })

}

function addFieldds(filledPdfDoc,body) {

    const form = filledPdfDoc.getForm();
        const fields = form.getFields();
        fields.forEach(field => {
            if (field instanceof PDFLib.PDFCheckBox) {
                field.check()
            }
            if (field instanceof PDFLib.PDFTextField) {
                field.getName() === 'a1' && field.setText(`  ${moment().format("DD").toString()}`);
                field.getName() === 'a2' && field.setText(`  ${moment().format("MMM").toString()}`);
                field.getName() === 'a3' && field.setText(`  ${moment().format("YYYY").toString()}`);
                field.getName() === 'a4' && field.setText(`  ${body.company_name}`);
                field.getName() === 'a5' && field.setText(`  ${body.state}`);
                field.getName() === 'a6' && field.setText(`  ${body.address}`);
                (field.getName() === 'a13' || field.getName() === 'a19' || field.getName() === 'a29') && field.setText(`Wynalda Tataw, VP`);
                (field.getName() === 'a7' || field.getName() === 'a8') && field.setText(`  ${body.facility_name}`);
                (field.getName() === 'a10' || field.getName() === 'a16' || field.getName() === 'a26') && field.setText(`  ${body.admin_name}, ${body.admin_title}`);
                (field.getName() === 'a11' || field.getName() === 'a14' || field.getName() === 'a17' || field.getName() === 'a20' || field.getName() === 'a27' || field.getName() === 'a30') && field.setText(`  ${moment().format("DD/MM/YYYY")}`);
            }

            field.enableReadOnly();
        });
        form.flatten();
}

app.post("/contract",verifyTokenAndPermission(['facility']),(req,res)=>{
    const body = req.body
    const phone = req.user.phone
    var payment_method = {}

    const result = validation_schema.contractSchema.validate(body)

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(body.lat || body.long || body.address || body.city || body.country || body.state){

        if(!body.lat || !body.long || !body.address || !body.city || !body.country || !body.state){
            res.status(400).send({message: 'missing Latidude and longitude, Choose location from drop list'});
            return
        }
    }

    if(body.invoices_days){
        const diffrence = body.invoices_days.invoice_day_two - body.invoices_days.invoice_day_one

        if(body.invoices_days.invoice_day_one == body.invoices_days.invoice_day_two || diffrence < 4){
            res.status(400).send({message: `Must be atleast 4 days between two invoice days`});
            return
        }
    }
    

    if(body.invoice_option == 1){
        if(body.payment_method.payment_type == "us_bank_account"){
            payment_method = {
                type: body.payment_method.payment_type,
                billing_details:{
                    name:body.payment_method.billing_name
                },
                us_bank_account:body.payment_method.us_bank_account
            }
        }else if(body.payment_method.payment_type == "card"){
            payment_method = {
                        type: body.payment_method.payment_type,
                        billing_details:{
                            name:body.payment_method.billing_name
                        },
                        card: body.payment_method.card
                    }
        }else{
            res.status(400).send({
                message: "Please Provide payment_type"
             });
            return
        }
    }

    const imgConverted = body.signature_base64.replace("data:image/png;base64,","")

    fs.writeFile(`contracts/${phone}signature.png`, imgConverted, 'base64',function (error) {
        if(error){
            console.log(error)
            return
        }
        run({ pathToPDF:"assets/contract.pdf", pathToUserSignature:`contracts/${phone}signature.png`,pathToWillSignature:"assets/signature.png", body ,req, res, payment_method}).catch(console.error);
    });

})

function facilityContract(body,req,res,cus_id,pm_response){

    pool.query(`
    UPDATE facilites SET 
    facility_name = case when '${body.facility_name}' != 'undefined' or not null then '${body.facility_name}' else facility_name end,
    lat = case when '${body.lat}' != 'undefined' or not null then '${body.lat}' else lat end, 
    lng = case when '${body.long}' != 'undefined' or not null then '${body.long}' else lng end, 
    address = case when '${body.address}' != 'undefined' or not null then '${body.address}' else address end, 
    city = case when '${body.city}' != 'undefined' or not null then '${body.city}' else city end,
    country = case when '${body.country}' != 'undefined' or not null then '${body.country}' else country end,
    postal_code = case when '${body.postal_code}' != 'undefined' or not null then '${body.postal_code}' else postal_code end, 
    state = case when '${body.state}' != 'undefined' or not null then '${body.state}' else state end,
    contract_pdf = case when '${req.user.phone}contract.pdf' != 'undefined' or not null then '${req.user.phone}contract.pdf' else contract_pdf end,
    invoice_option = case when '${body.invoice_option}' != 'undefined' or not null then '${body.invoice_option}' else invoice_option end,
    connected_customer_account =  case when '${cus_id}' != 'undefined' or not null then '${cus_id}' else connected_customer_account end, 
    auto_pay_method =  case when '${pm_response}' != 'undefined' or not null then '${pm_response}' else auto_pay_method end,
    company_name =  case when '${body.company_name}' != 'undefined' or not null then '${body.company_name}' else company_name end,
    company_email =  case when '${body.company_email}' != 'undefined' or not null then '${body.company_email}' else company_email end,
    admin_name =  case when '${body.admin_name}' != 'undefined' or not null then '${body.admin_name}' else admin_name end,
    admin_title =  case when '${body.admin_title}' != 'undefined' or not null then '${body.admin_title}' else admin_title end,
    invoice_day_one =  case when '${((body.invoices_days)? body.invoices_days.invoice_day_one:undefined)}' != 'undefined' or not null then '${((body.invoices_days)? body.invoices_days.invoice_day_one:undefined)}' else invoice_day_one end,
    invoice_day_two =  case when '${((body.invoices_days)? body.invoices_days.invoice_day_two:undefined)}' != 'undefined' or not null then '${((body.invoices_days)? body.invoices_days.invoice_day_two:undefined)}' else invoice_day_two end
    WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(body.facility_name){
            emails.sendEmail(NURSEBILLBOARD_EMAIL,body.company_email,'Contract Submited','Thank You for signing our service contract. This to notify & confirm that the contract has been submitted and will be approved shortly (within 2 business days). You are one step away from seamless quality staffing. You can now LOGIN to www.nursebillboard.com & also download Nurse Billboard APP to post shifts and manage staffing needs.')
        }

        res.send({status:`successs`})
    })
}

//payment_method_auto_pay
function createPaymentMethod(res,paymentMethod,req,res,cus_id,body){
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
                    facilityContract(body,req,res,cus_id,pm_response.id)
                  
                })
        })
}

// Longitude latidude 
app.put("/account",verifyTokenAndPermission(['facility']),(req,res)=>{
    const company_email = req.query.company_email
    const email = req.query.email
    const facility_name = ((req.query.facility_name)? ((req.query.facility_name.includes("%"))? req.query.facility_name.replace(" ") : req.query.facility_name ) : req.query.facility_name)
    const fcm_token = req.query.fcm_token
    const invoice_option = req.query.invoice_option
    
    const city =  ((req.query.city)? ((req.query.city.includes("%"))? req.query.city.replace(" ") : req.query.city ) : req.query.city) 
    const country = req.query.country
    const postal_code = req.query.postal_code
    const state =  ((req.query.state)? ((req.query.state.includes("%"))? req.query.state.replace(" ") : req.query.state ) : req.query.state) 
    const address = ((req.query.address)? ((req.query.address.includes("%"))? req.query.address.replace(" ") : req.query.address ) : req.query.address) 
    const lat = req.query.lat
    const long = req.query.long

    const result = validation_schema.updateSchema.validate({email,company_email,facility_name,fcm_token,address,lat,long,city,country,postal_code,state})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
  
    if(!email && !facility_name && !fcm_token && !address && !lat && !long){
        res.status(400).send({
            message: 'Missing Info'
            });
        return
    }
  
    if(email){
        if(!email.match(/^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/)){
            res.status(400).send({
                message: 'Wrong email address'
                });
            return
        }
    } 

    if(lat || long || address || city || country || postal_code || state){

        if(!lat || !long || !address || !city || !country || !postal_code || !state){
            res.status(400).send({message: 'missing Latidude and longitude, Choose location from drop list'});
            return
        }
    }

    if(invoice_option){
        if(invoice_option != 1 || invoice_option != 2){
            res.status(400).send({
                message: 'Wrong payment method type'
                });
            return
        }
    }
  
    pool.query(`
    UPDATE facilites SET 
    facility_name =  case when '${facility_name}' != 'undefined' or not null then '${facility_name}' else facility_name end,
    fcm_token =  case when '${fcm_token}' != 'undefined' or not null then '${fcm_token}' else fcm_token end,
    email = case when '${email}' != 'undefined' or not null then '${email}' else email end,
    address = case when '${address}' != 'undefined' or not null then '${address}' else address end,
    city = case when '${city}' != 'undefined' or not null then '${city}' else city end,
    country = case when '${country}' != 'undefined' or not null then '${country}' else country end,
    postal_code = case when '${postal_code}' != 'undefined' or not null then '${postal_code}' else postal_code end,
    state = case when '${state}' != 'undefined' or not null then '${state}' else state end,
    lat = case when '${lat}' != 'undefined' or not null then '${lat}' else lat end,
    lng = case when '${long}' != 'undefined' or not null then '${long}' else lng end,
    company_email = case when '${company_email}' != 'undefined' or not null then '${company_email}' else company_email end
    WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(!err){  
                res.send({status:"successs"})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
       
})

app.get("/account" ,verifyTokenAndPermission(["facility"]),(req,res)=>{

    pool.query(`
    SELECT * FROM facilites WHERE phone LIKE '${req.user.phone}';
    SELECT  SUM(finished_price_facility) as unpaid_pending_invoices FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') AND payment_status = false;
    `,(err,rows,fields) =>{
        if(!err){  
            if(rows.length){
                rows = rows[0].map(({password, ...row}) => (
                    row.account_approved = ((row.account_approved == 0) ? false : true),
                    row.unpaid_pending_invoices = ((rows[1][0].unpaid_pending_invoices) ? rows[1][0].unpaid_pending_invoices  : 0.0 ),
                    row));
                res.send(rows[0])
            }else{
                res.status(404).send({
                    message: "The server has not found facility"
                 });
            }
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    }) 

})

app.get("/dashboard" ,verifyTokenAndPermission(["facility"]),(req,res)=>{

    pool.query(`
    SELECT 
    (SELECT count(id) FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') AND shift_cancelled = true AND 
    (SELECT count(id) FROM invoices WHERE id = facility_shifts.invoice_id AND paid = false AND facility_id = facility_shifts.facility_id AND late_days is null) = 1) as canceled_shifts,

    (SELECT count(id) FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') AND shift_cancelled = false AND staff_hired_id is not null AND 
    (SELECT count(id) FROM invoices WHERE id = facility_shifts.invoice_id AND paid = false AND facility_id = facility_shifts.facility_id AND late_days is null) = 1) as hired_shifts,


    (SELECT count(id) FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') AND shift_cancelled = false AND staff_hired_id is null AND shift_finished = false AND 
    (SELECT count(id) FROM invoices WHERE id = facility_shifts.invoice_id AND paid = false AND facility_id = facility_shifts.facility_id AND late_days is null) = 1) as open_shifts,

    (SELECT TRUNCATE(SUM(amount + late_fees),2) FROM invoices 
    WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}')
    AND DATE_ADD(invoice_due_date, INTERVAL 1 DAY) <= current_date()
    AND paid = false) as invoices_past_due;

    `,(err,rows,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(row => (
            row.canceled_shifts = ((row.canceled_shifts) ? row.canceled_shifts : 0),
            row.hired_shifts = ((row.hired_shifts) ? row.hired_shifts : 0),
            row.open_shifts = ((row.open_shifts) ? row.open_shifts : 0),
            row.invoices_past_due = ((row.invoices_past_due) ? row.invoices_past_due : 0),
            row));

        res.send(rows[0])
    }) 

})

app.post("/shifts/request",verifyTokenAndPermission(['facility']),(req,res)=>{

    const result = validation_schema.shiftSchema.validate(req.body)

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    var time_zone = req.body.time_zone

    if(!time_zone.includes("-")){
        time_zone = time_zone.replace(" ","+")
    }

    if(req.body.invoiceRate < 15){
        res.status(400).send({
            message: "Minimum $15/hr"
         });
        return
    }

    var machine_timezone = new Date().toString().match(/([-\+][0-9]+)\s/)[1]
    var len = machine_timezone.length;
    machine_timezone = machine_timezone.substring(0, len-2) + ":" + machine_timezone.substring(len-2);

    pool.query(`
    SELECT *,
    (SELECT CURRENT_TIMESTAMP >= DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T')) as is_time_past,
    DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T') as start_time,
    date_add(DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T'),INTERVAL ${req.body.hours} hour) as end_time
    FROM facilites WHERE phone LIKE '${req.user.phone}';
    
    SELECT fcm_token,phone
    FROM staff WHERE account_approved = true AND DISTANCE_BETWEEN(lat,lng,(SELECT lat FROM facilites WHERE phone LIKE '${req.user.phone}'),(SELECT lng FROM facilites WHERE phone LIKE '${req.user.phone}')) <= ${MAXIMUM_MILES} and
    (SELECT count(id) FROM individual_shifts WHERE staff_hired_id = id AND shift_finished = false AND shift_cancelled = false) = 0 and
    (SELECT count(id) FROM facility_shifts Where 
    CASE WHEN 
    CASE WHEN DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T') between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end
    or 
    CASE WHEN FROM_UNIXTIME(3600 + 900 * CEIL(UNIX_TIMESTAMP(DATE_ADD(CURRENT_TIMESTAMP,INTERVAL ${req.body.hours} hour)) / 900)) between facility_shifts.start_time and facility_shifts.end_time THEN true ELSE false end 
    or
    CASE WHEN facility_shifts.start_time between DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T') and date_add(DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T'),INTERVAL ${req.body.hours} hour) THEN true ELSE false end
    or
    CASE WHEN facility_shifts.end_time between DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T') and date_add(DATE_FORMAT(CONVERT_TZ('${req.body.date_time}','${time_zone}','${machine_timezone}'), '%Y-%m-%d %T'),INTERVAL ${req.body.hours} hour) THEN true ELSE false end
    THEN true
    ELSE false END = true
    and facility_shifts.shift_finished = false AND facility_shifts.shift_cancelled = false AND facility_shifts.staff_hired_id = staff.id) = 0;

    `,(err,results,fields) =>{
        if(err){
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(results[0][0].account_approved == 0){
            res.status(409).send({
                message: 'Your account not approved'
                });
            return
        }

        if(results[0][0].account_blocked){
            res.status(409).send({
                message: 'Your account blocked, Contact us'
                });
            return
        }

        if(!results[0][0].invoice_option){
            res.status(409).send({
                message: 'Invoice option missing'
                });
            return
        }

        if(!results[0][0].contract_pdf){
            res.status(409).send({
                message: 'Submit contract first'
                });
            return
        }
      
        if(!results[0][0].facility_name){
            res.status(409).send({
                message: 'Facility name missing'
                });
            return
        }
        
        if(results[0][0].is_time_past){
            res.status(400).send({
                message:"You can't choose past time"
                });
            return
        }

   //Long And Lat
        if(!results[0][0].lat || !results[0][0].lng || !results[0][0].city || !results[0][0].country || !results[0][0].state || !results[0][0].postal_code || !results[0][0].address){
            res.status(400).send({
                message: 'Missing Facility address'
                });
            return
        }

        const checkIfMinimum = minimum_price.minimumPrice(results[0][0].city,req.body.invoiceRate,req.body.role)
        if(checkIfMinimum.minimum){
            res.status(400).send({
                message:checkIfMinimum.erorr_message
                });
            return
        }

        var invoice_option = 1
        var invoice_date = ""
        var invoice_due_date = ""

        if(results[0][0].invoice_option == 1){
            //Auto Pay Invoice
            invoice_option = 1
            invoice_date = moment(moment(results[0][0].start_time).format('YYYY-MM-DD')).day(moment().day() >= 6 ? 6 :-1).format('YYYY-MM-DD')
            invoice_due_date = moment(privous_saturday).add(6,'day').format('YYYY-MM-DD')
        }else{
            //Static Pay Invoice
            invoice_option = 2
             
            //10 - 25
            const current_day = moment().format("DD")

            const current_month = moment().format("YYYY-MM")
            const previous_month = moment().subtract(1,'month').format("YYYY-MM")
            const next_month = moment().add(1,'month').format("YYYY-MM")

            if(moment(`${results[0][0].invoice_day_one}`,"DD").subtract(2,"days").format("DD") >= current_day){
                // From 25 previous month to current month 10
                invoice_date = `${previous_month}-${results[0][0].invoice_day_two}`
                invoice_due_date = `${current_month}-${results[0][0].invoice_day_one}`

            }else if(moment(`${results[0][0].invoice_day_two}`,"DD").subtract(2,"days").format("DD") >= current_day){
            
                invoice_date = `${current_month}-${results[0][0].invoice_day_one}`
                invoice_due_date = `${current_month}-${results[0][0].invoice_day_two}`

            }else{
                invoice_date = `${current_month}-${results[0][0].invoice_day_two}`
                invoice_due_date = `${next_month}-${results[0][0].invoice_day_one}`
            }

        }
           

        //DELETE PAST_DATE FROM DATABASE POST_FACILITY_SHIFT
        pool.query(`
        call POST_FACILITY_SHIFT('${invoice_date}','${invoice_due_date}','${invoice_option}',(SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}'),${req.body.needed},'${req.body.role}',${results[0][0].lat}, ${results[0][0].lng},
        ${req.body.invoiceRate},${req.body.floor},${req.body.hours},'${results[0][0].start_time}','${results[0][0].end_time}',
        '${results[0][0].city}','${results[0][0].country}','${results[0][0].state}','${results[0][0].postal_code}','${results[0][0].address}','${time_zone}');
        `,(err,rows,fields) =>{
            if(!err){  
                scheduleShifts(
                    rows[0][0].facility_id,
                    rows[0][0].shift_ids,
                    moment(rows[0][0].start_time).add(15,'m').format('YYYY-MM-DD HH:mm:ss'),
                    moment(rows[0][0].end_time).add(15,'m').format('YYYY-MM-DD HH:mm:ss'))

                scheduleInvoice(rows[0][0].invoice_id,((invoice_option = 1)? true: false),invoice_due_date)

                notifyStaff(results[1],rows[0][0].invoice_rate_staff)
                res.send({status:"successs"})
            }else{
                res.status(500).send({message:err.sqlMessage})
            }
        })

    })
    
})

async function notifyStaff(staffList,invoice_rate_staff) {
    await Promise.all(staffList.map(async (staff) => {
        twilio.sendSms(`Hello, a nearby Facility shift is open now for ${invoice_rate_staff}/hr with Nursebillboard`,staff.phone)
        notification.sendNotification(staff.fcm_token,`Nearby Facility Shift`,`Hello, a nearby Facility shift is open now for ${invoice_rate_staff}/hr with Nursebillboard`)
    }));
}

function scheduleShifts(facility_id,shift_ids,start_time,end_time){

    shift_ids.split("/").forEach(async function (shift_id, index) {
        // ...use `shift_id`...
        scheduleFacilityShift(facility_id,shift_id,start_time,end_time)

      });  

}

function scheduleInvoice(invoice_id,invoice_auto_pay,invoice_due_date) {
    invoices_schedule.scheduleInvoice(invoice_id,invoice_auto_pay,invoice_due_date)
}

app.get("/shifts/opened",verifyTokenAndPermission(['facility']),(req,res)=>{

    const date = req.query.date
    const role = req.query.role
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
    SELECT *
    FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}')
    AND DATE_FORMAT(CONVERT_TZ(start_time,'${machine_timezone}','${time_zone}'), '%Y-%m-%d') = '${date}' AND role = case when '${role}' != 'undefined' or not null then '${role}' else role end
    HAVING shift_finished = false AND shift_cancelled = false AND staff_hired_id is null ORDER BY start_time asc; 
    `,(err,rows,fields) =>{
        if(!err){  

            if(rows.length){
                rows = rows.map(({finished_price_staff,invoice_rate_staff, ...row}) => (
                row.staff = null,
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
                row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
                row));
                rows = rows.map(({finished_price_facility, ...row}) => (row)) 

                res.send(rows)
            }else{
                res.send(rows)
            } 
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
    
})

app.get("/shifts/hired",verifyTokenAndPermission(['facility']),(req,res)=>{

    const date = req.query.date
    const role = req.query.role
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
    (SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role)  
    FROM staff WHERE id = facility_shifts.staff_hired_id) as staff
    FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}')
    AND DATE_FORMAT(CONVERT_TZ(start_time,'${machine_timezone}','${time_zone}'), '%Y-%m-%d') = '${date}' AND role = case when '${role}' != 'undefined' or not null then '${role}' else role end
    HAVING shift_finished = false AND shift_cancelled = false AND staff_hired_id is not null ORDER BY start_time asc; 
    `,(err,rows,fields) =>{
        if(!err){  
            if(rows.length){
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
                row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
                row));

                rows = rows.map(({finished_price_facility, ...row}) => (row)) 

                res.send(rows)
            }else{
                res.send(rows)
            }  
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
    
})

app.get("/shifts/timesheet",verifyTokenAndPermission(['facility']),(req,res)=>{

    const date = req.query.date
    const role = req.query.role
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
    SELECT *,  (SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role)  
    FROM staff WHERE id = facility_shifts.staff_hired_id) as staff
    FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}')
    AND DATE_FORMAT(CONVERT_TZ(start_time,'${machine_timezone}','${time_zone}'),'%Y-%m-%d') = '${date}' AND role = case when '${role}' != 'undefined' or not null then '${role}' else role end
    HAVING shift_finished = true ORDER BY start_time DESC; 
    `,(err,rows,fields) =>{
        if(!err){  
            if(rows.length){
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
                row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
                row));

                rows = rows.map(({finished_price_facility, ...row}) => (row)) 

                res.send(rows)
            }else{
                res.send(rows)
            } 
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
    
})

app.post("/shifts/cancel",verifyTokenAndPermission(['facility']),(req,res)=>{

    const shift_id = req.query.shift_id

    const result = validation_schema.shiftIdSchema.validate({shift_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT *, 
    (SELECT fcm_token FROM staff WHERE id LIKE staff_hired_id) as staff_fcm
    FROM facility_shifts WHERE id = ${shift_id} AND facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
  `,(err,shift,fields) =>{
         if(err){  
             res.status(500).send({message:err.sqlMessage})
             return
         }
 
         if(!shift[0]){
             res.status(404).send({message:"There's no shift, or it already cancelled"})
             return
         }
     
         if(shift[0].shift_starts){
            res.status(409).send({
                message: "You cant cancel after clock-in"
             });
            return
        }

        if(shift[0].staff_hired_id){
            pool.query(`
            UPDATE facility_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP, cancelled_reason = 'Facility cancelled shift' WHERE id = ${shift_id};
            INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} cancelled','You cancelled the shift.','${shift[0].facility_id}',CURRENT_TIMESTAMP);
            INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${shift[0].id} cancelled','Facility cancelled the shift','${shift[0].staff_hired_id}',CURRENT_TIMESTAMP);
            DELETE FROM facility_schedule WHERE name = ${shift_id}; `,(err,rows,fields) =>{
                if(err){  
                    res.status(500).send({message:err.sqlMessage})
                    return
                }
                notification.sendNotification(shift[0].staff_fcm,"Shift cancelled",`Facility cancelled the shift ${shift_id}.`)
                res.send({message:"success"})
            })
        }else{
            pool.query(`
            UPDATE facility_shifts SET shift_cancelled = true, canceled_time = CURRENT_TIMESTAMP, cancelled_reason = 'Facility cancelled shift' WHERE id = ${shift_id};
            INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} cancelled','You cancelled the shift.','${shift[0].facility_id}',CURRENT_TIMESTAMP);
            DELETE FROM facility_schedule WHERE name = ${shift_id}; `,(err,rows,fields) =>{
                if(err){  
                    res.status(500).send({message:err.sqlMessage})
                    return
                }
                res.send({message:"success"})
            })
        }
 
     })
    
})

app.post("/shifts/report/",verifyTokenAndPermission(["facility"]),(req,res)=>{

    const reason = req.query.reason
    const shift_id = req.query.shift_id

    const result = validation_schema.report_shift.validate({reason,shift_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }
  
    pool.query(`
    SELECT *, 
    (SELECT fcm_token FROM staff WHERE id LIKE staff_hired_id) as staff_fcm
    FROM facility_shifts WHERE id = ${shift_id} AND facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') and staff_hired_id is not null HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,shift,fields) =>{
        if(err){  
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(!shift[0]){
            res.status(500).send({
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
        UPDATE facility_shifts SET shift_cancelled = true,shift_reported = true, reported_time = CURRENT_TIMESTAMP, cancelled_reason = 'Facility reported shift' WHERE id = ${shift[0].id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Shift #${shift[0].id} holded','You reported the shift.','${shift[0].facility_id}',CURRENT_TIMESTAMP);
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Shift #${shift[0].id} holded','Facility reported the shift','${shift[0].staff_hired_id}',CURRENT_TIMESTAMP);
        DELETE FROM facility_schedule WHERE name = ${shift[0].id};
        `,(err,rows,fields) =>{
            if(err){  
                res.status(500).send({
                    message: err.sqlMessage
                })
                return
            }
            notification.sendNotification(shift[0].staff_fcm,"Shift reported",`Facility reported shift ${shift[0].id}.`)
            res.send({message: "success"})
        })
    })

})

app.get("/shifts/canceled-reported",verifyTokenAndPermission(['facility']),(req,res)=>{

    const date = req.query.date
    const role = req.query.role
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
    
    pool.query(`
    SELECT * , (SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role)  
    FROM staff WHERE id = facility_shifts.staff_hired_id) as staff
    FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}')
    AND DATE_FORMAT(CONVERT_TZ(start_time,'+00:00','${time_zone}'),'%Y-%m-%d') = '${date}'  AND role = case when '${role}' != 'undefined' or not null then '${role}' else role end
    HAVING shift_cancelled = true ORDER BY start_time DESC; 
    `,(err,rows,fields) =>{
        if(!err){  
            if(rows.length){
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
                row.shift_status = ((row.shift_reported == 0) ? "canceled" : "reported"),
                row));

                

                rows = rows.map(({finished_price_facility, ...row}) => (row)) 

                res.send(rows)
            }else{
                res.send(rows)
            } 
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
    
})

app.get("/shifts/retrieve/:id",verifyTokenAndPermission(['facility']),(req,res)=>{

    const shift_id = req.params.id
    var time_zone = req.query.time_zone

    if(time_zone){
        if(!time_zone.includes("-")){
            time_zone = time_zone.replace(" ","+")
        }
    }

    const result = validation_schema.retrieveshiftSchema.validate({time_zone,shift_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * ,
    (SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role)  
    FROM staff WHERE id = facility_shifts.staff_hired_id) as staff
    FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') AND id = ${shift_id}; 

    SELECT * FROM staff_requirements WHERE staff_id = (SELECT staff_hired_id FROM facility_shifts WHERE id = ${shift_id});
    `,(err,rows,fields) =>{
        if(!err){  
            if(rows.length){
                rows = rows[0].map(({finished_price_staff,invoice_rate_staff, ...row}) => (
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
                row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
                row.time_sheet = ((fs.existsSync(`timesheets/${row.clockout_signature}`))? fs.readFileSync(`timesheets/${row.clockout_signature}`, 'base64') : null),
                row.documents = {
                    nursing_certificate:{
                        name:'Nursing certificate',
                        document:((fs.existsSync(`requirements/${rows[1][0].nursing_certificate}`))? fs.readFileSync(`requirements/${rows[1][0].nursing_certificate}`, 'base64') : null),
                        approved:((rows[1][0].nursing_certificate_approved == 0) ? false : true),
                        pending:((rows[1][0].nursing_certificate && rows[1][0].nursing_certificate_approved == 0) ? true : false)
                    },
                    driver_license:{
                        name:'Driver license',
                        document:((fs.existsSync(`requirements/${rows[1][0].driver_license}`))? fs.readFileSync(`requirements/${rows[1][0].driver_license}`, 'base64') : null ),
                        approved:((rows[1][0].driver_license_approved == 0) ? false : true),
                        pending:((rows[1][0].driver_license && rows[1][0].driver_license_approved == 0) ? true : false)
                    },
                    backgroundCheck:{
                        name:'Background Check',
                        document:((fs.existsSync(`requirements/${rows[1][0].backgroundCheck_approved}`))? fs.readFileSync(`requirements/${rows[1][0].backgroundCheck_approved}`, 'base64') : null ),
                        approved:((rows[1][0].backgroundCheck_approved == 0) ? false : true),
                        pending:((rows[1][0].backgroundCheck && rows[1][0].backgroundCheck_approved == 0) ? true : false)
                    },
                    physical:{
                        name:'Physical',
                        document:((fs.existsSync(`requirements/${rows[1][0].physical}`))? fs.readFileSync(`requirements/${rows[1][0].physical}`, 'base64') : null ),
                        approved:((rows[1][0].physical_approved == 0) ? false : true),
                        pending:((rows[1][0].physical && rows[1][0].physical_approved == 0) ? true : false)
                    },
                    tb_test:{
                        name:'Tb test',
                        document:((fs.existsSync(`requirements/${rows[1][0].tb_test}`))? fs.readFileSync(`requirements/${rows[1][0].tb_test}`, 'base64') : null ),
                        approved:((rows[1][0].tb_test_approved == 0) ? false : true),
                        pending:((rows[1][0].tb_test && rows[1][0].tb_test_approved == 0) ? true : false)
                    },
                    blsCpr:{
                        name:'BLS or CPR',
                        document:((fs.existsSync(`requirements/${rows[1][0].blsCpr}`))? fs.readFileSync(`requirements/${rows[1][0].blsCpr}`, 'base64') : null ),
                        approved:((rows[1][0].blsCpr_approved == 0) ? false : true),
                        pending:((rows[1][0].blsCpr && rows[1][0].blsCpr_approved == 0) ? true : false)
                    },
                    vaccinations:{
                        name:'Vaccinations',
                        document:((fs.existsSync(`requirements/${rows[1][0].vaccinations}`))? fs.readFileSync(`requirements/${rows[1][0].vaccinations}`, 'base64') : null ),
                        approved:((rows[1][0].vaccinations_approved == 0) ? false : true),
                        pending:((rows[1][0].vaccinations && rows[1][0].vaccinations_approved == 0) ? true : false)
                    },
                    covid_vaccine_declination:{
                        name:'Vovid vaccine declination',
                        document:((fs.existsSync(`requirements/${rows[1][0].covid_vaccine_declination}`))? fs.readFileSync(`requirements/${rows[1][0].covid_vaccine_declination}`, 'base64') : null ),
                        approved:((rows[1][0].covid_vaccine_declination_approved == 0) ? false : true),
                        pending:((rows[1][0].covid_vaccine_declination && rows[1][0].covid_vaccine_declination_approved == 0) ? true : false)
                    },            
                    oig_gsa:{
                        name:'OIG (with LEIE), GSA',
                        document:((fs.existsSync(`requirements/${rows[1][0].oig_gsa}`))? fs.readFileSync(`requirements/${rows[1][0].oig_gsa}`, 'base64') : null ),
                        approved:((rows[1][0].oig_gsa_approved == 0) ? false : true),
                        pending:((rows[1][0].oig_gsa && rows[1][0].oig_gsa_approved == 0) ? true : false)
                    },
                    skills_assessment:{
                        name:'Skills assessment',
                        document:((fs.existsSync(`requirements/${rows[1][0].skills_assessment}`))? fs.readFileSync(`requirements/${rows[1][0].skills_assessment}`, 'base64') : null ),
                        approved:((rows[1][0].skills_assessment_approved == 0) ? false : true),
                        pending:((rows[1][0].skills_assessment && rows[1][0].skills_assessment_approved == 0) ? true : false)
                    }
                },
                row));

                rows = rows.map(({finished_price_facility, ...row}) => (row)) 

                res.send(rows[0])
            }else{
                res.status(404).send({message:"You don't have access to this shift, or its not exists"})
            }  
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })
    
})

app.get("/notifications",verifyTokenAndPermission(["facility"]),(req,res)=>{
   
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
    
    pool.query(`SELECT * FROM facilites_notifications WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') ORDER BY date DESC`,(err,rows,fields) =>{
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

app.get("/messages",verifyTokenAndPermission(["facility"]),(req,res)=>{

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
    SELECT id , role , facility_id,shift_finished,shift_cancelled , staff_hired_id,
    (SELECT json_object('first_name',staff.first_name,'last_name',staff.last_name,'phone',staff.phone)  
    FROM staff WHERE id = facility_shifts.staff_hired_id) as staff,
    (SELECT json_object('message_date',messages.message_date,'message',messages.message,'sender_phone',messages.sender_phone,'receiver_phone',messages.receiver_phone,'receiver_seen',messages.receiver_seen)  
    FROM messages WHERE 
    sender_phone LIKE (SELECT phone FROM staff WHERE id = facility_shifts.staff_hired_id) 
    AND receiver_phone LIKE '${req.user.phone}'
    AND shift_id = facility_shifts.id
    or 
    sender_phone LIKE '${req.user.phone}' 
    AND receiver_phone LIKE (SELECT phone FROM staff WHERE id = facility_shifts.staff_hired_id) 
    AND shift_id = facility_shifts.id
    ORDER BY message_date DESC LIMIT 1) as last_message,
    (SELECT COUNT(*) FROM messages WHERE shift_id = facility_shifts.id AND receiver_phone LIKE '${req.user.phone}' AND receiver_seen = false) as unread_messages
    FROM facility_shifts WHERE facility_id = (SELECT id FROM facilites WHERE phone = '${req.user.phone}') AND staff_hired_id is not null HAVING shift_finished = false AND shift_cancelled = false;
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

app.get("/messages/:phone",verifyTokenAndPermission(["facility"]),(req,res)=>{

    var staffPhone = req.params.phone
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
            message: staffPhone +" "+result.error.details[0].message
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

app.get("/payment-method",verifyTokenAndPermission(["facility"]),(req,res)=>{

    pool.query(`
    SELECT connected_customer_account,payment_method_auto_pay FROM facilites WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(!err){  
           
            if(rows[0].connected_customer_account && rows[0].payment_method_auto_pay){
                
                stripe.retrievePaymentMethod(rows[0].payment_method_auto_pay,error=>{
                    res.status(500).send(error)
                },
                response=>{
                    res.send(response)
                })

            }else{
                res.status(404).send({message:"You should add payment method."})
            }
                
        }else{
            res.status(500).send(err)
        }
    })

})

app.put("/payment-method",verifyTokenAndPermission(["facility"]),(req,res)=>{

    const type = req.query.type
    const billing_name = req.query.billing_name

    const card_number = req.query.card_number
    const card_exp_month = req.query.card_exp_month
    const card_exp_year = req.query.card_exp_year
    const card_cvc = req.query.card_cvc

    const us_bank_account_number = req.query.us_bank_account_number
    const us_bank_account_type = req.query.us_bank_account_type
    const us_bank_routing_number = req.query.us_bank_routing_number
    const us_bank_account_holder_type = req.query.us_bank_account_holder_type
    
    var paymentMethod = {}

    if(type == "us_bank_account"){

        const result = validation_schema.us_bank_account_schema.validate({us_bank_account_number,us_bank_account_type,us_bank_routing_number,us_bank_account_holder_type,billing_name})

        if(result.error){
            res.status(400).send({
                message: result.error.details[0].message
             });
            return
        }

        paymentMethod = {
            type: type,
            billing_details:{
                name:billing_name
            },
            us_bank_account:{
                account_number: us_bank_account_number,
                account_type: us_bank_account_type,
                routing_number: us_bank_routing_number,
                account_holder_type: us_bank_account_holder_type,
            }
        }

    } else if(type == "card"){

        const result = validation_schema.card_schema.validate({card_number,card_exp_month,card_exp_year,card_cvc,billing_name})

        if(result.error){
            res.status(400).send({
                message: result.error.details[0].message
             });
            return
        }

        paymentMethod = {
            type: type,
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

    }
    else{
        res.status(400).send({message:`type provided '${type}' but must be: (us_bank_account) or (card)`})
        return
    }
   
    pool.query(`SELECT connected_customer_account, invoice_option FROM facilites WHERE phone LIKE '${req.user.phone}'`,(err,rows,fields) =>{
        if(err){  
            res.status(500).send({message: err.sqlMessage})
            return
        }

        if(rows[0].invoice_option != 1 || rows[0].invoice_option != 2){  
            res.status(400).send({message:"Choose Payment Type first"})
            return
        }

        if(rows[0].connected_customer_account){
            createPaymentMethod(res,paymentMethod,req,res,rows[0].connected_customer_account,{}) //Null body
        }else{
            stripe.customer(error=>{
                res.status(500).send(error)
            },
            response=>{
                createPaymentMethod(res,paymentMethod,req,res,response.id,{}) //Null body
            })
        }
    })

})

app.get("/invoice",verifyTokenAndPermission(['facility']),(req,res)=>{

    pool.query(` 
    SELECT SUM(amount + late_fees) as invoice_until_now, invoice_date as invoice_starts_date, invoice_due_date as invoice_end_date
    FROM invoices WHERE 
    facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') 
    AND late_days is null
    AND paid = false;

    SELECT *,
    (SELECT json_object('id',staff.id,'profile_pic',staff.profile_pic,'first_name',staff.first_name,'last_name',staff.last_name,'gender',staff.gender,'language',staff.language,'phone',staff.phone,'role',staff.role)  
    FROM staff WHERE id = facility_shifts.staff_hired_id) as staff FROM facility_shifts WHERE 
    facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') AND 
    shift_finished = true AND 
    payment_status = false AND 
    (SELECT count(id) FROM invoices WHERE id = facility_shifts.invoice_id AND paid = false AND facility_id = facility_shifts.facility_id AND late_days is null) = 1; 
    `,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows[1] = rows[1].map(({finished_price_staff,invoice_rate_staff, ...row}) => (
            row.staff = JSON.parse(row.staff),
            row.shift_starts = ((row.shift_starts == 0) ? false : true),
            row.shift_finished = ((row.shift_finished == 0) ? false : true),
            row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
            row.payment_status = ((row.payment_status == 0) ? false : true),
            row.shift_reported = ((row.shift_reported == 0) ? false : true),
            row.finished_price = row.finished_price_facility,
            row.shift_status = ((row.staff_hired_id)? ((row.shift_finished == 1) ? "Completed" : ((row.shift_starts == 1) ? "Clocked In": "Waiting on Clock in")) : "Waiting booking" ),
            row));

            rows[1] = rows[1].map(({finished_price_facility, ...row}) => (row)) 

        res.send({invoice:rows[0][0],timesheet:rows[1]}) 
    })

})

app.get("/invoices-history",verifyTokenAndPermission(['facility']),(req,res)=>{
    const this_month = moment().startOf('month').format('YYYY-MM')
    const last_month = moment().startOf('month').subtract(1,'day').format('YYYY-MM')

    pool.query(`
    SELECT 

    (SELECT TRUNCATE(sum(amount + late_fees),2) FROM invoices WHERE 
    facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') 
    AND invoice_date BETWEEN '${last_month}' AND '${last_month}'
    AND invoice_due_date BETWEEN '${last_month}' AND '${last_month}'
    AND paid = true) as total_paid,

    (SELECT TRUNCATE(SUM(amount + late_fees),2)
    FROM invoices WHERE 
    facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') 
    AND late_days is null
    AND paid = false) as total_pending,

    (SELECT TRUNCATE(sum(amount + late_fees),2) FROM invoices WHERE 
    facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') 
    AND late_days >= 1
    AND paid = false) as past_due,

    (SELECT TRUNCATE(SUM(late_fees),2)
    FROM invoices WHERE 
    facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}') 
    AND invoice_date BETWEEN '${this_month}' AND '${this_month}'
    AND paid = false) as late_fees;

    SELECT id, invoice_date, invoice_due_date, facility_id, is_late_fee, DATE_ADD(invoice_due_date, INTERVAL 1 DAY) as past_due_date,
    TRUNCATE(amount + late_fees,2) as amount, late_fees, 
    CASE WHEN paid = true THEN 'Paid' ELSE CASE WHEN late_days >= 1 THEN 'Past due' ELSE CASE WHEN invoice_due_date > current_date() THEN 'Pending' ELSE 'Invoice is due' END END END as status
    FROM invoices WHERE facility_id = (SELECT id FROM facilites WHERE phone LIKE '${req.user.phone}');
    
    `,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows[1] = rows[1].map(row => (
            row.is_late_fee = ((row.is_late_fee == 0) ? false : true),
            row));

        res.send({info:rows[0][0],previous_invoices:rows[1]}) 

    })

})

module.exports = app
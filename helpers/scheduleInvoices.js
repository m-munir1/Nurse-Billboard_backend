const schedule = require('node-schedule');
var moment = require('moment');
const notification = require('./notifications')
const stripe = require('./stripe_helper')
const emails = require('./emaills')
const  pool = require("../connection");
const twilio = require("./twilio");
const static_texts = require("./static-texts");
require("dotenv").config();
const EXCEL_PASSWORD = process.env.EXCEL_PASSWORD;
const NURSEBILLBOARD_EMAIL = process.env.NURSEBILLBOARD_EMAIL;
var path = require('path');
const fs = require("fs");
const Excel  = require("exceljs");


function scheduleInvoice(invoice_id,invoice_auto_pay,invoice_due_date){
    

    if(invoice_auto_pay){
        //Auto Pay
        autoPaySchedule(invoice_id,invoice_due_date)
    }else{
        //Static
        staticSchedule(invoice_id,invoice_due_date)
 
    }

}

function autoPaySchedule(invoice_id,invoice_due_date) {
    schedule.cancelJob(`${invoice_id}auto_pay`)
    schedule.cancelJob(`${invoice_id}auto_pay_reminder`)

    // schedule.scheduleJob(`${invoice_id}reminder`,moment(invoice_due_date).subtract(1,'day').toDate(), 
    // function(){
    //     reminderAutoPay(invoice_id)
    // })

    schedule.scheduleJob(`${invoice_id}auto_pay`,moment(invoice_due_date).toDate(), 
    function(){
        autoPay(invoice_id)
    })
}

//Check if charge not success
function autoPay(invoice_id) {
    pool.query(`
    SELECT *,
    (SELECT fcm_token FROM facilites WHERE id = invoices.facility_id) as fcm_token,
    (SELECT phone FROM facilites WHERE id = invoices.facility_id) as phone,
    (SELECT auto_pay_method FROM facilites WHERE id = invoices.facility_id) as auto_pay_method,
    (SELECT connected_customer_account FROM facilites WHERE id = invoices.facility_id) as connected_customer_account
    FROM invoices WHERE id = ${invoice_id}`
    ,(err,response,fields) =>{
        if(err){ 
            console.log(err)
            return
        }

        if(response[0].paid){
            schedule.cancelJob(`${invoice_id}auto_pay`)
            schedule.cancelJob(`${invoice_id}auto_pay_reminder`)
            return
        }

        stripe.createCharge(response[0].connected_customer_account,response[0].amount,response[0].auto_pay_method,
            (success)=>{
                pool.query(`
                UPDATE invoices SET paid = true, payment_charge_stripe = '${success.id}' WHERE id = ${invoice_id};`
                ,(err,response,fields) =>{
                    if(err){ 
                        console.log(err)
                        return
                    }

                    notification.sendNotification(response[0].fcm_token,'Auto Pay Invoice',`Your Invoice #${invoice_id} is successfully paid`)
                    twilio.sendSms(`Auto Pay Invoice, Your Invoice #${invoice_id} is successfully paid`,response[0].phone)
        
                }) 
            },
            (error)=>{
                console.log(error)
            })


    })  
}

function staticSchedule(invoice_id,invoice_due_date) {
    schedule.cancelJob(`${invoice_id}static_invoice`)
    schedule.cancelJob(`${invoice_id}static_invoice_reminder`)

    schedule.scheduleJob(`${invoice_id}static_invoice_reminder`,moment(invoice_due_date).subtract(1,'day').toDate(), 
    function(){
        reminderStaticInvoice(invoice_id)
    })

    if(moment().format("YYYY-MM-DD") >= invoice_due_date){
        static_invoice(invoice_id)
    }else{
        schedule.scheduleJob(`${invoice_id}static_invoice`,moment(invoice_due_date).toDate(), 
        function(){
            static_invoice(invoice_id)
        })
    }
    

}

function reminderStaticInvoice(invoice_id) {
    pool.query(`
    SELECT *,
    (SELECT facility_name FROM facilites WHERE id = invoices.facility_id) as facility_name,
    (SELECT company_name FROM facilites WHERE id = invoices.facility_id) as company_name,
    (SELECT company_email FROM facilites WHERE id = invoices.facility_id) as company_email,
    (SELECT fcm_token FROM facilites WHERE id = invoices.facility_id) as fcm_token,
    (SELECT phone FROM facilites WHERE id = invoices.facility_id) as phone
    FROM invoices WHERE id = ${invoice_id};
    
    SELECT * ,
    (SELECT invoice_due_date FROM invoices WHERE id = ${invoice_id}) as invoice_due_date,
    (SELECT json_object('first_name',staff.first_name,'last_name',staff.last_name) FROM staff WHERE id = facility_shifts.staff_hired_id) as staff,
    (SELECT json_object('facility_name',facilites.facility_name,'facility_address',facilites.address,'facility_postal_code',facilites.postal_code,'facility_state',facilites.state,'facility_city',facilites.city,'company_email',facilites.company_email) FROM facilites WHERE id = facility_shifts.facility_id) as facility
    FROM facility_shifts WHERE invoice_id = ${invoice_id} AND shift_finished = true;`
    ,(err,response,fields) =>{
        if(err){ 
            console.log(err)
            return
        }

        var workbook = new Excel.Workbook();
        workbook.xlsx.readFile(path.resolve(__dirname, '../assets/invoice.xlsx' ))
        .then(function() {
            var rowNumber = 19
            var worksheet = workbook.getWorksheet(1);
    
            response[1].forEach(shift => {

                const facility = JSON.parse(shift.facility)
                const staff = JSON.parse(shift.staff) 
    
                var rowValues = [];
                rowValues[1] = staff.first_name + " " + staff.last_name //employee name
                rowValues[2] = shift.role // employe role
                rowValues[3] = moment(shift.start_time).format('MM/DD/YYYY') // Shift date
                rowValues[4] = moment(shift.clockin_time).format('hh:mm A') // Time In
                rowValues[5] = moment(shift.clockin_time).add(4,'hours').format('hh:mm A') // Lunch In
                rowValues[6] = moment(shift.clockin_time).add(4,'hours').add(30,'minutes').format('hh:mm A') // Lunch Out
                rowValues[7] = moment(shift.clockout_time).format('hh:mm A') // Time Out
                rowValues[8] = shift.worked_minutes/60 // Total Hours
                rowValues[9] = (shift.worked_minutes/60) - shift.overtime_hours - shift.double_hours // Total regular hours 9
                rowValues[10] = ((shift.overtime_hours)? shift.overtime_hours : 0) // Total overtime hours 10
                rowValues[11] = ((shift.double_hours)? shift.double_hours : 0) // Total double_hours 11
                rowValues[12] = ((shift.invoice_rate)? shift.invoice_rate : 0)  // Regular Rate 12 
                rowValues[13] = ((shift.overtime_rate)? shift.overtime_rate : 0) // Overtime Rate 13
                rowValues[14] = ((shift.double_rate)? shift.double_rate : 0)  // Double Time Rate 14 
                rowValues[15] = shift.finished_price_facility // Total 15 
                
                worksheet.getRow(3).getCell('B').value = invoice_id //Invoice Number
                worksheet.getRow(4).getCell('B').value = moment(shift.invoice_due_date).subtract(1,'day').format('MM/DD/YYYY') //Invoice Date
                worksheet.getRow(5).getCell('B').value = moment(shift.invoice_due_date).format('MM/DD/YYYY') //Due Date
    
                worksheet.getRow(9).getCell('B').value = facility.facility_name //Client name
                worksheet.getRow(10).getCell('B').value = facility.facility_address //Address
                worksheet.getRow(11).getCell('B').value = `${facility.facility_city},${facility.facility_state},${facility.facility_postal_code}` //City, state, zip
                worksheet.insertRow(rowNumber, rowValues,'i+')
    
                rowNumber = rowNumber + 1
    
            });
    
            worksheet.getRow(rowNumber + 5).getCell('L').value = response[0][0].amount
        
            worksheet.protect(EXCEL_PASSWORD)
            workbook.xlsx.writeFile(path.resolve(__dirname, `../invoices/${invoice_id}.xlsx`)).then(function() {
                emails.sendFileEmail(`${invoice_id}.xlsx`,fs.readFileSync(path.resolve(__dirname, `../invoices/${invoice_id}.xlsx`)),NURSEBILLBOARD_EMAIL,response[0][0].company_email,`${response[0][0].company_name} Invoice #${invoice_id}`,`${static_texts.invoiceDueEmail(invoice_id,response[0][0].facility_name,moment(response[0][0].invoice_due_date).add(1,'day').format('MM/DD/YYYY'))}`)
                notification.sendNotification(response[0][0].fcm_token,'Invoice Reminder',`Your current invoice #${invoice_id} is now DUE, Please make a payment to avoid late fees`)
                twilio.sendSms(`Invoice Reminder, Your current invoice #${invoice_id} is now DUE, Please make a payment to avoid late fees`,response[0][0].phone)
            })


        })             

    })  
}

function static_invoice(invoice_id) {
    pool.query(`
    SELECT *,
    (SELECT count(id) + 24 FROM facility_shifts WHERE invoice_id = ${invoice_id} AND shift_finished = true) as rows_to_total,
    (SELECT facility_name FROM facilites WHERE id = invoices.facility_id) as facility_name,
    (SELECT company_name FROM facilites WHERE id = invoices.facility_id) as company_name,
    (SELECT company_email FROM facilites WHERE id = invoices.facility_id) as company_email,
    (SELECT fcm_token FROM facilites WHERE id = invoices.facility_id) as fcm_token,
    (SELECT phone FROM facilites WHERE id = invoices.facility_id) as phone
    FROM invoices WHERE id = ${invoice_id}`
    ,(err,response,fields) =>{
        if(err){ 
            console.log(err)
            return
        }

        if(response[0].paid){
            pool.query(`
            INSERT INTO facilites_notifications(title,body,facility_id,date) values('Invoice Paid','Thanks, Invoice #${invoice_id} is marked as paid ','${response[0].facility_id}',CURRENT_TIMESTAMP);
            UPDATE invoices SET paid = true  WHERE id = ${invoice_id};
            DELETE FROM invoices_schedule WHERE id = ${invoice_id};`
            ,(err,rows,fields) =>{
                if(err){ 
                    console.log(err)
                    return
                }

                schedule.cancelJob(`${invoice_id}static_invoice`)
                schedule.cancelJob(`${invoice_id}static_invoice_reminder`)
                notification.sendNotification(response[0].fcm_token,'Invoice Paid',`Thanks, Invoice #${invoice_id} is marked as paid `)
                twilio.sendSms(`Invoice Paid, Thanks, Invoice #${invoice_id} is marked as paid `,response[0].phone)
    
            }) 
            return
        }

        if(moment().format("YYYY-MM-DD") == moment(response[0].invoice_due_date).add(response[0].late_days + 1,"days").format("YYYY-MM-DD")){
            addExtraDay(response,invoice_id)
        }else{
            const delay_date = moment(response[0].invoice_due_date).add(response[0].late_days + 1,"days").format("YYYY-MM-DD")

            schedule.scheduleJob(`${invoice_id}static_invoice_delay`,moment(delay_date).toDate(), 
            function(){
                addExtraDay(response,invoice_id)
            })  
        }
    })  
}

function addExtraDay(response,invoice_id) {
    const newLateDays = response[0].late_days + 1
    const delay_date = moment(response[0].invoice_due_date).add(newLateDays,"days").format("YYYY-MM-DD")


    if(newLateDays == 1){
        updateFees(response,invoice_id)
    }else if(newLateDays == 28){
        //Block
        pool.query(`
        UPDATE facilites SET account_blocked = true WHERE id = ${response[0].facility_id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Account blocked','Your account blocked due to not paying invoice #${invoice_id}','${response[0].facility_id}',CURRENT_TIMESTAMP);
        DELETE FROM invoices_schedule WHERE id = ${invoice_id};`
        ,(err,rows,fields) =>{
            if(err){ 
                console.log(err)
                return
            }

            schedule.cancelJob(`${invoice_id}static_invoice`)
            schedule.cancelJob(`${invoice_id}static_invoice_reminder`)
            schedule.cancelJob(`${invoice_id}static_invoice_delay`)

            notification.sendNotification(response[0].fcm_token,'Account blocked',`Your account blocked due to not paying invoice #${invoice_id}`)
            twilio.sendSms(`Account blocked, Your account blocked due to not paying invoice #${invoice_id}`,response[0].phone)

        }) 
    }else{

        pool.query(`
        UPDATE invoices SET late_days = ${newLateDays} ,late_fees = if(${newLateDays} = 1,((amount * 1) / 100),late_fees) , is_late_fee = if(${newLateDays} = 1,true,is_late_fee) WHERE id = ${invoice_id};
        INSERT INTO facilites_notifications(title,body,facility_id,date) values('Invoice Reminder','Your current invoice #${invoice_id} is PAST DUE, Please make a payment to avoid service interruption.',CURRENT_TIMESTAMP);
        `
        ,(err,rows,fields) =>{
            if(err){ 
                console.log(err)
                return
            }

        }) 

        notifyPastDue(response,invoice_id)

        schedule.scheduleJob(`${invoice_id}static_invoice_delay`,moment(delay_date).toDate(), 
        function(){
            static_invoice(invoice_id)
        })
       
    }
  
}

function updateFees(response,invoice_id) {
    var workbook = new Excel.Workbook();
    workbook.xlsx.readFile(path.resolve(__dirname, `../invoices/${invoice_id}.xlsx`))
    .then(function() {
        var worksheet = workbook.getWorksheet(1);
        worksheet.unprotect(EXCEL_PASSWORD)
        const amount = worksheet.getRow(response[0].rows_to_total).getCell('L').value

        worksheet.getRow(response[0].rows_to_total).getCell('L').value = amount + ((amount * 1) / 100)
        worksheet.getRow(response[0].rows_to_total - 1).getCell('L').value = ((amount * 1) / 100)
    
        worksheet.protect(EXCEL_PASSWORD)
        workbook.xlsx.writeFile(path.resolve(__dirname, `../invoices/${invoice_id}.xlsx`)).then(function() {
            notifyPastDue(response,invoice_id)
        })
    })   
}

function notifyPastDue(response,invoice_id) {
    emails.sendFileEmail(`${invoice_id}.xlsx`,fs.readFileSync(path.resolve(__dirname, `../invoices/${invoice_id}.xlsx`)),NURSEBILLBOARD_EMAIL,response[0].company_email,`Past Due ${response[0].company_name} Invoice #${invoice_id} Reminder`,`${static_texts.invoicePastDueEmail(invoice_id,response[0].facility_name,moment(response[0].invoice_due_date).format('MM/DD/YYYY'))}`)
    notification.sendNotification(response[0].fcm_token,'Invoice Reminder',`Your current invoice #${invoice_id} is PAST DUE, Please make a payment to avoid service interruption.`)
    twilio.sendSms(`Invoice Reminder, Your current invoice #${invoice_id} is PAST DUE, Please make a payment to avoid service interruption.`,response[0].phone)
}

module.exports = {
    scheduleInvoice
}
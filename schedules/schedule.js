const scheduleShiftss = require("../helpers/scheduleShifts")
const scheduleInvoicess = require("../helpers/scheduleInvoices")
const scheduleFutureShift = require("../helpers/schedule-future-shifts")
const  pool = require("../connection");

function scheduleShifts() {
    pool.query(`
    SELECT * FROM facility_schedule;
    SELECT * FROM individual_schedule;`,(err,rows,fields) =>{
        if(err){
        console.log(err)
        return
        }

        if(!rows[0]){
        return
        }

        rows[0].forEach(async function (item, index) {
            scheduleShiftss.scheduleFacilityShift(item.facility_id,item.name,item.start_time,item.end_time)
        });

        if(!rows[1]){
            return
            }
    
        rows[1].forEach(async function (item, index) {
            scheduleShiftss.scheduleIndividualShift(item.individual_id,item.name,item.start_time,item.end_time)
        });

        console.log("rescheduled Shifts")
    })
}

function scheduleInvoices() {
    pool.query(`
    SELECT *,
    (SELECT invoice_due_date FROM invoices WHERE id = invoices_schedule.invoice_id) as invoice_due_date
    FROM invoices_schedule;`,(err,rows,fields) =>{
        if(err){
        console.log(err)
        return
        }

        if(!rows[0]){
            return
        }
    
        rows.forEach(async function (item, index) {
            scheduleInvoicess.scheduleInvoice(item.invoice_id,((item.invoice_option == 1)? true:false),item.invoice_due_date)
        });

        console.log("rescheduled invoices")
    })
}

function scheduleInvoices() {
    pool.query(`
    SELECT * FROM future_individual_schedule;`,(err,rows,fields) =>{
        if(err){
        console.log(err)
        return
        }

        if(!rows[0]){
            return
        }
    
        rows.forEach(async function (item, index) {
            scheduleFutureShift.scheduleFutureShift(item.phone,item,{invoice_rate:item.invoice_rate,invoice_rate_staff:item.invoice_rate_staff})
        });

        console.log("rescheduled future individual schedules")
    })
}

module.exports = {
    scheduleShifts,
    scheduleInvoices
};
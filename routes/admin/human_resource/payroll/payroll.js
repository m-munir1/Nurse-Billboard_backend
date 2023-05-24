const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
const {transferFundsPayroll} = require("../../../../helpers/stripe_helper");
var moment = require('moment');
const schedule = require('node-schedule');

app.get("/active-payroll/",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    //16
    //1
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

    pool.query(`SELECT sum(finished_price_staff) as payroll_total ,'${moment(end_payroll_date).add(1,'day')}' as payroll_date FROM facility_shifts WHERE 
    shift_finished = true AND payment_status = false AND clockout_time between '${start_payroll_date}' and '${end_payroll_date}';
    `,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }
        res.send(rows[0]) 
    })

})

app.get("/start-payroll/",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

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

    pool.query(`SELECT 
    (SELECT stripe_account FROM staff_requirements WHERE staff_id = facility_shifts.staff_hired_id) as stripe_account, 
    sum(finished_price_staff) as payroll_total,
    '${moment(end_payroll_date).add(1,'day')}' as payroll_date FROM facility_shifts WHERE 
    shift_finished = true AND payment_status = false AND clockout_time between '${start_payroll_date}' and '${end_payroll_date}';
    `,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }
        startPayroll(rows,start_payroll_date,end_payroll_date)
        res.send({status:`Payroll (${moment(end_payroll_date).add(1,'day')}) Started`}) 
    })

})

function startPayroll(payrolls,start_payroll_date,end_payroll_date){
    
    schedule.scheduleJob(`startpayroll`,moment().add(5,'minute').toDate(), function(payrolls){

        pool.query(`
        INSERT INTO payrolls(payroll_date,total_staff_payroll) values('${start_payroll_date}',${payrolls.length});
        `,(err,rows,fields) =>{
            if(err){ 
                console.log(err)
                return
            }
        })

        payrolls.forEach(staff => {
            transferFundsPayroll(staff.payroll_total,staff.stripe_account,
                (success)=>{
                    pool.query(`
                    UPDATE facility_shifts SET payment_status = true, payroll_date = '${staff.payroll_date}' WHERE staff_hired_id = ${staff.id} 
                    AND shift_finished = true AND payment_status = false AND clockout_time between '${start_payroll_date}' and '${end_payroll_date}';

                    UPDATE payrolls SET paid_staff_payroll = paid_staff_payroll + 1 WHERE payroll_date LIKE '${start_payroll_date}';
                    `,(err,rows,fields) =>{
                        if(err){ 
                            console.log(`error in mysql id: ${staff.id}, ${err}`)
                        }
                    })
                },
                (error)=>{
                    console.log(`error transfer Funds id: ${staff.id}, ${error}`)
                })
        });

        pool.query(`
        UPDATE payrolls SET payroll_finished = true WHERE payroll_date LIKE '${start_payroll_date}';
        `,(err,rows,fields) =>{
            if(err){ 
                console.log(err)
            }
        })

    }.bind(null,payrolls))  

}

module.exports = app;
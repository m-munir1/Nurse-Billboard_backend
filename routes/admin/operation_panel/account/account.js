const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
const {account} = require('../../../../helpers/validation_schema/admin/operation_panel/account');

app.get("/",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{
    
    pool.query(`
    SELECT * FROM operation_panel WHERE phone LIKE '${req.user.phone}';`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
        
        rows = rows.map(({password, ...row}) => (row));

        res.send(rows[0])

    })
})

app.put("/",verifyTokenAndPermission(["operation_panel"]),(req,res)=>{

    const full_name = req.query.full_name
    const email = req.query.email
    const gender = req.query.gender
    
    const result = account.validate({email,full_name,gender})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    UPDATE operation_panel SET 
    full_name =  case when '${full_name}' != 'undefined' or not null then '${full_name}' else full_name end,
    gender =  case when '${gender}' != 'undefined' or not null then '${gender}' else gender end,
    email = case when '${email}' != 'undefined' or not null then '${email}' else email end
    WHERE phone LIKE '${req.user.phone}';
    `,(err,rows,fields) =>{
        if(!err){  
            res.send({status:"success",full_name:full_name,email:email,email:req.user.email})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

module.exports = app;
const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
var fs = require('fs');
const { id } = require("@hapi/joi/lib/base");


app.get("/new_facilities",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    pool.query(`
    SELECT * FROM facilites WHERE account_approved = false AND contract_pdf is not null;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        rows = rows.map(({password, ...row}) => (
            row.contract_pdf = ((fs.existsSync(`contracts/${rows[0].phone.replace('+','')}contract.pdf`))? fs.readFileSync(`contracts/${rows[0].phone.replace('+','')}contract.pdf`, 'base64') : null),
            row));


        res.send(rows)
    })

})

app.post("/approve_facilities",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    const ids_query = req.query.ids
    const ids = ids_query.split(",")
    var sql_queries = ""

    for(id in ids){
        sql_queries = sql_queries + `UPDATE facilites SET account_approved = true WHERE id = ${id};`
    }

    pool.query(sql_queries,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }

        res.send({status:'success',message:'Succesfully Approved facilities'})

    })
})


module.exports = app;
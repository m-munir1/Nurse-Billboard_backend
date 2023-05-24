const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
 
app.get("/available_facilites",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    pool.query(`
    SELECT * FROM available_facilites WHERE contacted = false;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send(rows)
    })

})

app.post("contacted/:id",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    const id = req.params.id
    const contact_name = req.query.contact_name
    const contact_status = req.query.contact_status


    pool.query(`
    SELECT * FROM available_facilites WHERE id = ${id}`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        if(!rows[0]){
            res.status(404).send({message:"There's no facility with this id"})
            return
        }


        if(rows[0].not_interested){
            res.status(400).send({message:"This facility is already not interested"})
            return
        }

        pool.query(`
        UPDATE available_facilites SET contact_name = '${contact_name}', contact_status '${contact_status}', contacted = true WHERE id = ${id};`,(err,rows,fields) =>{
            if(err){   
                res.status(500).send({message:err.sqlMessage})
                return
            }
           
            res.send({status:'success',message:'Succesfully marked as contacted'})
        })

    })
  
})

app.post("not_interested/:id",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    const id = req.params.id

    pool.query(`
    SELECT * FROM available_facilites WHERE id = ${id};`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        if(!rows[0]){
            res.status(404).send({message:"There's no facility with this id"})
            return
        }


        if(rows[0].not_interested){
            res.status(400).send({message:"This facility is already not interested"})
            return
        }

        pool.query(`
        UPDATE available_facilites SET not_interested = true, contacted = false WHERE id = ${id};`,(err,rows,fields) =>{
            if(err){   
                res.status(500).send({message:err.sqlMessage})
                return
            }
           
            res.send({status:'success',message:'Succesfully marked as not interested'})
        })

    })
})

app.get("/contacted",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    pool.query(`
    SELECT * FROM available_facilites WHERE contcated = true;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send(rows)

    })
})

app.get("/not_interested",verifyTokenAndPermission(["sales"]),(req,res)=>{
    
    pool.query(`
    SELECT * FROM available_facilites WHERE not_interested = true;`,(err,rows,fields) =>{
        if(err){   
            res.status(500).send({message:err.sqlMessage})
            return
        }
       
        res.send(rows)

    })
})


module.exports = app;
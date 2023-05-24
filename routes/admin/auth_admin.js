const express = require("express");
const app = express.Router();
const bcrypt = require('bcrypt')
const pool = require("../../connection");
const {signToken} = require("../../helpers/jwt_helper");
const {userExists} = require("../../helpers/userExists");
const {register} = require('../../helpers/validation_schema/admin/auth_schema');

app.post("/register",(req,res)=>{
    var phone = req.query.phone
    const password = req.query.password
    const type = req.query.type

    if(!phone.includes("+")){
      phone = '+'+req.query.phone.replace(/\s+/g, '')
    }

    const result = register.validate({phone,password,type})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(type != "operation_panel" && type != "human_resources"){
      res.status(400).send({message:"Wrong account type provided, it should be human_resources, operation_panel."})
      return
    }

    userExists(phone,
      (error)=>{
        res.status(500).send({message:error})
      },
      (facility)=>{
        res.status(409).send({message:`This number ${phone} already registerd as facility`})
      },
      (individual)=>{
        res.status(409).send({message:`This number ${phone} already registerd as individual`})
      },
      (staff)=>{
        res.status(409).send({message:`This number ${phone} already registerd as staff`})
      },
      (human_resources)=>{
        res.status(409).send({message:`This number ${phone} already registerd`})
      },
      (operation_panel)=>{
        res.status(409).send({message:`This number ${phone} already registerd`})
      },
      (notexist)=>{
     
        switch (type) {
          case "human_resources":
            //Facility
            registerHumanResource(phone,password,res)
            break;
          case "operation_panel":
            registerOpeationPanel(phone,password,res)
        }

      
      })
  
})

function registerHumanResource(phone,password,res){
    pool.query(`INSERT INTO human_resources(phone,password) values('${phone}','${bcrypt.hashSync(password, 10)}');`,(err,results,fields) =>{
      if(!err){  
        signToken({phone,roles:["human_resources"]},(token) => {
          res.send({status:"registered_success",account_type:"human_resources",accessToken:token})
        },(error)=>{
          res.status(500).send(error)
        }) 
      }else{
          res.status(500).send({message:err.sqlMessage})
      }
    })
}

function registerOpeationPanel(phone,password,res){
  pool.query(`INSERT INTO operation_panel(phone,password) values('${phone}','${bcrypt.hashSync(password, 10)}');`,(err,results,fields) =>{
    if(!err){  
      signToken({phone,roles:["operation_panel"]},(token) => {
        res.send({status:"registered_success",account_type:"operation_panel",accessToken:token})
      },(error)=>{
        res.status(500).send(error)
      }) 
    }else{
        res.status(500).send({message:err.sqlMessage})
    }
  })
}
module.exports = app;
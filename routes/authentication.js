const express = require("express");
const app = express.Router();
const bcrypt = require('bcrypt')
const pool = require("../connection");
const {signToken} = require("../helpers/jwt_helper");
const {userExists} = require("../helpers/userExists");
const schema = require('../helpers/validation_schema/authentication_schema');
require("dotenv").config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const service = process.env.TWILIO_SERVICE;
const twilio = require('twilio')(accountSid, authToken);

app.post("/register",(req,res)=>{
    var phone = req.query.phone

    if(!phone.includes("+")){
      phone = '+'+req.query.phone.replace(/\s+/g, '')
    }else{
      phone.replace(' ','')
    }

    const result = schema.register.validate({phone:phone})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
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
      (sales)=>{
        res.status(409).send({message:`This number ${phone} already registerd`})
      },
      (notexist)=>{
        sendCode(phone,res)
      })
  
})

app.post("/register/confirmation",(req,res)=>{
    const code = req.query.code
    const type = req.query.type
    var phone = req.query.phone
    const password = req.query.password

    if(!phone.includes("+")){
      phone = '+'+req.query.phone.replace(/\s+/g, '')
    }else{
      phone.replace(' ','')
    }

    const result = schema.register_confirmation.validate({code,phone,password,type})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(type != "individual" && type != "facility" && type != "staff"){
         //Wrong account type provided
         res.status(400).send({message:"Wrong account type provided, it should be individual, facility, staff."})
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
      (sales)=>{
        res.status(409).send({message:`This number ${phone} already registerd`})
      },
      (notexist)=>{
        //Check Code Verification
        twilio.verify.services(service)
        .verificationChecks
        .create({to:phone, code: code})
        .then(verification_check =>{ 
          if(verification_check.status == "approved"){

            switch (type) {
              case "facility":
                //Facility
                registerFacility(phone,password,res)
                break;
              case "individual":
                registerIndividual(phone,password,res)
                break;
              case "staff":
                registerStaff(phone,password,res)
            }
          
          }else{
            res.status(409).send({message:"Wrong code"})
          }
        })
        .catch(err => {
          res.status(409).send(err)
        });

      })

})

function registerStaff(phone,password,res){
    pool.query(`INSERT INTO staff(phone,password) values('${phone}','${bcrypt.hashSync(password, 10)}');`,(err,results,fields) =>{
      if(!err){  
        signToken({phone,roles:["staff"]},(token) => {
          res.send({status:"registered_success",account_type:"staff",accessToken:token})
        },(error)=>{
          res.status(500).send(error)
        }) 
      }else{
          res.status(500).send({message:err.sqlMessage})
      }
    })
}

function registerIndividual(phone,password,res){
  pool.query(`INSERT INTO individuals(phone,password) values('${phone}','${bcrypt.hashSync(password, 10)}');`,(err,results,fields) =>{
    if(!err){  
      signToken({phone,roles:["individual"]},(token) => {
        res.send({status:"registered_success",account_type:"individual",accessToken:token})
      },(error)=>{
        res.status(500).send(error)
      }) 
    }else{
        res.status(500).send({message:err.sqlMessage})
    }
  })
}

function registerFacility(phone,password,res){

  pool.query(`INSERT INTO facilites(phone,password) values('${phone}','${bcrypt.hashSync(password, 10)}');`,(err,results,fields) =>{
        if(!err){  
          signToken({phone,roles:["facility"]},(token) => {
            res.send({status:"registered_success",account_type:"facility",accessToken:token})
          },(error)=>{
            res.status(500).send(error)
          }) 
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

}

function sendCode(phone,res){
  twilio.verify.services(service)
  .verifications
  .create({to:`${phone}`, channel: 'sms'})
  .then(verification => {
    res.send({status:"success",message:`Verfication code sent to ${phone}`})
  })
  .catch(err => {
    
    if(err.status == 429){
      res.status(429).send({message:"Max send attempts reached."})
      return
    }

    res.status(err.status).send(err)
  });
}

app.post("/login",(req,res)=>{
    var phone = req.query.phone
    const password = req.query.password
  
    if(!phone.includes("+")){
      phone = '+'+req.query.phone.replace(/\s+/g, '')
    }else{
      phone.replace(' ','')
    }

    const result = schema.login.validate({phone:phone,password:password})
  
      if(result.error){
          res.status(400).send({
              message: result.error.details[0].message
           });
          return
      }
      
      userExists(phone,
        (error)=>{
          res.status(500).send(error)
        },
        (facility)=>{
          checkPassword(phone,password,facility,"facility",res)
        },
        (individual)=>{
          checkPassword(phone,password,individual,"individual",res)
        },
        (staff)=>{
          checkPassword(phone,password,staff,"staff",res)
        },
        (human_resources)=>{
          checkPassword(phone,password,human_resources,"human_resources",res)
        },
        (operation_panel)=>{
          checkPassword(phone,password,operation_panel,"operation_panel",res)
        },
        (sales)=>{
          checkPassword(phone,password,sales,"sales",res)
        },
        (notexist)=>{
          res.status(409).send({message:notexist})  
        })
  
})

function checkPassword(phone,password,user,type,res){
  bcrypt.compare(password, user.password, function(err, result) {
    // result == true
    if(err){
      res.status(409).send(err)
      return
    }
    if(result){
      if(type == 'facility'){
        signToken({phone,roles:[type]},(token) => {
          res.send({status:"login_success",account_type:type,accessToken:token,contract_submitted:((user.contract_submitted == 0) ? false : true)})
        },(error)=>{
          res.status(500).send(error)
        })
      }else{
        signToken({phone,roles:[type]},(token) => {
          res.send({status:"login_success",account_type:type,accessToken:token})
        },(error)=>{
          res.status(500).send(error)
        })
      }
    }else{
      res.status(409).send({message:"Wrong password"})
    }
  });
}

app.post("/forget_password",(req,res)=>{
  var phone = req.query.phone

  if(!phone.includes("+")){
    phone = '+'+req.query.phone.replace(/\s+/g, '')
  }else{
    phone.replace(' ','')
  }

  const result = schema.forget_password.validate({phone:phone})

  if(result.error){
      res.status(400).send({
          message: result.error.details[0].message
       });
      return
  }

  userExists(phone,
    (error)=>{
      res.status(500).send({message:error})
    },
    (facility)=>{
      sendCode(phone,res)
    },
    (individual)=>{
      sendCode(phone,res)
    },
    (staff)=>{
      sendCode(phone,res)
    },
    (human_resources)=>{
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    },
    (operation_panel)=>{
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    },
    (sales)=>{
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    },
    (notexist)=>{
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    })

})

app.post("/forget_password/confirmation",(req,res)=>{
  const code = req.query.code
  var phone = req.query.phone
  const password = req.query.new_password

  if(!phone.includes("+")){
    phone = '+'+req.query.phone.replace(/\s+/g, '')
  }else{
    phone.replace(' ','')
  }

  const result = schema.forget_password_confirm.validate({code,phone,password})

  if(result.error){
      res.status(400).send({
          message: result.error.details[0].message
       });
      return
  }

  userExists(phone,
    (error)=>{
      res.status(500).send({message:error})
    },
    (facility)=>{
      forgetPasswordConfirm(phone,code,`UPDATE facilites SET password = '${bcrypt.hashSync(password, 10)}' where phone LIKE '${phone}'`,res)
    },
    (individual)=>{
      forgetPasswordConfirm(phone,code,`UPDATE individuals SET password = '${bcrypt.hashSync(password, 10)}' where phone LIKE '${phone}'`,res)
    },
    (staff)=>{
      forgetPasswordConfirm(phone,code,`UPDATE staff SET password = '${bcrypt.hashSync(password, 10)}' where phone LIKE '${phone}'`,res)
    },
    (human_resources)=>{
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    },
    (operation_panel)=>{
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    },
    (sales)=>{
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    },
    (notexist)=>{
      //Check Code Verification
      res.status(409).send({message:`This number ${phone} not registerd as facility, individual or staff`})
    })

})

function forgetPasswordConfirm(phone,code,mysql,res){
  twilio.verify.services(service)
  .verificationChecks
  .create({to:phone, code: code})
  .then(verification_check =>{ 
    if(verification_check.status == "approved"){

      pool.query(mysql,(err,results,fields) =>{
        if(err){  
          res.status(500).send({message:err.sqlMessage})
          return
        }
        res.send({status:"success",message:"Password successfuly changed"})
    })
    
    }else{
      res.status(409).send({message:"Wrong code"})
    }
  })
  .catch(err => {
    res.status(409).send(err)
  });
}

module.exports = app;
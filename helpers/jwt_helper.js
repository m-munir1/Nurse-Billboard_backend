const jwt = require('jsonwebtoken')
require("dotenv").config();
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;


function signToken(user,accessToken,error){
    jwt.sign(user,JWT_SECRET_KEY,(err,token) => {
        if(err){
            error(err)
        }else{
            accessToken(token)
        }
    })
}

const verifyTokenAndPermission = (permissions)=>{
    return (req,res,next) =>{
        var token = req.header('authorization')
        if(!token) return res.status(401).send({message:"No authorization"}) 
        token = token.split(' ')[1]
        jwt.verify(token, JWT_SECRET_KEY, function(err, user) {
            if(err) return res.status(401).send({message:"wrong authorization"})
            if(!permissions.includes(`${user.roles}`)) return res.status(401).send({message:"You don't have permission!"})
            req.user = user
            next()
            });

    }
}

  
module.exports = {
    signToken,
    verifyTokenAndPermission};
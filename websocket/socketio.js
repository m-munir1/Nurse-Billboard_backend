require("dotenv").config();
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const  pool = require("../connection");
const jwt = require('jsonwebtoken')
var moment = require('moment');
const schema = require('../helpers/validation_schema/sockets/messages/messages')
const {verifyTokenAndPermission} = require("../helpers/jwt_helper");
const notification = require('../helpers/notifications')
const {estimatedLocationsTime} = require("../helpers/mapbox_helper")

var users = [];
var trackingUsers = [];

function socketIOmesages(app,io) {

    io.use(function(socket, next){
        if (socket.handshake.query && socket.handshake.query.token){
          jwt.verify(socket.handshake.query.token, JWT_SECRET_KEY, function(err, decoded) {
            if (err) return next(new Error('Authentication error'));
            if(!["staff","facility","individual"].includes(`${decoded.roles}`)) return next(new Error("You don't have permission!"))
            socket.user = decoded;
            next();
          });
        }
        else {
          next(new Error('Authentication error'));
        }    
      })

    io.on("connection", function (socket) {
        users[socket.user.phone] = socket.id;

        socket.on('send_message', (body) => {
            const result = schema.send_message_schema.validate(body)
            var reciverSeen = false
    
            if(result.error){
                return
            }
    
            const receiverSocketId = users[body.receiver];
            const senderSocketId = users[socket.user.phone];
            const current_time = moment().utcOffset(body.time_zone).format("YYYY-MM-DD HH:mm:ss")
            io.to(senderSocketId).emit("new_message", `{"message":"${body.message}","sender_phone":"${socket.user.phone}","receiver_phone":"${body.receiver}","message_date":"${current_time}"}`);
            io.to(receiverSocketId).emit("new_message", `{"message":"${body.message}","sender_phone":"${socket.user.phone}","receiver_phone":"${body.receiver}","message_date":"${current_time}"}`);
    
            if(!receiverSocketId){
                reciverSeen = false
            }else{
                reciverSeen = true
            }
    
            pool.query(`
            SELECT 
            (SELECT json_object('first_name',staff.first_name,'last_name',staff.last_name,'fcm_token',staff.fcm_token,'phone',staff.phone) FROM staff WHERE phone LIKE '${body.receiver}') as staff,
            (SELECT json_object('full_name',individuals.full_name,'fcm_token',individuals.fcm_token,'phone',individuals.phone) FROM individuals WHERE phone LIKE '${body.receiver}') as individual,
            (SELECT json_object('facility_name',facilites.facility_name,'fcm_token',facilites.fcm_token,'phone',facilites.phone) FROM facilites WHERE phone LIKE '${body.receiver}') as facility;
    
            INSERT INTO messages (message_date, message, sender_phone, receiver_phone, shift_id,receiver_seen) VALUES (CURRENT_TIMESTAMP, '${body.message.replace("'","''")}', '${socket.user.phone}', '${body.receiver}', ${body.shift_id},${reciverSeen});
            `,(err,rows,fields) =>{
                if(err){
                    console.log(err)
                    return
                    }
                io.to(receiverSocketId).emit("onMessagesScreen",`{"message":"${body.message}","shift_id":"${body.shift_id}","current_time":"${current_time}"}`);
    
                const staff = JSON.parse(rows[0][0].staff)
                const individual = JSON.parse(rows[0][0].individual)
                const facility = JSON.parse(rows[0][0].facility)      
    
    
                if(!users[body.receiver]){
    
                    if(["facility","individual"].includes(`${socket.user.roles}`)){
                        
                        if(staff != null){
                            notification.sendNotification(staff.fcm_token,`Message #${body.shift_id}`,`${staff.first_name}:${body.message}`)
                        }                    
                    }
                    else if(["staff"].includes(`${socket.user.roles}`)){
                        if(individual){
                            notification.sendNotification(individual.fcm_token,`HomeCare Message #${body.shift_id}`,`${individual.full_name}:${body.message}`)
                        }else if(facility){
                            notification.sendNotification(facility.fcm_token,`Facility Message #${body.shift_id}`,`${facility.facility_name}:${body.message}`)
                        }
                    }
                    
                }
        
            })  
    
        });

        socket.on('disconnect', () => {
            delete users[socket.user.phone];
        });
    
    });


    app.get("/messages",verifyTokenAndPermission(["staff","facility","individual"]),(req,res)=>{
    
        var time_zone = req.query.time_zone
        var staff_type = req.query.staff_type
    
        if(time_zone){
            if(!time_zone.includes("-")){
                time_zone = time_zone.replace(" ","+")
            }
        }
    
        const result = schema.time_zone.validate({time_zone})
    
        if(result.error){
            res.status(400).send({
                message: result.error.details[0].message
             });
            return
        }

        if (["staff"].includes(`${req.user.roles}`)) {
            if(staff_type != 'facility' && staff_type != 'individual'){
                res.status(400).send({
                    message: "Staff needs to define staff_type = (facility or individual)"
                 });
                 return
            }
        }

        switch(`${req.user.roles}`){
            case 'facility': getFacilityMessages(time_zone,res,req) 
            break;
            case 'individual': getIndividualMessages(time_zone,res,req)
            break;
            case 'staff': getStaffMessages(time_zone,res,req,staff_type)
            break;
        }
    
    })
    
    app.get("/messages/:phone",verifyTokenAndPermission(["staff","facility","individual"]),(req,res)=>{
    
        const otherPhone = req.params.phone
        const shift_id = req.query.shift_id
        var time_zone = req.query.time_zone
    
        if(time_zone){
            if(!time_zone.includes("-")){
                time_zone = time_zone.replace(" ","+")
            }
        }
        const result = schema.chatting.validate({otherPhone,shift_id,time_zone})
    
        if(result.error){
            res.status(400).send({
                message: result.error.details[0].message
             });
            return
        }
    
        pool.query(`
        SELECT * FROM messages WHERE
        sender_phone LIKE '${otherPhone}'
        AND receiver_phone LIKE '${req.user.phone}'
        AND shift_id = ${shift_id}
        or 
        sender_phone LIKE '${req.user.phone}' 
        AND receiver_phone LIKE '${otherPhone}'
        AND shift_id = ${shift_id}
        ORDER BY message_date ASC;

        UPDATE messages SET receiver_seen = true WHERE shift_id = ${shift_id} AND receiver_phone LIKE '${req.user.phone}';
        `,(err,rows,fields) =>{
            if(err){
                res.status(500).send({message:err.sqlMessage})
              return
            }
            const chatting = rows[0].map(row => (
            row.message_date = moment(row.message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss"),
            row.receiver_seen = ((row.receiver_seen == 0) ? false : true),
            row));
            res.send(chatting)
        })  
    
    })

}

function getFacilityMessages(time_zone,res,req) {
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
        row.shift_finished = ((row.shift_finished == 0) ? false : true),
        row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
        row.staff = JSON.parse(row.staff), 
        row.last_message = ((JSON.parse(row.last_message)) ? 
        JSON.parse(`{"message":"${JSON.parse(row.last_message).message}","message_date":"${moment(JSON.parse(row.last_message).message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")}","sender_phone":"${JSON.parse(row.last_message).sender_phone}","receiver_seen":"${((JSON.parse(row.last_message).receiver_seen == 0) ? false : true)}","receiver_phone":"${JSON.parse(row.last_message).receiver_phone}"}`) : JSON.parse(row.last_message)),
        row));
        res.send(rows)
        
    })  

}

function getIndividualMessages(time_zone,res,req) {
    pool.query(`
    SELECT id , role, shift_finished, shift_cancelled ,individual_id, staff_hired_id,
    (SELECT json_object('first_name',staff.first_name,'last_name',staff.last_name,'phone',staff.phone)  
    FROM staff WHERE id = individual_shifts.staff_hired_id) as staff,
    (SELECT json_object('message_date',messages.message_date,'message',messages.message,'sender_phone',messages.sender_phone,'receiver_phone',messages.receiver_phone,'receiver_seen',messages.receiver_seen)  
    FROM messages WHERE 
    sender_phone LIKE (SELECT phone FROM staff WHERE id = individual_shifts.staff_hired_id) 
    AND receiver_phone LIKE '${req.user.phone}'
    AND shift_id = individual_shifts.id
    or 
    sender_phone LIKE '${req.user.phone}' 
    AND receiver_phone LIKE (SELECT phone FROM staff WHERE id = individual_shifts.staff_hired_id) 
    AND shift_id = individual_shifts.id
    ORDER BY message_date DESC LIMIT 1) as last_message,
    (SELECT COUNT(*) FROM messages WHERE shift_id = individual_shifts.id AND receiver_phone LIKE '${req.user.phone}' AND receiver_seen = false) as unread_messages
    FROM individual_shifts WHERE individual_id = (SELECT id FROM individuals WHERE phone LIKE '${req.user.phone}') AND staff_hired_id is not null HAVING shift_finished = false AND shift_cancelled = false;
    `,(err,rows,fields) =>{
        if(err){
            res.status(500).send({message:err.sqlMessage})
          return
        }

        rows = rows.map(row => (
        row.shift_finished = ((row.shift_finished == 0) ? false : true),
        row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
        row.staff = JSON.parse(row.staff), 
        row.last_message = ((JSON.parse(row.last_message)) ? 
        JSON.parse(`{"message":"${JSON.parse(row.last_message).message}","message_date":"${moment(JSON.parse(row.last_message).message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")}","sender_phone":"${JSON.parse(row.last_message).sender_phone}","receiver_seen":"${((JSON.parse(row.last_message).receiver_seen == 0) ? false : true)}","receiver_phone":"${JSON.parse(row.last_message).receiver_phone}"}`) : JSON.parse(row.last_message)),
        row));
        res.send(rows)
        
    })  
}

function getStaffMessages(time_zone,res,req,staff_type) {
    switch (staff_type) {
        case 'facility':
            pool.query(`
            SELECT id, shift_finished,shift_cancelled ,facility_id, staff_hired_id, 
            (SELECT json_object('facility_name',facilites.facility_name,'phone',facilites.phone)  
            FROM facilites WHERE id = facility_shifts.facility_id) as facility,
            (SELECT json_object('message_date',messages.message_date,'message',messages.message,'sender_phone',messages.sender_phone,'receiver_phone',messages.receiver_phone,'receiver_seen',messages.receiver_seen)  
            FROM messages WHERE 
            sender_phone LIKE (SELECT phone FROM facilites WHERE id = facility_shifts.facility_id) 
            AND receiver_phone LIKE '${req.user.phone}'
            AND shift_id = facility_shifts.id
            or 
            sender_phone LIKE '${req.user.phone}' 
            AND receiver_phone LIKE (SELECT phone FROM facilites WHERE id = facility_shifts.facility_id)
            AND shift_id = facility_shifts.id
            ORDER BY message_date DESC LIMIT 1) as last_message,
            (SELECT COUNT(*) FROM messages WHERE shift_id = facility_shifts.id AND receiver_phone LIKE '${req.user.phone}' AND receiver_seen = false) as unread_messages
            FROM facility_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
            `,(err,rows,fields) =>{
    
                if(err){
                    res.status(500).send({message:err.sqlMessage})
                  return
                }
    
                rows = rows.map(row => (
                    row.shift_finished = ((row.shift_finished == 0) ? false : true),
                    row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                    row.facility = JSON.parse(row.facility), 
                    row.last_message = ((JSON.parse(row.last_message)) ? 
                    JSON.parse(`{"message":"${JSON.parse(row.last_message).message}","message_date":"${moment(JSON.parse(row.last_message).message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")}","sender_phone":"${JSON.parse(row.last_message).sender_phone}","receiver_seen":"${((JSON.parse(row.last_message).receiver_seen == 0) ? false : true)}","receiver_phone":"${JSON.parse(row.last_message).receiver_phone}"}`) : JSON.parse(row.last_message)),
                    row));
                    res.send(rows)
                
            })      
            break;
    
        case 'individual':
            pool.query(`
            SELECT id, shift_finished,shift_cancelled ,individual_id, staff_hired_id, 
            (SELECT json_object('full_name',individuals.full_name,'phone',individuals.phone)  
            FROM individuals WHERE id = individual_shifts.individual_id) as individual,
            (SELECT json_object('message_date',messages.message_date,'message',messages.message,'sender_phone',messages.sender_phone,'receiver_phone',messages.receiver_phone,'receiver_seen',messages.receiver_seen)  
            FROM messages WHERE 
            sender_phone LIKE (SELECT phone FROM individuals WHERE id = individual_shifts.individual_id) 
            AND receiver_phone LIKE '${req.user.phone}'
            AND shift_id = individual_shifts.id
            or 
            sender_phone LIKE '${req.user.phone}' 
            AND receiver_phone LIKE (SELECT phone FROM individuals WHERE id = individual_shifts.individual_id)
            AND shift_id = individual_shifts.id 
            ORDER BY message_date DESC LIMIT 1) as last_message,
            (SELECT COUNT(*) FROM messages WHERE shift_id = individual_shifts.id AND receiver_phone LIKE '${req.user.phone}' AND receiver_seen = false) as unread_messages
            FROM individual_shifts WHERE staff_hired_id = (SELECT id FROM staff WHERE phone LIKE '${req.user.phone}') HAVING shift_finished = false AND shift_cancelled = false;
            `,(err,rows,fields) =>{
                if(err){
                    res.status(500).send({message:err.sqlMessage})
                  return
                }
    
                rows = rows.map(row => (
                row.shift_finished = ((row.shift_finished == 0) ? false : true),
                row.shift_cancelled = ((row.shift_cancelled == 0) ? false : true),
                row.individual = JSON.parse(row.individual), 
                row.last_message = ((JSON.parse(row.last_message)) ? 
                JSON.parse(`{"message":"${JSON.parse(row.last_message).message}","message_date":"${moment(JSON.parse(row.last_message).message_date).utcOffset(time_zone).format("YYYY-MM-DD HH:mm:ss")}","sender_phone":"${JSON.parse(row.last_message).sender_phone}","receiver_seen":"${((JSON.parse(row.last_message).receiver_seen == 0) ? false : true)}","receiver_phone":"${JSON.parse(row.last_message).receiver_phone}"}`) : JSON.parse(row.last_message)),
                row));
                res.send(rows)
                
            })  
            break;
    }
}

function socketIOtracking(ioTracking) {

    ioTracking.use(function(socket, next){
        if (socket.handshake.query && socket.handshake.query.token){
          jwt.verify(socket.handshake.query.token, JWT_SECRET_KEY, function(err, decoded) {
            if (err) return next(new Error('Authentication error'));
            if(!["staff","facility","individual"].includes(`${decoded.roles}`)) return next(new Error("You don't have permission!"))
            socket.user = decoded;
            next();
          });
        }
        else {
          next(new Error('Authentication error'));
        }    
      })
      
    ioTracking.on("connection", function (socket) {
        trackingUsers[socket.user.phone] = socket.id;

        socket.on('onStaffWay',(body)=>{

            if(body.time_zone){
                if(!body.time_zone.includes("-")){
                    body.time_zone = body.time_zone.replace(" ","+")
                }
            }
            const result = schema.tracking.validate(body)
        
            if(result.error){
                return
            }
    
            var clientSocketId = trackingUsers[body.client_phone]; 
    
            estimatedLocationsTime({
                staff_long:body.staff_long,
                staff_lat:body.staff_lat,
                client_long:body.client_long,
                client_lat:body.client_lat})
            .then(response => {
                ioTracking.to(clientSocketId).emit("onClientWait",`{"staff_lat":"${body.staff_lat}","staff_long":"${body.staff_long}","client_street_name":"${((response.data.destinations[1])? ((response.data.destinations[1].name)? response.data.destinations[1].name : "Unkown Street" ) : "Unkown Street" )}","staff_street_name":"${ ((response.data.destinations[0])? ((response.data.destinations[0].name)? response.data.destinations[0].name : "Unkown Street")  : "Unkown Street" )}","estimated_time":"${((response.data.durations[0])? moment(moment(new Date()).add(Math.round(((response.data.durations[0])? response.data.durations[0][1]/60 : 0 )),'minutes')).utcOffset(body.time_zone).format('yyyy-MM-DD HH:mm a') : "2022-01-01 01:00 am" )}","arrive_in":"${((response.data.durations[0])? Math.round(response.data.durations[0][1]/60) : 0 ) }"}`)                
            }).catch(err => {
                res.status(500).send({message:'Something went wrong'})
            });

        })

        socket.on('disconnect', () => {
            delete trackingUsers[socket.user.phone];
        });
      
      });

}

module.exports = {
    socketIOmesages,
    socketIOtracking
};
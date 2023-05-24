const express = require("express");
const app = express();
require("dotenv").config();
const {verifyTokenAndPermission} = require("./helpers/jwt_helper");
const {retriveSuggestions} = require("./helpers/mapbox_helper")
var moment = require('moment');
const cors = require('cors')
const schedule = require("./schedules/schedule")
const NURSEBILLBOARD_EMAIL = process.env.NURSEBILLBOARD_EMAIL;
const DEV_PRODUCTION = process.env.DEV_PRODUCTION;
const emails = require("./helpers/emaills")
const websockets = require("./websocket/socketio")
const io = require('socket.io')

if(DEV_PRODUCTION == 'dev'){
  //Development
  
}else{
  //Production
  schedule.scheduleShifts()
  schedule.scheduleInvoices()

}

app.use(express.json({limit: '25mb'}));
app.use(express.urlencoded({limit: '25mb', extended: true}));
const cors_init = ['http://www.nursebillboard.com' ,'http://localhost:4201', 'http://localhost:4200','http://nursebillboard.com','https://nursebillboard.com','https://www.nursebillboard.com','https://api.nursebillboard.com','http://api.nursebillboard.com']
app.use(cors({
  origin: cors_init
}))

//WebSocket Chatting
const server = require('http').createServer(app)
const messagesSocket = io(server,{path:'/message'})
const trackingSocket = io(server,{path:'/tracking'})  
websockets.socketIOmesages(app,messagesSocket)
websockets.socketIOtracking(trackingSocket)


//Client
const IndividualsRoute = require("./routes/client/individual/individuals");
const ShiftsIndividualRoute = require("./routes/client/individual/shifts");
const FacilitesRoute = require("./routes/client/facility/facilites");
const authentication_register_admin = require("./routes/admin/auth_admin");
const authentication = require("./routes/authentication");
const humanResourcesDashboard = require("./routes/admin/human_resource/dashboard/dashboard");
const humanResourcesPayroll = require("./routes/admin/human_resource/payroll/payroll");
const humanResourcesEmployees = require("./routes/admin/human_resource/employees/employees");
const humanResourcesRecruitment = require("./routes/admin/human_resource/recruitment/recruitment");
const humanResourcesAccount = require("./routes/admin/human_resource/account/account");


const operationPanelDashboard = require("./routes/admin/operation_panel/dashboard/dashboard");
const operationPanelFacilityDashboard = require("./routes/admin/operation_panel/facility_dashboard/facility_dashboard");
const operationPanelReportedShifts = require("./routes/admin/operation_panel/reported_shifts/reported_shifts");
const operationPanelCanceledShifts = require("./routes/admin/operation_panel/canceled_shifts/canceled_shifts");

const salesHome = require("./routes/admin/sales/home/home");
const salesFacilityLeads = require("./routes/admin/sales/facility_leads/facility_leads");
const salesApproveFacility = require("./routes/admin/sales/approve_facility/approve_facility");

//Staff
const StaffRoute = require("./routes/staff/staff");

//Routes Client
app.use("/individuals",IndividualsRoute);
app.use("/facilities",FacilitesRoute);
app.use("/staff",StaffRoute);

//Shifts
app.use("/individual_shifts",ShiftsIndividualRoute);

//Register, Login
app.use("/authentication",authentication);
app.use("/auth_admin",authentication_register_admin);

//ADMIN human resources
app.use("/human_resources/dashboard",humanResourcesDashboard);
app.use("/human_resources/payroll",humanResourcesPayroll);
app.use("/human_resources/employees",humanResourcesEmployees);
app.use("/human_resources/recruitment",humanResourcesRecruitment);
app.use("/human_resources/account",humanResourcesAccount);

//ADMIN Operation panel
app.use("/operation_panel/dashboard",operationPanelDashboard);
app.use("/operation_panel/facility_dashboard",operationPanelFacilityDashboard);
app.use("/operation_panel/reported_shifts",operationPanelReportedShifts);
app.use("/operation_panel/canceled_shifts",operationPanelCanceledShifts);

//Sales panel
app.use("/sales/home",salesHome);
app.use("/sales/facility_leads",salesFacilityLeads);
app.use("/sales/approve_facility",salesApproveFacility);

app.get("/requirements/:filename",verifyTokenAndPermission(["staff","human_resources","operation_panel"]),(req,res)=>{
    res.sendFile(`./requirements/${req.params.filename}`, { root: __dirname }) 
})

app.get("/profile-pics/:filename",verifyTokenAndPermission(["staff","human_resources","operation_panel","facility","individual"]),(req,res)=>{
  res.sendFile(`./profilepictures/${req.params.filename}`, { root: __dirname }) 
})

app.get("/contracts/:filename",verifyTokenAndPermission(["facility"]),(req,res)=>{
  res.sendFile(`./contracts/${req.params.filename}`, { root: __dirname }) 
})

app.get("/",verifyTokenAndPermission(["admin","human_resources","operation_panel"]),(req,res)=>{
    res.send({nessage:"Api working.",time_now:moment().format("YYYY-MM-DD HH:mm:ss")}) 
})

//,verifyTokenAndPermission(["facility","individual","staff","operation_panel"])
app.get("/location-suggestions",(req,res)=>{

    const search = req.query.search

    var locations = []

    retriveSuggestions(search)
    .then(response => 
        {

          response.data.features.forEach(row => {
            const id = row.id
            const place_name_en = row.place_name_en
            const place_name = row.place_name
            const latitude = row.center[1]
            const longitude = row.center[0]
            const city = row.context.map((cont => (
              ((cont.id.includes("place"))? cont.text_en : null)
              ))).join("")

            const state = row.context.map((cont => (
              ((cont.id.includes("region"))? cont.text_en : null)
              ))).join("")

            const postal_code = row.context.map((cont => (
              ((cont.id.includes("postcode"))? cont.text_en : null)
              ))).join("")

            const country = row.context.map((cont => (
              ((cont.id.includes("country"))? cont.short_code : null)
              ))).join("")

            if(latitude && longitude && city && state && postal_code && country){
              locations.push({
                id,
                place_name_en,
                place_name,
                latitude,
                longitude,
                city,
                state,
                postal_code,
                country
              })
            }

          });

            res.send(locations)
        }
      )
      .catch(err => {
          res.status(err.status).send(err.message)
      });
})

app.post("/contact",(req,res)=>{
  const first_name = req.query.first_name
  const last_name = req.query.last_name
  const company = req.query.company
  const email = req.query.email
  const message = req.query.message

  if(!first_name && !last_name && email && message){
    res.status(400).send({message:"Provide the required fields"})
    return
  }

  emails.sendContactUsEmail(NURSEBILLBOARD_EMAIL,'acewynalda@gmail.com',`Email From ${email}`,`first name: ${first_name} \nLast name: ${last_name} \ncompany:${company}\nemail: ${email} \n\n${message}`,
  (error)=>{
    res.status(500).send({status:"success", error})
  },
  (response)=>{
    res.send({status:"success", message:"Message sent successfully"})
  })

})


if(DEV_PRODUCTION == 'dev'){
  //Development
  server.listen(3000,()=> console.log("Listening on port: " + 3000))
}else{
  //Production
  server.listen()
}
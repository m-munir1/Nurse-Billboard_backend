const express = require("express");
const app = express.Router();
const pool = require("../../../../connection");
const {verifyTokenAndPermission} = require("../../../../helpers/jwt_helper");
const { sendNotification } = require('../../../../helpers/notifications')
const {compelete_interview, schedule_oreintation,compelete_oreintation,requirements, requirementSchema, requirementApprove} = require('../../../../helpers/validation_schema/admin/human_resources/recruitment');
var fs = require('fs');

app.get("/healthcare/new-leads",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    pool.query(`SELECT * FROM staff WHERE account_approved = false AND oreintation = false and on_boarding = false and phone_interview = false`,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({password, ...row}) => (
            row.account_approved = ((row.account_approved == 0) ? false : true),
            row.on_boarding = ((row.on_boarding == 0) ? false : true),
            row.oreintation = ((row.oreintation == 0) ? false : true),
            row.phone_interview = ((row.phone_interview == 0) ? false : true),
            row));
        res.send(rows) 
    })

})

app.get("/healthcare/staff/:id",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.params.id

    pool.query(`SELECT * FROM staff WHERE id = ${staff_id}`,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({password, ...row}) => (
            row.account_approved = ((row.account_approved == 0) ? false : true),
            row.on_boarding = ((row.on_boarding == 0) ? false : true),
            row.oreintation = ((row.oreintation == 0) ? false : true),
            row.phone_interview = ((row.phone_interview == 0) ? false : true),
            row));
        res.send(rows) 
    })

})

//Phone Interview
app.post("/healthcare/compelete-interview",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.query.staff_id
    const notes = req.query.notes
    
    const result = compelete_interview.validate({staff_id,notes})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    UPDATE staff SET phone_interview = true WHERE id = ${staff_id};
    INSERT INTO staff_interview(notes,interview_date,staff_id) values('${notes}',CURRENT_TIMESTAMP,${staff_id})
    `,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        res.send({status:"success",message:"Staff Phone Interview passed"}) 
    })
})

//Oreintation
app.get("/healthcare/oreintation",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    pool.query(`SELECT * FROM staff WHERE account_approved = false AND oreintation = false AND on_boarding = true AND phone_interview = true AND
    (SELECT staff_id FROM staff_orientations WHERE staff_id = staff.id) is null;`,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({password, ...row}) => (
            row.account_approved = ((row.account_approved == 0) ? false : true),
            row.on_boarding = ((row.on_boarding == 0) ? false : true),
            row.oreintation = ((row.oreintation == 0) ? false : true),
            row.phone_interview = ((row.phone_interview == 0) ? false : true),
            row));
        res.send(rows)

    })

})

app.get("/healthcare/scheduled-oreintation",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    pool.query(`
    SELECT * FROM staff WHERE account_approved = false AND oreintation = false AND on_boarding = true AND phone_interview = true AND
    (SELECT staff_id FROM staff_orientations WHERE staff_id = staff.id) is not null;
    `,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({password, ...row}) => (
            row.account_approved = ((row.account_approved == 0) ? false : true),
            row.on_boarding = ((row.on_boarding == 0) ? false : true),
            row.oreintation = ((row.oreintation == 0) ? false : true),
            row.phone_interview = ((row.phone_interview == 0) ? false : true),
            row));
        res.send(rows)

    })

})

app.post("/healthcare/schedule-oreintation",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.query.staff_id
    const meeting_url = req.query.meeting_url
    const orientation_date = req.query.orientation_date

    const result = schedule_oreintation.validate({staff_id,meeting_url,orientation_date})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT * FROM staff WHERE id = ${staff_id} AND account_approved = false AND phone_interview = true AND on_boarding = true AND oreintation = false;
    `,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(!rows[0]){
            res.status(404).send({message:"Staff should done interview and onboarding first or its already approved."})
            return
        }

        pool.query(`
        INSERT INTO staff_orientations(meeting_url,orientation_date,staff_id) values('${meeting_url}','${orientation_date}',${staff_id})
        `,(err,rows,fields) =>{
            if(err){ 
                res.status(500).send({message:err.sqlMessage})
                return
            }
    
            res.send({status:"success",message:"Meeting Scheduled successfully"}) 
        })

    })
})

app.post("/healthcare/compelete-oreintation",verifyTokenAndPermission(["human_resources"]),(req,res)=>{ 

    const staff_id = req.query.staff_id

    const result = compelete_oreintation.validate({staff_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`
    SELECT *,
    (SELECT stripe_account FROM staff_requirements WHERE staff_id = staff.id) as stripe_account
    FROM staff WHERE id = ${staff_id} AND account_approved = false AND phone_interview = true AND on_boarding = true AND oreintation = false;
    `,(err,staff,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        if(!staff[0]){
            res.status(404).send({message:"Staff should done interview and onboarding first or its already approved."})
            return 
        }

        if(!staff[0].stripe_account){
            res.status(404).send({message:"Staff should have payment account."})
            return 
        }

        pool.query(`
        UPDATE staff SET phone_interview = true, account_approved = true WHERE id = ${staff_id};
        UPDATE staff_orientations SET orientation_approved_date = CURRENT_TIMESTAMP WHERE staff_id = ${staff_id};
        INSERT INTO staff_notifications(title,body,staff_id,date) values('Account Approved','Congratulations, your account approved',${staff[0].id},CURRENT_TIMESTAMP);
        `,(err,rows,fields) =>{
            if(err){ 
                res.status(500).send({message:err.sqlMessage})
                return
            }
    
            sendNotification(staff[0].fcm_token,'Account Approved',`Congratulations, your account approved`)
            res.send({status:"success",message:"Staff successfully approved"}) 
        })

    })
})

//Requirements
app.get("/healthcare/onboarding",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    pool.query(`SELECT * FROM staff WHERE account_approved = false AND on_boarding = false`,(err,rows,fields) =>{
        if(err){ 
            res.status(500).send({message:err.sqlMessage})
            return
        }

        rows = rows.map(({password, ...row}) => (
            row.on_boarding = ((row.on_boarding == 0) ? false : true),
            row.oreintation = ((row.oreintation == 0) ? false : true),
            row.phone_interview = ((row.phone_interview == 0) ? false : true),
            row));
        res.send(rows)

    })

})

app.get("/healthcare/requirements",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.query.staff_id

    const result = requirements.validate({staff_id})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    pool.query(`SELECT *,
    (SELECT phone_interview FROM staff WHERE id = ${staff_id}) as phone_interview ,
    (SELECT on_boarding FROM staff WHERE id = ${staff_id}) as on_boarding ,
    (SELECT oreintation FROM staff WHERE id = ${staff_id}) as oreintation, 
    (SELECT register_date FROM staff WHERE id = ${staff_id}) as register_date,
    (SELECT staff.account_approved FROM staff WHERE id = ${staff_id}) as account_approved 
    FROM staff_requirements WHERE staff_id = ${staff_id}`,(err,rows,fields) =>{
        if(!err){ 
            if(rows.length){
                res.send({
                    stripe_account:rows[0].stripe_account,
                    account_approved:((rows[0].account_approved == 0) ? false : true),
                    phone_interview:((rows[0].phone_interview == 0) ? false : true),
                    on_boarding:((rows[0].on_boarding == 0) ? false : true),
                    oreintation:((rows[0].oreintation == 0) ? false : true),
                    register_date:rows[0].register_date ,
                    requirements:{
                        nursing_certificate:{
                            name:'Nursing certificate',
                            document:((fs.existsSync(`requirements/${rows[0].nursing_certificate}`))? fs.readFileSync(`requirements/${rows[0].nursing_certificate}`, 'base64') : null),
                            approved:((rows[0].nursing_certificate_approved == 0) ? false : true),
                            pending:((rows[0].nursing_certificate && rows[0].nursing_certificate_approved == 0) ? true : false)
                        },
                        driver_license:{
                            name:'Driver license',
                            document:((fs.existsSync(`requirements/${rows[0].driver_license}`))? fs.readFileSync(`requirements/${rows[0].driver_license}`, 'base64') : null ),
                            approved:((rows[0].driver_license_approved == 0) ? false : true),
                            pending:((rows[0].driver_license && rows[0].driver_license_approved == 0) ? true : false)
                        },
                        backgroundCheck:{
                            name:'Background Check',
                            document:((fs.existsSync(`requirements/${rows[0].backgroundCheck_approved}`))? fs.readFileSync(`requirements/${rows[0].backgroundCheck_approved}`, 'base64') : null ),
                            approved:((rows[0].backgroundCheck_approved == 0) ? false : true),
                            pending:((rows[0].backgroundCheck && rows[0].backgroundCheck_approved == 0) ? true : false)
                        },
                        physical:{
                            name:'Physical',
                            document:((fs.existsSync(`requirements/${rows[0].physical}`))? fs.readFileSync(`requirements/${rows[0].physical}`, 'base64') : null ),
                            approved:((rows[0].physical_approved == 0) ? false : true),
                            pending:((rows[0].physical && rows[0].physical_approved == 0) ? true : false)
                        },
                        tb_test:{
                            name:'Tb test',
                            document:((fs.existsSync(`requirements/${rows[0].tb_test}`))? fs.readFileSync(`requirements/${rows[0].tb_test}`, 'base64') : null ),
                            approved:((rows[0].tb_test_approved == 0) ? false : true),
                            pending:((rows[0].tb_test && rows[0].tb_test_approved == 0) ? true : false)
                        },
                        blsCpr:{
                            name:'BLS or CPR',
                            document:((fs.existsSync(`requirements/${rows[0].blsCpr}`))? fs.readFileSync(`requirements/${rows[0].blsCpr}`, 'base64') : null ),
                            approved:((rows[0].blsCpr_approved == 0) ? false : true),
                            pending:((rows[0].blsCpr && rows[0].blsCpr_approved == 0) ? true : false)
                        },
                        vaccinations:{
                            name:'Vaccinations',
                            document:((fs.existsSync(`requirements/${rows[0].vaccinations}`))? fs.readFileSync(`requirements/${rows[0].vaccinations}`, 'base64') : null ),
                            approved:((rows[0].vaccinations_approved == 0) ? false : true),
                            pending:((rows[0].vaccinations && rows[0].vaccinations_approved == 0) ? true : false)
                        },
                        covid_vaccine_declination:{
                            name:'Vovid vaccine declination',
                            document:((fs.existsSync(`requirements/${rows[0].covid_vaccine_declination}`))? fs.readFileSync(`requirements/${rows[0].covid_vaccine_declination}`, 'base64') : null ),
                            approved:((rows[0].covid_vaccine_declination_approved == 0) ? false : true),
                            pending:((rows[0].covid_vaccine_declination && rows[0].covid_vaccine_declination_approved == 0) ? true : false)
                        },            
                        oig_gsa:{
                            name:'OIG (with LEIE), GSA',
                            document:((fs.existsSync(`requirements/${rows[0].oig_gsa}`))? fs.readFileSync(`requirements/${rows[0].oig_gsa}`, 'base64') : null ),
                            approved:((rows[0].oig_gsa_approved == 0) ? false : true),
                            pending:((rows[0].oig_gsa && rows[0].oig_gsa_approved == 0) ? true : false)
                        },
                        skills_assessment:{
                            name:'Skills assessment',
                            document:((fs.existsSync(`requirements/${rows[0].skills_assessment}`))? fs.readFileSync(`requirements/${rows[0].skills_assessment}`, 'base64') : null ),
                            approved:((rows[0].skills_assessment_approved == 0) ? false : true),
                            pending:((rows[0].skills_assessment && rows[0].skills_assessment_approved == 0) ? true : false)
                        }
                    }
                })
            }else{        
                res.send(
                    {
                        stripe_account:null,
                        account_approved:false,
                        phone_interview:false,
                        on_boarding:false,
                        oreintation:false,
                        register_date:null,
                        requirements:{
                            nursing_certificate:{
                                name:'Nursing certificate',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            driver_license:{
                                name:'Driver license',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            backgroundCheck:{
                                name:'Background Check',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            physical:{
                                name:'Physical',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            tb_test:{
                                name:'Tb test',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            blsCpr:{
                                name:'BLS or CPR',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            vaccinations:{
                                name:'Vaccinations',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            covid_vaccine_declination:{
                                name:'Vovid vaccine declination',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            oig_gsa:{
                                name:'OIG (with LEIE), GSA',
                                document:null,
                                approved:false,
                                pending:false
                            },
                            skills_assessment:{
                                name:'Skills assessment',
                                document:null,
                                approved:false,
                                pending:false
                            }
                        }
                    })
            }  
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.get("/healthcare/requirements/:requirement",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.query.staff_id
    const requirement = req.params.requirement

    const result = requirementSchema.validate({staff_id,requirement})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }

    if(requirement != "nursing_certificate" && 
    requirement != "driver_license" && 
    requirement != "backgroundCheck" && 
    requirement != "physical" && 
    requirement != "tb_test" && 
    requirement != "blsCpr" && 
    requirement != "vaccinations" && 
    requirement != "covid_vaccine_declination"&& 
    requirement != "live_scan"&& 
    requirement != "covid_test"&& 
    requirement != "oig_gsa"&& 
    requirement != "skills_assessment"){
        return res.status(400).send({message:"There's no requriement with this name"})
    }

    pool.query(`
    SELECT 
    ${requirement} as document_url, 
    ${requirement}_approved as approved
    FROM staff_requirements WHERE staff_id = ${staff_id};
    `,(err,rows,fields) =>{
        if(!err){  
            if(!rows[0]) return res.status(404).send({message:`${req.params.requirement} not a requirement`})
            rows = rows.map(row => (
            row.approved = ((row.approved == 0) ? false : true),
            row.pending = ((row.document_url && row.approved == 0) ? true : false),
            row));
            res.send(rows[0])
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})

app.post("/healthcare/requirements/:requirement",verifyTokenAndPermission(["human_resources"]),(req,res)=>{

    const staff_id = req.query.staff_id
    const approved = req.query.approved
    const requirement = req.params.requirement

    const result = requirementApprove.validate({staff_id,approved,requirement})

    if(result.error){
        res.status(400).send({
            message: result.error.details[0].message
         });
        return
    }


    if(requirement != "nursing_certificate" && 
    requirement != "driver_license" && 
    requirement != "backgroundCheck" && 
    requirement != "physical" && 
    requirement != "tb_test" && 
    requirement != "blsCpr" && 
    requirement != "vaccinations" && 
    requirement != "covid_vaccine_declination"&& 
    requirement != "live_scan"&& 
    requirement != "covid_test"&& 
    requirement != "oig_gsa"&& 
    requirement != "skills_assessment"){
        return res.status(400).send({message:"There's no requriement with this name"})
    }

    pool.query(`
    SELECT fcm_token FROM staff WHERE id = ${staff_id};

    UPDATE staff_requirements SET 
    ${requirement} = case when ${approved} = true then ${requirement} else null end ,
    ${requirement}_approved = case when ${approved} = true then true else false end
    WHERE staff_id = ${staff_id};

    INSERT INTO staff_notifications(title,body,staff_id,date) 
    values(case when ${approved} = true then 'Document Approved' else 'Document Rejected' end,
    case when ${approved} = true then 'Document ${requirement} is Approved.' else 'Document ${requirement} is rejected submit another one.' end,
    '${staff_id}',CURRENT_TIMESTAMP);
    `,(err,rows,fields) =>{
        if(!err){  
            if(approved){
                sendNotification(rows[0][0].fcm_token,'Document Approved',`Document ${requirement} is Approved`)
            }else{
                sendNotification(rows[0][0].fcm_token,"Document Rejected",`Document ${requirement} is rejected submit another one.`)
            }
            res.send({success:rows[0][0].fcm_token})
        }else{
            res.status(500).send({message:err.sqlMessage})
        }
    })

})


module.exports = app;
const pool = require("../connection");

function userExists(phone,error,facility,individual,staff,human_resources,operation_panel,sales,notexist){
    pool.query(`SELECT 
    (SELECT password FROM human_resources WHERE phone LIKE '${phone}') as human_resources_password,
    (SELECT password FROM operation_panel WHERE phone LIKE '${phone}') as operation_panel_password,
    (SELECT password FROM sales WHERE phone LIKE '${phone}') as sales_password,
    (SELECT password FROM facilites WHERE phone LIKE '${phone}') as facility_password,
    if((SELECT contract_pdf FROM facilites WHERE phone LIKE '${phone}') is not null,true,false) as contract_submitted,
    (SELECT password FROM individuals WHERE phone LIKE '${phone}') as individual_password,
    (SELECT password FROM staff WHERE phone LIKE '${phone}') as staff_password;`,(err,results,fields) =>{
        if(!err){  
            if(results[0].facility_password){
                facility({password:results[0].facility_password,contract_submitted:results[0].contract_submitted})
                return
            }else if (results[0].individual_password){
                individual({password:results[0].individual_password})
                return
            }else if(results[0].staff_password){
                staff({password:results[0].staff_password})
                return
            }else if(results[0].human_resources_password){
                human_resources({password:results[0].human_resources_password})
                return
            }else if(results[0].operation_panel_password){
                operation_panel({password:results[0].operation_panel_password})
                return
            }else if(results[0].sales_password){
                sales({password:results[0].sales_password})
            }
            else{
                notexist(`The phone number ${phone} is not registered`)
            }
        }else{
            error(err.sqlMessage)
        }
    })
}

module.exports = {
    userExists
}

var PDFLib = require('pdf-lib') 
const fs = require('fs') 
var moment = require('moment');

const run = async ({ pathToPDF, pathToEmployeeSignature, body},response) => {

    //Read Files
    const pdfDoc = await PDFLib.PDFDocument.load(fs.readFileSync(pathToPDF));

    addFieldds(pdfDoc,body,pathToEmployeeSignature)

    const pdfBytes = await pdfDoc.save();
    fs.writeFile(`timesheets/${body.shift_id}sheet.pdf`,pdfBytes, function (error) {
        if(!body.auto_clockout){
            fs.unlinkSync(pathToEmployeeSignature)
        }
        if(error){
            console.log("error")
            return
        }
        response("success")
    })

}

async function addFieldds(filledPdfDoc,body,pathToEmployeeSignature) {

    const form = filledPdfDoc.getForm();
    const fields = form.getFields();
    const timesRomanItalic = await filledPdfDoc.embedFont(PDFLib.StandardFonts.TimesRomanItalic) //TimesRomanItalic

    filledPdfDoc.getPages()[0].drawText(`${body.staff_first_name} ${body.staff_last_name}`, {
        x: 600.11,
        y: 367.33,
        size: 12,
        font: timesRomanItalic,
        })

    filledPdfDoc.getPages()[0].drawText(`${moment(body.clockin_time).format('MM-DD-YYYY HH:mm')}/\n${moment(body.clockout_time).format('MM-DD-YYYY HH:mm')}`, {
        x: 417.68,
        y: 370.94,
        size: 8,
        lineHeight: 10,
        font: timesRomanItalic
    })

    //7 -> 13  = 1 // 13 -> 23 = 2 // 23 -> 7

    const start_hour = moment(body.start_time).format("HH:mm")

    const periodOneStart = moment("07:00", "HH:mm").toDate()
    const periodOneEnd = moment("13:00", "HH:mm").toDate()

    const periodTwoStart = moment("13:00", "HH:mm").toDate()
    const periodTwoEnd = moment("23:00", "HH:mm").toDate()

    const periodThreeStart = moment("23:00", "HH:mm").toDate()
    const periodThreeEnd = moment("24:00", "HH:mm").toDate()

    const periodFourStart = moment("00:00", "HH:mm").toDate()
    const periodFourEnd = moment("07:00", "HH:mm").toDate()

    if(moment(start_hour,'HH:mm').isBetween(periodOneStart,periodOneEnd,'hours','[)')){
        form.getRadioGroup("Shift1").select("Choice1")
    }else if(moment(start_hour,'HH:mm').isBetween(periodTwoStart,periodTwoEnd,'hours','[)')){
        form.getRadioGroup("Shift2").select("Choice2")
    }else if(moment(start_hour,'HH:mm').isBetween(periodThreeStart,periodThreeEnd,'hours','[)')){
        form.getRadioGroup("Shift3").select("Choice3")
    }else if(moment(start_hour,'HH:mm').isBetween(periodFourStart,periodFourEnd,'hours','[)')){
        form.getRadioGroup("Shift3").select("Choice3")
    }
    else{
        console.log("none of above shfit time choice")
    }
   

    fields.forEach(field => {

        if (field instanceof PDFLib.PDFTextField) {
                
            field.getName() === '1 FACILITY NAME' && field.setText(` ${body.facility_name}`);
            field.getName() === '2 DATE OF PATIENT DAY MMDDYY' && field.setText(` ${moment(body.start_time).format('MM-DD-YYYY')}`);
            field.getName() === '3 DIRECTOR OF NURSINGDESIGNEE' && field.setText(` ${body.admin_name}, ${body.admin_title}`);
            field.getName() === 'SHIFT START TIME HHMM AMPM' && field.setText(`  ${moment(body.start_time).format("HH:MM A")}`);
            field.getName() === 'Nursing Service Assignment' && field.setText(`  Nursing`);
            field.getName() === 'Employee Name' && field.setText(`${body.staff_first_name} ${body.staff_last_name}`);
            field.getName() === '6 STATIONWINGUNITFLOOR' && field.setText(`  ${body.floor}`);
            field.getName() === 'Employee Name' && field.setText(`  ${body.staff_first_name} ${body.staff_last_name}`);
            field.getName() === 'Discipline' && field.setText(`  ${body.role}`);
            //field.getName() === 'Actual Shift Start/End' && field.setText(`  ${body.clockin_time}\n${body.clockout_time}`);
            field.getName() === 'Actual Meal Break Start/End' && field.setText(`  30 minutes`);

            }

        field.enableReadOnly();
    });
    form.flatten();


    //adding signture to pdf pages
    if(body.auto_clockout){
        filledPdfDoc.getPages()[0].drawText(`Automatic clockout - signature pending`, {
            x: 82,
            y: 90,
            size: 12,
            font: timesRomanItalic
        })      
    }else{
        const employeeSignature = await filledPdfDoc.embedPng(fs.readFileSync(pathToEmployeeSignature));
        const page = filledPdfDoc.getPage(0);
        page.drawImage(employeeSignature, {
            x: 550, 
            y: 30, //every page has different Y position
            width: 150, //Image must be static 100 width, 50 height
            height: 100
            });
    }
    
}

function addSignSheetToShift(body,response) {
    if(body.auto_clockout){
        run({ pathToPDF:"assets/timesheet_form.pdf", body},response).catch(console.error);
    }else{
        fs.writeFile(`timesheets/${body.shift_id}signature.png`, body.employee_signature.replace("data:image/png;base64,","").replace("data:image/jpeg;base64,",""), 'base64',function (error) {
            if(error){
                console.log(error)
                return
            }
            run({ pathToPDF:"assets/timesheet_form.pdf", pathToEmployeeSignature:`timesheets/${body.shift_id}signature.png`, body},response).catch(console.error);
        });
    }
}



module.exports = {
    addSignSheetToShift
};
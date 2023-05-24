

function calculateOvertime(response) {
    var is_overtime_hours = false
    var total_price_facility_overide = response[0].total_price_facility     
    var total_price_staff_overide = response[0].total_price_staff
    var overtime_hours = 0
    var overtime_rate = 0
    var overtime_staff_rate = 0
    var double_hours = 0
    var double_rate = 0
    var double_staff_rate = 0

    var fovertime_invoice = 0
    var fdouble_invoice = 0

    var sovertime_invoice = 0
    var sdouble_invoice = 0

    console.log(response[0].worked_hours_facility + (response[0].worked_time/60))
    if(response[0].worked_hours_facility >= 40){
        //This staff worked with this facility more than or equal 40 hours in one week.
        is_overtime_hours = true
        overtime_rate = response[0].invoice_rate * 1.5
        overtime_staff_rate = response[0].invoice_rate_staff * 1.5

        if((response[0].worked_time/60) > 8){
            //if hours more than 8 then it will be invoice rate + half 
            //Facility
            overtime_hours = 8
            double_hours = (response[0].worked_time/60) - 8
            double_rate = response[0].invoice_rate * 2
            double_staff_rate = response[0].invoice_rate_staff * 2

            fovertime_invoice = overtime_rate * 8 //Calculating invoice rate overtime and add 50%
            fdouble_invoice = double_rate * double_hours //Calculating invoice rate overtime and add 100%

            sovertime_invoice = overtime_staff_rate * 8 //Calculating invoice rate overtime and add 50%
            sdouble_invoice = double_staff_rate * double_hours //Calculating invoice rate overtime and add 100%

            total_price_facility_overide = fovertime_invoice + fdouble_invoice
            total_price_staff_overide = sovertime_invoice + sdouble_invoice
        }else{
            //Then calculate 50% only 
            overtime_hours = (response[0].worked_time/60)

            total_price_facility_overide = response[0].total_price_facility * 1.5
            total_price_staff_overide = response[0].total_price_staff * 1.5
        }

    }
    else if((response[0].worked_hours_facility + (response[0].worked_time/60)) > 40){
        //This staff worked with this facility worked_hours_facility less than 40 hours and with worked time in this shift then it becomes more than 40 hours in one week,
        is_overtime_hours = true
        overtime_rate = response[0].invoice_rate * 1.5
        overtime_staff_rate = response[0].invoice_rate_staff * 1.5
        
        var normal_price = (40 - response[0].worked_hours_facility) * response[0].invoice_rate
        var normal_staff_price = (40 - response[0].worked_hours_facility) * response[0].invoice_rate_staff

        var extra_hours = ((response[0].worked_hours_facility + (response[0].worked_time/60)) - 40)

        if(extra_hours > 8){
            overtime_hours = 8
            double_hours = extra_hours - 8
            double_rate = response[0].invoice_rate * 2
            double_staff_rate = response[0].invoice_rate_staff * 2

            fovertime_invoice = overtime_rate * 8
            fdouble_invoice = double_rate * double_hours

            sovertime_invoice = overtime_staff_rate * 8
            sdouble_invoice = double_staff_rate * double_hours

            total_price_facility_overide = fovertime_invoice + fdouble_invoice
            total_price_staff_overide = sovertime_invoice + sdouble_invoice
            
        }else{
            overtime_hours = extra_hours
            total_price_facility_overide = normal_price + ((response[0].invoice_rate * extra_hours) * 1.5)
            total_price_staff_overide = normal_staff_price + ((response[0].invoice_rate_staff * extra_hours) * 1.5)
        }
    }

    return {is_overtime_hours,total_price_facility_overide,total_price_staff_overide,overtime_hours,overtime_rate,overtime_staff_rate,double_hours,double_rate,double_staff_rate}
}

module.exports = {
    calculateOvertime
};
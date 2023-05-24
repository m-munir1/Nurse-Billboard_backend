
function invoicePastDueEmail(invoice_id,facility_name,due_date) {
    return `Hello,
    
    Hope you are doing well. 
    
    This is just a friendly reminder that payment for ${facility_name} unpaid invoice #${invoice_id} was due on ${due_date} and is now PAST DUE.
    
    We've reattached the invoice for your reference.
    
    Please feel free to contact us if you have any questions about the invoice, or if you'd like to make your payment or you feel this is an error. 
    
    We accept the following payment methods:
    
    - ACH
    - Debit/Credit 
    - Check
    
    Thank you for your business,
    
    Best Regards,
    Nurse Billboard`
}

function invoiceDueEmail(invoice_id,facility_name,past_due_date) {
    return `Hello,

    Hope you are doing well. 

    This is just a friendly reminder that payment for ${facility_name} current invoice #${invoice_id} is NOW due and will be past due on ${past_due_date}. 

    We've attached the invoice for your reference.

    Please feel free to contact us if you have any questions about the invoice, or if you'd like to make your payment or you feel this is an error. 

    We accept the following payment methods:

    - ACH
    - Debit/Credit 
    - Check

    Thank you for your business,

    Best Regards,
    Nurse Billboard`
}

module.exports = {
    invoicePastDueEmail,
    invoiceDueEmail
}
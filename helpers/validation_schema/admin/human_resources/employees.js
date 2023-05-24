const Joi = require('@hapi/joi')

const individual_timesheet = Joi.object({
    staff_id: Joi.number().required()
})

const facility_timesheet = Joi.object({
    staff_id: Joi.string().required()
})

module.exports = {
    individual_timesheet,
    facility_timesheet
}
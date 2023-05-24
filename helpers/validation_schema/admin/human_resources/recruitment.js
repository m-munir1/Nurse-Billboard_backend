const Joi = require('@hapi/joi')
const JoiDate = require("@hapi/joi-date")

const compelete_interview = Joi.object({
    staff_id: Joi.number().required(),
    notes: Joi.string().required()
})

const schedule_oreintation = Joi.object({
    staff_id: Joi.number().required(),
    meeting_url: Joi.string().required(),
    orientation_date: Joi.extend(JoiDate).date().format("YYYY-MM-DD HH:mm:ss").required(),
})

const compelete_oreintation = Joi.object({
    staff_id: Joi.number().required()
})

const requirements = Joi.object({
    staff_id: Joi.number().required()
})

const requirement = Joi.object({
    staff_id: Joi.number().required(),
    requirement: Joi.string().required()
})
 
const requirementApprove = Joi.object({
    staff_id: Joi.number().required(),
    approved: Joi.boolean().required(),
    requirement: Joi.string().required()
})

module.exports = {
    compelete_interview,
    schedule_oreintation,
    compelete_oreintation,
    requirements,
    requirement,
    requirementApprove
}
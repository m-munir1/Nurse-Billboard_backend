const Joi = require('@hapi/joi')

const account = Joi.object({
    email: Joi.string().email().required(),
    full_name: Joi.string().required(),
    gender: Joi.string().required()
})

module.exports = {
    account
}
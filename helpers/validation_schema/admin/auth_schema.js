const Joi = require('@hapi/joi')

const register = Joi.object({
    phone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
        "string.pattern.base":`Wrong phone number format`
      }),
    type:Joi.string().required(),
    password: Joi.string().required()
})

module.exports = {
    register
    
}
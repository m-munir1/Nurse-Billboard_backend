const Joi = require('@hapi/joi')

const register = Joi.object({
    phone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
        "string.pattern.base":`Wrong Phone number format`
      })
})

const forget_password = Joi.object({
  phone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
      "string.pattern.base":`Wrong Phone number format`
    })
})

const forget_password_confirm = Joi.object({
  code:Joi.number().required(),
  phone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
      "string.pattern.base":`Wrong Phone number format`
    }),
  password: Joi.string().required()
})

const register_confirmation = Joi.object({
    code:Joi.number().required(),
    phone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
        "string.pattern.base":`Wrong Phone number format`
      }),
    type:Joi.string().required(),
    password: Joi.string().required()
})

const login = Joi.object({
    phone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
        "string.pattern.base":`Wrong Phone number format`
      }),
    password: Joi.string().required()
})

module.exports = {
    register,
    register_confirmation,
    login,
    forget_password,
    forget_password_confirm
}
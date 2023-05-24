const Joi = require('@hapi/joi')

const send_message_schema = Joi.object({
    message: Joi.string().required(),
    receiver: Joi.string().required(),
    shift_id: Joi.number().required(),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const seen_schema = Joi.object({
    shift_id: Joi.number().required()
})

const time_zone = Joi.object({
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
      "string.pattern.base":`timezone Wrong format, example: +00:00`
    })
})

const chatting = Joi.object({
    shift_id: Joi.number().required(),
    otherPhone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
        "string.pattern.base":`Wrong phone number format`
      }),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})


const tracking = Joi.object({
  staff_lat: Joi.number().required(),
  staff_long: Joi.number().required(),
  client_lat: Joi.number().required(),
  client_long: Joi.number().required(),
  client_phone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
      "string.pattern.base":`Wrong phone number format`
    }),
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
      "string.pattern.base":`timezone Wrong format, example: +00:00`
    })
})

module.exports = {
    send_message_schema,
    seen_schema,
    time_zone,
    chatting,
    tracking
}
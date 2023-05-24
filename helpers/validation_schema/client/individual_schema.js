const Joi = require('@hapi/joi')
const JoiDate = require("@hapi/joi-date")

const updateSchema = Joi.object({
    email: Joi.string().email(),
    full_name: Joi.string().regex(/^[A-Za-z0-9 -]*$/).messages({
        "string.pattern.base":`Facility name Wrong format`
      }),
    fcm_token:Joi.string().regex(/^[A-Za-z0-9._:/-]*$/).messages({
        "string.pattern.base":`fcm_token Wrong format`
      }),
})

const shiftSchema = Joi.object({
    language: Joi.string().regex(/^[A-Za-z0-9]*$/).required().messages({
        "string.pattern.base":`fcm_token Wrong format`
      }),
    gender: Joi.string().regex(/^[A-Za-z0-9]*$/).required().messages({
        "string.pattern.base":`fcm_token Wrong format`
      }),
    lat: Joi.number().required(),
    long: Joi.number().required(),
    details:Joi.string().max(100).required(),
    role:Joi.string().required(),
    hours:Joi.number().valid(1,2,4,6).required(),
    tasks:Joi.string().required(),
    address:Joi.string().regex(/^[A-Za-z0-9 -,]*$/).required().messages({
      "string.pattern.base":`state Wrong text format`
    }),
    state:Joi.string().regex(/^[A-Za-z0-9 -]*$/).required().messages({
        "string.pattern.base":`state Wrong text format`
      }),
    city:Joi.string().regex(/^[A-Za-z0-9 -]*$/).required().messages({
        "string.pattern.base":`city Wrong text format`
      }),
    postal_code:Joi.string().regex(/^[A-Za-z0-9]*$/).required().messages({
        "string.pattern.base":`postal code Wrong text format`
      }),
    country:Joi.string().regex(/^[A-Za-z0-9]*$/).required().messages({
        "string.pattern.base":`country Wrong text format`
      }),
    schedule_date:Joi.extend(JoiDate).date().format("YYYY-MM-DD HH:mm:ss"),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const calculatePriceSchema = Joi.object({
    role:Joi.string().required(),
    hours:Joi.number().valid(1,2,4,6).required(),
    city:Joi.string().regex(/^[A-Za-z0-9 -]*$/).required().messages({
      "string.pattern.base":`city Wrong text format`
    })
})

const hireSchema = Joi.object({
    staff_id: Joi.number().required(),
    pm_id:Joi.string().required()
})

const activeShiftSchema = Joi.object({
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
    "string.pattern.base":`timezone Wrong format, example: +00:00`
  })
})

const historyShiftSchema = Joi.object({
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
    "string.pattern.base":`timezone Wrong format, example: +00:00`
  })
})

const notificationSchema = Joi.object({
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
    "string.pattern.base":`timezone Wrong format, example: +00:00`
  })
})

const dismissSchema = Joi.object({
  staff_id: Joi.number().required()
})

const questionsSchema = Joi.object({
    q1: Joi.boolean().required(),
    q2: Joi.boolean().required(),
    q3:Joi.boolean().required(),
    q4:Joi.boolean().required(),
})

const update_balance = Joi.object({
    payment_method_id: Joi.string().required(),
    amount: Joi.number().integer().required(),
    type: Joi.string().required()
})

const report_shift = Joi.object({
    reason: Joi.string().required().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`reason Wrong text format`
      })
})

const connectedPayments = Joi.object({
    type: Joi.string().required()
})

const connectPaymentSchema = Joi.object({
    type: Joi.string().required(),
    billing_name: Joi.string().required(),
})

const us_bank_account_schema = Joi.object({
    us_bank_account_number: Joi.string().required(),
    us_bank_account_type: Joi.string().required(),
    us_bank_routing_number: Joi.string().required(),
    us_bank_account_holder_type: Joi.string().required()
})

const card_schema = Joi.object({
    card_number: Joi.string().required(),
    card_exp_month: Joi.string().required(),
    card_exp_year: Joi.string().required(),
    card_cvc: Joi.string().required(),
})

const messagesUser = Joi.object({
    shift_id: Joi.number().required(),
    staffPhone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
        "string.pattern.base":`Wrong phone number format`
      }),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const messages = Joi.object({
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
      "string.pattern.base":`timezone Wrong format, example: +00:00`
    })
})

module.exports = {
    updateSchema,
    shiftSchema,
    calculatePriceSchema,
    hireSchema,
    dismissSchema,
    questionsSchema,
    update_balance,
    report_shift,
    connectedPayments,
    connectPaymentSchema,
    us_bank_account_schema,
    card_schema,
    messagesUser,
    activeShiftSchema,
    historyShiftSchema,
    notificationSchema,
    messages
}
const Joi = require('@hapi/joi')
const JoiDate = require("@hapi/joi-date")

const contractSchema = Joi.object({
  facility_name: Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
      "string.pattern.base":`Facility name Wrong format`
    }).required(),
  address: Joi.string().regex(/^[A-Za-z0-9 -,%]*$/).messages({
      "string.pattern.base":`address Wrong text format`
    }).required(),
  lat:Joi.string().required(),
  long:Joi.string().required(),
  state:Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
      "string.pattern.base":`state Wrong text format`
    }).required(),
  city:Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
      "string.pattern.base":`city Wrong text format`
    }).required(),
  postal_code:Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
      "string.pattern.base":`postal code Wrong format`
    }),
  country:Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
      "string.pattern.base":`country Wrong text format`
    }).required(),
  invoice_option:Joi.number().min(1).max(2).required(),
  company_name: Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
    "string.pattern.base":`Facility name Wrong format`
  }).required(),
  admin_name: Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
    "string.pattern.base":`Facility name Wrong format`
  }).required(),
  admin_title: Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
    "string.pattern.base":`Facility name Wrong format`
  }).required(),
  company_email: Joi.string().required(),
  signature_base64: Joi.string().required(),
  invoices_days:Joi.object({
    invoice_day_one:Joi.number().min(1).max(15).required(),
    invoice_day_two:Joi.number().min(16).max(25).required(),
  }).when("invoice_option", {
    is: Joi.number().equal(2),
    then: Joi.required()
  }),
  payment_method:Joi.object({
    payment_type:Joi.string().required(),
    billing_name: Joi.string().required(),
    us_bank_account:Joi.object({
      us_bank_account_number: Joi.string().required(),
      us_bank_account_type: Joi.string().required(),
      us_bank_routing_number: Joi.string().required(),
      us_bank_account_holder_type: Joi.string().required()
        }).when("payment_type", {
      is: Joi.string().equal("us_bank_account"),
      then: Joi.required()
    }),
    card:Joi.object({
      number: Joi.string().required(),
      exp_month: Joi.string().required(),
      exp_year: Joi.string().required(),
      cvc: Joi.string().required()
    }).when("payment_type", {
      is: Joi.string().equal("card"),
      then: Joi.required()
    })
  }).when("invoice_option", {
    is: Joi.number().equal(1),
    then: Joi.required()
  }),
})

const updateSchema = Joi.object({
    email: Joi.string(),
    company_email: Joi.string(),
    facility_name: Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
        "string.pattern.base":`Facility name Wrong format`
      }),
    fcm_token:Joi.string().regex(/^[A-Za-z0-9._:/-]*$/).messages({
        "string.pattern.base":`Fcm token Wrong format`
      }),
    address: Joi.string().regex(/^[A-Za-z0-9 -,%]*$/).messages({
        "string.pattern.base":`address Wrong text format`
      }),
    lat:Joi.number(),
    long:Joi.number(),
    state:Joi.string().regex(/^[A-Za-z0-9 -]*$/).messages({
        "string.pattern.base":`state Wrong text format`
      }),
    city:Joi.string().regex(/^[A-Za-z0-9 -%]*$/).messages({
        "string.pattern.base":`city Wrong text format`
      }),
    postal_code:Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`postal code Wrong format`
      }),
    country:Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`country Wrong text format`
      })
})

const shiftSchema = Joi.object({
    role: Joi.string().required(),
    needed: Joi.number().required(),
    invoiceRate:Joi.number().required(),
    floor:Joi.number().required(),
    hours:Joi.number().min(6).max(12).required(),
    date_time:Joi.extend(JoiDate).date().format("YYYY-MM-DD HH:mm:ss").required(),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const shiftIdSchema = Joi.object({
    shift_id: Joi.number().required()
})

const notificationSchema = Joi.object({
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
    "string.pattern.base":`timezone Wrong format, example: +00:00`
  })
})

const retrieveshiftSchema = Joi.object({
  shift_id: Joi.number().required(),
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
    "string.pattern.base":`timezone Wrong format, example: +00:00`
  })
})

const pay_invoice = Joi.object({
    invoice_date:Joi.extend(JoiDate).date().format("YYYY-M").required(),
    payment_method_id: Joi.string().required(),
    type: Joi.string().required()
})

const get_invoice = Joi.object({
    invoice_date:Joi.extend(JoiDate).date().format("YYYY-M").required(),
})

const dateSchema = Joi.object({
    date:Joi.extend(JoiDate).date().format("YYYY-MM-DD").required(),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const card_schema = Joi.object({
  card_number: Joi.number().integer().required(),
  card_exp_month: Joi.number().integer().required(),
  card_exp_year: Joi.number().integer().required(),
  card_cvc: Joi.number().integer().required(),
  billing_name: Joi.string().required()
})

const us_bank_account_schema = Joi.object({
    us_bank_account_number: Joi.number().integer().required(),
    us_bank_account_type: Joi.string().required(),
    us_bank_routing_number: Joi.number().integer().required(),
    us_bank_account_holder_type: Joi.string().required(),
    billing_name: Joi.string().required()
})

const connectPaymentSchema = Joi.object({
    type: Joi.string().required(),
    billing_name: Joi.string().required(),
})

const report_shift = Joi.object({
    reason: Joi.string().regex(/^[A-Za-z0-9 -,]*$/).required().messages({
        "string.pattern.base":`Reason text Wrong format`
      }),
    shift_id: Joi.number().required()
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
    shiftIdSchema,
    pay_invoice,
    get_invoice,
    us_bank_account_schema,
    connectPaymentSchema,
    dateSchema,
    report_shift,
    messagesUser,
    contractSchema,
    card_schema,
    retrieveshiftSchema,
    notificationSchema,
    messages
}
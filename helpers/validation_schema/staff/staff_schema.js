const Joi = require('@hapi/joi')
const JoiDate = require("@hapi/joi-date")

const updateAccountSchema = Joi.object({
    first_name: Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`First name name Wrong text format`
      }),
    last_name: Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`Last name name Wrong text format`
      }),
    fcm_token: Joi.string().regex(/^[A-Za-z0-9._:/-]*$/).messages({
        "string.pattern.base":`fcm token Wrong format`
      }),
    address:Joi.string().regex(/^[A-Za-z0-9 -,]*$/).messages({
        "string.pattern.base":`Address Wrong text format`
      }),
    email: Joi.string().email(),
    gender: Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`gender Wrong text format`
      }),
    language: Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`language Wrong text format`
      }),
    role: Joi.string(),
    lat:Joi.number(),
    long:Joi.number(),
    city:Joi.string().regex(/^[A-Za-z0-9 -]*$/).messages({
        "string.pattern.base":`city Wrong text format`
      }),
    country:Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`country Wrong text format`
      }),
    postal_code:Joi.string().regex(/^[A-Za-z0-9]*$/).messages({
        "string.pattern.base":`Postal code Wrong text format`
      }),
    state:Joi.string().regex(/^[A-Za-z0-9 -]*$/).messages({
        "string.pattern.base":`State Wrong text format`
      })
})

const requirementSchema = Joi.object({
    document_url: Joi.string().required(),
})

const getPaidSchema = Joi.object({
    method: Joi.string().regex(/^[A-Za-z0-9]*$/).required().messages({
        "string.pattern.base":`method Wrong text format`
      })
}) 

//Individual
const nearbyIndividualShiftsSchema = Joi.object({
    lat: Joi.number().required(),
    long: Joi.number().required(),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const activeIndividualShiftSchema = Joi.object({
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const historyIndividualShiftSchema = Joi.object({
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const notificationSchema = Joi.object({
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
      "string.pattern.base":`timezone Wrong format, example: +00:00`
    })
  })

const applyIndividualSchema = Joi.object({
    shift_id: Joi.number().required(),
    lat: Joi.number().required(),
    long: Joi.number().required(),
})

const clockInIndividualSchema = Joi.object({
    lat: Joi.number().required(),
    long: Joi.number().required()
})

const clockOutIndividualSchema = Joi.object({
    lat: Joi.number().required(),
    long: Joi.number().required(),
    signature: Joi.string().regex(/^[A-Za-z0-9 -]*$/).required().messages({
        "string.pattern.base":`signature Wrong text format`
      })
})

//FACILITY
const nearbyFacilityShiftsSchema = Joi.object({
    lat: Joi.number().required(),
    long: Joi.number().required(),
    date: Joi.extend(JoiDate).date().format("YYYY-MM-DD").required(),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const dateSchema = Joi.object({
    date:Joi.extend(JoiDate).date().format("YYYY-MM-DD").required(),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const clockinFacilitySchema = Joi.object({
    lat: Joi.number().required(),
    long: Joi.number().required(),
    shift_id: Joi.number().required()
})

const clockOutFacilitySchema = Joi.object({
    lat: Joi.number().required(),
    long: Joi.number().required(),
    shift_id: Joi.number().required(),
    signature_base64: Joi.string().required()
})

const messages = Joi.object({
  messages_type: Joi.string().required(),
  time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
        "string.pattern.base":`timezone Wrong format, example: +00:00`
      })
})

const messagesUser = Joi.object({
    shift_id: Joi.number().required(),
    clientPhone: Joi.string().regex(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/).required().messages({
        "string.pattern.base":`Wrong phone number format`
      }),
    time_zone:Joi.string().regex(/^(?:Z|[+-](?:2[0-3]|[01][0-9]):[0-5][0-9])$/).required().messages({
          "string.pattern.base":`timezone Wrong format, example: +00:00`
        })
})

const stripeAccount = Joi.object({
    id_number:Joi.number().required(),
    dob:Joi.object({
        day:Joi.number().required(),
        month:Joi.number().required(),
        year:Joi.number().required()
    }).required(),
    tos_acceptance:Joi.object({
        date:Joi.number().required(),
        ip:Joi.string().required()
    })
}).required()

const stripeAccountUpdate = Joi.object({
    person:Joi.object({
        first_name:Joi.string().optional().allow(''),
        last_name:Joi.string().optional().allow(''),
        email:Joi.string().optional().allow(''),
        phone:Joi.number().optional().allow(''),
        ssn_last_4:Joi.number().optional().allow('').max(4),
        id_number:Joi.number().optional().allow(''),
        address:Joi.object({
            city:Joi.string().optional().allow(''),
            address:Joi.string().optional().allow(''),
            postal_code:Joi.string().optional().allow(''),
            state:Joi.string().optional().allow('')
        }),
        dob:Joi.object({
            day:Joi.number().optional().allow(''),
            month:Joi.number().optional().allow(''),
            year:Joi.number().optional().allow('')
        })
    })
})

const paymentMethodCard = Joi.object({
    name:Joi.string().required(),
    number: Joi.number().required(),
    currency:Joi.string().required(),
    exp_month: Joi.number().required(),
    exp_year: Joi.number().required(),
    cvc: Joi.number().required()
})

const paymentMethodBank = Joi.object({
    country: Joi.string().required(),
    currency: Joi.string().required(),
    account_holder_name: Joi.string().required(),
    account_holder_type:Joi.string().required(),
    routing_number: Joi.number().required(),
    account_number:Joi.number().required()
})


const report_facility_shift = Joi.object({
    reason: Joi.string().regex(/^[A-Za-z0-9 -,]*$/).required().messages({
        "string.pattern.base":`Reason Wrong text format`
      }),
    shift_id: Joi.number().required()
})

const report_individual_shift = Joi.object({
    reason: Joi.string().regex(/^[A-Za-z0-9 -,]*$/).required().messages({
        "string.pattern.base":`reason Wrong text format`
      })
})

const shiftIdSchema = Joi.object({
    shift_id: Joi.number().required()
})


module.exports = {
    updateAccountSchema,
    requirementSchema,
    getPaidSchema,
    nearbyIndividualShiftsSchema,
    applyIndividualSchema,
    clockInIndividualSchema,
    clockOutIndividualSchema,
    activeIndividualShiftSchema,
    historyIndividualShiftSchema,
    
    nearbyFacilityShiftsSchema,
    clockinFacilitySchema,
    clockOutFacilitySchema,
    messagesUser,
    stripeAccount,
    stripeAccountUpdate,
    paymentMethodCard,
    paymentMethodBank,
    report_facility_shift,
    report_individual_shift,
    dateSchema,
    shiftIdSchema,

    notificationSchema,
    messages

}

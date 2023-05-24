require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_KEY);

const customer = (error,response) => stripe.customers.create(
    function (err, result) {
        if (err) {
            // different ways to log error 
            error({err})
            return
        }else{
            response(result)
        }
        }
);

const connectPaymentMethod = (paymentMethod,error,connected)=> stripe.paymentMethods.create(
    paymentMethod
  , function (err, results) {
    if (err) {
        // different ways to log error 
        error({err})
        return
    }else{
        connected(results)
    }
});

const attachPaymentMethod = (cus_id,pm_id, error, response) => stripe.paymentMethods.attach(
    pm_id,
    {customer: cus_id},
    function (err, result) {
        if (err) {
            // different ways to log error 
            error({err})
            return
        }else{
            response(result)
        }
        }
  );

const customerPaymentMethods = (cus_id,type,error,response)=> stripe.customers.listPaymentMethods(
    cus_id,
    {type: type},
    function (err, result) {
        if (err) {
            // different ways to log error 
            error({err})
            return
        }else{
            response(result)
        }
     }
);

const retrievePaymentMethod = (pm_id,error,response) => stripe.paymentMethods.retrieve(
    pm_id,
    function (err, result) {
        if (err) {
            // different ways to log error 
            error({err})
            return
        }else{
            response(result)
        }
     }
  );

const createCharge = (cus_id,amount,pm_id,response,error) => stripe.paymentIntents.create({
    customer:cus_id,
    amount: amount,
    currency: 'usd',
    payment_method:pm_id,
    confirm:true
},function(err, account) {
    // asynchronously called

    if(err){
        error(err)
    }else{
        response(account)
    }

});

const transferCharge = (amount,destination,source_transaction,response,error) => stripe.transfers.create({
    amount: amount,
    currency: 'usd',
    destination: destination,
    source_transaction: source_transaction,
  },function(err, account) {
    // asynchronously called

    if(err){
        error(err)
    }else{
        response(account)
    }

});

const refundCharge = (payment_intent,response,error) => stripe.refunds.create({
payment_intent:payment_intent
},function(err, refunded) {
    // asynchronously called

    if(err){
        error(err)
    }else{
        response(refunded)
    }

});

const retrieveBalance = (destination,response,error) => stripe.balance.retrieve({
stripeAccount: destination
},function(err, account) {
    // asynchronously called

    if(err){
        error(err)
    }else{
        response(account)
    }

});

function retrieveEarnings(destination,error,success){

    stripe.transfers.list({
        destination:destination
    },
    function (err, transfer) {
        if (err) {
        // different ways to log error 
            error({message:err.raw.message})
        return
        }else{

            retrieveBalance(destination,
                (response)=>{
                    var life_time_earnings = 0

                    transfer.data.forEach(element => {
                        // ...use `element`...
                        life_time_earnings = life_time_earnings + element.amount
                    });
    
                    
                    //(((response.available[0].amount/100) < 0)? 0 : response.available[0].amount/100)

                    success({
                        available: response.instant_available[0].amount/100,
                        instant_available: response.instant_available[0].amount/100,
                        pending: response.pending[0].amount/100,
                        life_time_earnings: life_time_earnings/100
                    })
                }),
                (errr)=>{
                    error(errr)
                }

        }
    });
}

function getPaid(method,stripe_account,error,success){

stripe.balance.retrieve({stripeAccount:stripe_account},function(err, balance) {
    // asynchronously called

    if(err){
        error({message:err.raw.message})
        return
    }else{

        if(method == "instant"){
            stripe.payouts.create(
                {amount:balance.instant_available[0].amount,
                currency:"usd",
                method:method},
                {stripeAccount:stripe_account}
                ,function(err, payout) {
                // asynchronously called
                if(err){
                    error({message:err.raw.message})
                    return
                }else{
                    success({status:'success'})
                }
                
            });
        }else if(method == "standard"){
            stripe.payouts.create(
                {amount:balance.available[0].amount,
                currency:"usd",
                method:method},
                {stripeAccount:stripe_account}
                ,function(err, payout) {
                // asynchronously called
                if(err){
                    error({message:err.raw.message})
                    return
                }else{
                    success({status:'success'})
                }
                
            });
        }
    }
    
});
}

function getPayouts(stripe_account,error,success){

    stripe.payouts.list({stripeAccount:stripe_account},function(err, payouts) {
        // asynchronously called

        if(err){
            error({message:err.raw.message})
            return
        }else{
            success(payouts)
        }
    
    });
}

const transferFundsPayroll = (amount,destination,response,error) => stripe.transfers.create({
      amount: amount * 100,
      currency: 'usd',
      destination:destination
    },function(err, account) {
        // asynchronously called

        if(err){
            error(err)
        }else{
            response(account)
        }
    
});

const createStripeAccount = (body,response,error) => stripe.accounts.create(body,function(err, account) {
    // asynchronously called

    if(err){
        error(err)
    }else{
        response(account)
    }

});

const retrieveStripeAccount = (acct_id,response,error)=> stripe.accounts.retrieve(
    acct_id,function(err, account) {
        // asynchronously called

        if(err){
            error(err)
        }else{
            response(account)
        }
    
    }
);

const addAccountPayment = (acct_id,payment_token_id,response,error)=> stripe.accounts.update(
    acct_id,
    {'external_account': payment_token_id,
    }
    ,function(err, account) {
        // asynchronously called
    
        if(err){
            error(err)
        }else{
            response(account)
        }
    
    }
);

const updateAccount = (acct_id,body,response,error)=> stripe.accounts.update(
    acct_id,
    body
    ,function(err, account) {
        // asynchronously called
    
        if(err){
            error(err)
        }else{
            response(account)
        }
    
    }
);

const paymentToken = (payment,response,error)=> stripe.tokens.create(
    payment
,function(err, account) {
    // asynchronously called

    if(err){
        error(err)
    }else{
        response(account)
    }

});

const createFile = (file,response,error) => stripe.files.create({
    purpose: 'identity_document',
    file: {
      data: file,
      name: 'file.jpg',
      type: 'application/octet-stream',
    },
  },function(err, account) {
    // asynchronously called

    if(err){
        error(err)
    }else{
        response(account)
    }

});

module.exports = {
    customer,
    connectPaymentMethod,
    attachPaymentMethod,
    customerPaymentMethods,
    retrieveBalance,
    retrieveEarnings,
    getPaid,
    getPayouts,
    transferFundsPayroll,
    createStripeAccount,
    retrieveStripeAccount,
    updateAccount,
    paymentToken,
    createCharge,
    transferCharge,
    refundCharge,
    createFile,
    addAccountPayment,
    retrievePaymentMethod
};
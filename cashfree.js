const { Cashfree } = require("cashfree-pg");

// ✅ set credentials
Cashfree.XClientId = process.env.CASHFREE_APP_ID;
Cashfree.XClientSecret = process.env.CASHFREE_SECRET_KEY;

// ✅ set environment
Cashfree.XEnvironment =
  process.env.CASHFREE_ENV === "PRODUCTION"
    ? Cashfree.Environment.PRODUCTION
    : Cashfree.Environment.SANDBOX;

module.exports = Cashfree;
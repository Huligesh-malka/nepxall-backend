const { Cashfree } = require("cashfree-pg");

const cashfree = new Cashfree(
  process.env.CASHFREE_ENV === "PROD"
    ? Cashfree.PRODUCTION
    : Cashfree.SANDBOX,
  process.env.CASHFREE_APP_ID,
  process.env.CASHFREE_SECRET_KEY
);

module.exports = cashfree;
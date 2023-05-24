const mysql = require("mysql");
require("dotenv").config();

const DATABASE_HOST = process.env.DATABASE_HOST;
const DATABASE_USER = process.env.DATABASE_USER;
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD;
const DATABASE_NAME = process.env.DATABASE_NAME;
const DATABASE_PORT = process.env.DATABASE_PORT;

var pool  = mysql.createPool({
  //connectionLimit : 10,
  host            : DATABASE_HOST,
  user            : DATABASE_USER,
  password        : DATABASE_PASSWORD,
  database        : DATABASE_NAME,
  port            : DATABASE_PORT,
  multipleStatements: true
}); 

module.exports = pool;
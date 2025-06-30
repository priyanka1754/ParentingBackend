const dotenv = require("dotenv");
const path = require("path");
// Determine the environment and load the appropriate .env file
const envFile =
  process.env.NODE_ENV === "production"
    ? `.env.${process.env.NODE_ENV}`
    : `.env`;
dotenv.config({ path: path.resolve(__dirname, envFile) });

console.log(
  `Running in ${process.env.NODE_ENV || "development"} mode with mongouri: ${
    process.env.MONGO_URI
  }`
);
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGO_URI;
const newUserRewards = 100;
module.exports = {
  PORT,
  MONGODB_URI,
  newUserRewards,
};

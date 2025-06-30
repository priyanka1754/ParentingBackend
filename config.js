const { mongoose } = require("mongoose");
const { MONGODB_URI } = require("./constants");

const connectToMongoDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, { autoIndex: true });
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection error:", err);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectToMongoDB;

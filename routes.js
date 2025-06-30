const express = require("express");
const router = express.Router();
// const connectToMongoDB = require("./config");
const communityRoute = require("./main/parenting/communities/communityRoute");
const groupRoute = require("./main/parenting/groups/groupRoute");
const groupPostRoute = require("./main/parenting/groups/groupPostRoute");
const expertApplicationRoute=require("./main/parenting/expert-application/expertApplicationRoute")

router.get("/api", async (req, res) => {
  // root connection
  res.json({ message: "Hello from SkipCry API!" });
  // connectToMongoDB();
});

router.use("/api/parenting/communities", communityRoute);
router.use("/api/parenting/groups", groupRoute);
router.use("/api/parenting/group-posts", groupPostRoute);
router.use("/api/parenting/expert-application",expertApplicationRoute)

module.exports = router;

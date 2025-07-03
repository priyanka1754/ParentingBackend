const UserRole = require("../users/userRole");
const ExpertApplication = require("../expert-application/expertApplication");

const adminAuth = (permission) => async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }

    const communityId = req.params.communityId || (req.body.applicationId && (await ExpertApplication.findById(req.body.applicationId)).communityId);

    const hasPermission = await UserRole.userHasPermission(req.user._id, permission, communityId);

    if (!hasPermission) {
      return res.status(403).json({ error: "Access denied. Admin privileges required." });
    }
    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    res.status(500).json({ error: "Server error during authorization." });
  }
};

module.exports = adminAuth;

const UserRole = require("../users/userRole");

const permitScoped = (requiredRole, communityParam = null) => {
  return async (req, res, next) => {
    try {
      const userId = req.user._id; // Assuming user is authenticated
      let communityId = null;

      if (communityParam) {
        communityId = req.params[communityParam];
        if (!communityId) {
          return res.status(400).json({ message: `Community ID parameter \'${communityParam}\' is missing.` });
        }
      }

      const userRoles = await UserRole.find({ userId });

      let hasPermission = false;

      // Check for global admin role first
      if (userRoles.some(role => role.role === "admin")) {
        hasPermission = true;
      } else if (requiredRole === "moderator" || requiredRole === "expert") {
        // For scoped roles, check if the user has the required role within the specified community
        hasPermission = userRoles.some(role =>
          role.role === requiredRole &&
          role.communityId &&
          role.communityId.toString() === communityId
        );
      }

      if (!hasPermission) {
        return res.status(403).json({ message: "Forbidden: You do not have the necessary permissions for this action." });
      }

      next();
    } catch (error) {
      console.error("Error in permitScoped middleware:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  };
};

module.exports = permitScoped;

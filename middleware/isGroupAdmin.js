const Group = require("../groups/group");

async function isGroupAdmin(req, res, next) {
  try {
    const groupId = req.params.groupId || req.params.id; // Handle both possible parameter names
    if (!groupId) {
      return res.status(400).json({ message: "Group ID is missing." });
    }

    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: "Group not found." });
    }

    if (!req.user || !req.user._id) {
      return res.status(401).json({ message: "Unauthorized: User not authenticated." });
    }

    if (!group.admins.some(a => a.userId.equals(req.user._id))) {
      return res.status(403).json({ message: "Forbidden: Only group admins can perform this action." });
    }
    next();
  } catch (error) {
    console.error("Error in isGroupAdmin middleware:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
}

module.exports = isGroupAdmin;

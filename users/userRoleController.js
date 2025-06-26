const UserRole = require('./userRole');
const { requirePermission, requireAdmin } = require('../middleware/authorization');

// Get user roles
exports.getUserRoles = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Users can view their own roles, admins can view any user's roles
    if (userId !== req.user._id.toString()) {
      const hasPermission = await UserRole.userHasPermission(req.user._id, 'view_reports');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const userRoles = await UserRole.getUserRoles(userId);
    res.json(userRoles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Assign role to user (Admin only)
exports.assignRole = async (req, res) => {
  try {
    const { userId, role, permissions, expertiseAreas, credentials } = req.body;

    // Check if role already exists
    const existingRole = await UserRole.findOne({ userId, role, isActive: true });
    if (existingRole) {
      return res.status(400).json({ error: 'User already has this role' });
    }

    const roleData = {
      userId,
      role,
      assignedBy: req.user._id
    };

    // Add expert-specific fields
    if (role === 'expert') {
      roleData.expertiseAreas = expertiseAreas;
      roleData.credentials = credentials;
      roleData.verificationStatus = 'pending';
    }

    // Override permissions if provided
    if (permissions) {
      roleData.permissions = permissions;
    }

    const userRole = new UserRole(roleData);
    await userRole.save();

    const populatedRole = await UserRole.findById(userRole._id)
      .populate('userId', 'name email avatar')
      .populate('assignedBy', 'name email');

    res.status(201).json(populatedRole);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Remove role from user (Admin only)
exports.removeRole = async (req, res) => {
  try {
    const { userId, role } = req.body;

    const userRole = await UserRole.findOne({ userId, role, isActive: true });
    if (!userRole) {
      return res.status(404).json({ error: 'Role not found' });
    }

    userRole.isActive = false;
    await userRole.save();

    res.json({ success: true, message: 'Role removed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get users by role (Admin only)
exports.getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const { isActive = true } = req.query;

    const users = await UserRole.getUsersByRole(role, isActive === 'true');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get pending expert verifications (Admin only)
exports.getPendingExperts = async (req, res) => {
  try {
    const pendingExperts = await UserRole.getPendingExperts();
    res.json(pendingExperts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Verify expert (Admin only)
exports.verifyExpert = async (req, res) => {
  try {
    const { userId } = req.body;

    const userRole = await UserRole.findOne({ 
      userId, 
      role: 'expert', 
      isActive: true 
    });

    if (!userRole) {
      return res.status(404).json({ error: 'Expert role not found' });
    }

    await userRole.verify(req.user._id);

    const updatedRole = await UserRole.findById(userRole._id)
      .populate('userId', 'name email avatar')
      .populate('verifiedBy', 'name email');

    res.json({ success: true, userRole: updatedRole });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Reject expert verification (Admin only)
exports.rejectExpert = async (req, res) => {
  try {
    const { userId } = req.body;

    const userRole = await UserRole.findOne({ 
      userId, 
      role: 'expert', 
      isActive: true 
    });

    if (!userRole) {
      return res.status(404).json({ error: 'Expert role not found' });
    }

    await userRole.reject();

    res.json({ success: true, message: 'Expert verification rejected' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Check user permissions
exports.checkPermissions = async (req, res) => {
  try {
    const { permissions } = req.query;
    const permissionArray = Array.isArray(permissions) ? permissions : [permissions];

    const results = {};
    for (const permission of permissionArray) {
      results[permission] = await UserRole.userHasPermission(req.user._id, permission);
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update user permissions (Admin only)
exports.updatePermissions = async (req, res) => {
  try {
    const { userId, role, permissions } = req.body;

    const userRole = await UserRole.findOne({ userId, role, isActive: true });
    if (!userRole) {
      return res.status(404).json({ error: 'User role not found' });
    }

    userRole.permissions = permissions;
    await userRole.save();

    const updatedRole = await UserRole.findById(userRole._id)
      .populate('userId', 'name email avatar');

    res.json({ success: true, userRole: updatedRole });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get role statistics (Admin only)
exports.getRoleStats = async (req, res) => {
  try {
    const stats = await Promise.all([
      UserRole.countDocuments({ role: 'admin', isActive: true }),
      UserRole.countDocuments({ role: 'expert', isActive: true, verificationStatus: 'verified' }),
      UserRole.countDocuments({ role: 'expert', isActive: true, verificationStatus: 'pending' }),
      UserRole.countDocuments({ role: 'user', isActive: true })
    ]);

    res.json({
      admins: stats[0],
      verifiedExperts: stats[1],
      pendingExperts: stats[2],
      users: stats[3]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


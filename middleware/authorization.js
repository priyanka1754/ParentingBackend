const UserRole = require('../users/userRole');
const GroupMembership = require('../groups/groupMembership');

// Check if user has specific permission
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      const hasPermission = await UserRole.userHasPermission(req.user._id, permission);
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Access denied. ${permission} permission required.`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during permission check.'
      });
    }
  };
};

// Check if user has specific role
const requireRole = (roles) => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      const userRoles = await UserRole.find({ 
        userId: req.user._id, 
        isActive: true 
      });

      const hasRole = userRoles.some(userRole => roleArray.includes(userRole.role));
      if (!hasRole) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${roleArray.join(' or ')}.`
        });
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during role check.'
      });
    }
  };
};

// Check if user is admin
const requireAdmin = requireRole('admin');

// Check if user is expert
const requireExpert = requireRole('expert');

// Check if user is admin or expert
const requireAdminOrExpert = requireRole(['admin', 'expert']);

// Check if user is member of specific group
const requireGroupMembership = (membershipStatus = 'active', roles = null) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required.'
        });
      }

      const groupId = req.params.groupId || req.params.id;
      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: 'Group ID required.'
        });
      }

      const statusArray = Array.isArray(membershipStatus) ? membershipStatus : [membershipStatus];
      const roleArray = roles ? (Array.isArray(roles) ? roles : [roles]) : null;

      const membership = await GroupMembership.findOne({
        groupId,
        userId: req.user._id,
        status: { $in: statusArray }
      });

      if (!membership) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Group membership required.'
        });
      }

      if (roleArray && !roleArray.includes(membership.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${roleArray.join(' or ')}.`
        });
      }

      // Attach membership info to request
      req.groupMembership = membership;
      next();
    } catch (error) {
      console.error('Group membership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Server error during membership check.'
      });
    }
  };
};

// Check if user is group admin or moderator
const requireGroupModerator = requireGroupMembership('active', ['admin', 'moderator']);

// Check if user is group admin
const requireGroupAdmin = requireGroupMembership('active', 'admin');

// Check if user can moderate posts (admin, expert, or group moderator)
const canModeratePost = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    // Check if user is admin or expert
    const hasGlobalPermission = await UserRole.userHasPermission(req.user._id, 'moderate_posts');
    if (hasGlobalPermission) {
      req.canModerate = true;
      return next();
    }

    // Check if user is group moderator/admin
    const groupId = req.params.groupId || req.body.groupId;
    if (groupId) {
      const membership = await GroupMembership.findOne({
        groupId,
        userId: req.user._id,
        status: 'active',
        role: { $in: ['admin', 'moderator'] }
      });

      if (membership) {
        req.canModerate = true;
        req.groupMembership = membership;
        return next();
      }
    }

    req.canModerate = false;
    next();
  } catch (error) {
    console.error('Moderation check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error during moderation check.'
    });
  }
};

// Optional authentication (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const rawHeader = req.header('Authorization');
    if (!rawHeader || !rawHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }

    const token = rawHeader.split(' ')[1];
    if (!token) {
      return next(); // Continue without authentication
    }

    const jwt = require('jsonwebtoken');
    const User = require('../users/parentUser');
    const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find user by ID from token
    const user = await User.findById(decoded.userId).select('-password');
    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

module.exports = {
  requirePermission,
  requireRole,
  requireAdmin,
  requireExpert,
  requireAdminOrExpert,
  requireGroupMembership,
  requireGroupModerator,
  requireGroupAdmin,
  canModeratePost,
  optionalAuth
};


const UserRole = require('../users/userRole');

// Middleware to verify scoped roles for community-based permissions
const requireScopedPermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const communityId = req.params.communityId || req.body.communityId;
      const groupId = req.params.groupId || req.body.groupId;

      // Check if user has the required permission in the specified scope
      const hasPermission = await UserRole.userHasPermission(
        req.user._id, 
        permission, 
        communityId, 
        groupId
      );

      if (!hasPermission) {
        return res.status(403).json({ 
          error: `Access denied. ${permission} permission required.` 
        });
      }

      next();
    } catch (error) {
      console.error('Scoped permission check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Middleware to check if user is community admin or moderator
const requireCommunityModerator = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const communityId = req.params.communityId || req.body.communityId;
    
    if (!communityId) {
      return res.status(400).json({ error: 'Community ID required' });
    }

    // Check for platform admin
    const platformAdmin = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      communityId: null,
      isActive: true
    });

    if (platformAdmin) {
      return next();
    }

    // Check for community moderator or admin
    const communityRole = await UserRole.getUserCommunityRole(req.user._id, communityId);
    
    if (!communityRole || !['admin', 'moderator'].includes(communityRole.role)) {
      return res.status(403).json({ 
        error: 'Access denied. Community moderator privileges required.' 
      });
    }

    next();
  } catch (error) {
    console.error('Community moderator check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check if user is community expert
const requireCommunityExpert = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const communityId = req.params.communityId || req.body.communityId;
    
    if (!communityId) {
      return res.status(400).json({ error: 'Community ID required' });
    }

    // Check for platform admin (can act as expert anywhere)
    const platformAdmin = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      communityId: null,
      isActive: true
    });

    if (platformAdmin) {
      return next();
    }

    // Check for community expert
    const expertRole = await UserRole.findOne({
      userId: req.user._id,
      role: 'expert',
      communityId: communityId,
      isActive: true,
      verificationStatus: 'verified'
    });
    
    if (!expertRole) {
      return res.status(403).json({ 
        error: 'Access denied. Verified expert status required.' 
      });
    }

    next();
  } catch (error) {
    console.error('Community expert check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check if user is group admin
const requireGroupAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const groupId = req.params.groupId || req.params.id || req.body.groupId;
    
    if (!groupId) {
      return res.status(400).json({ error: 'Group ID required' });
    }

    // Check for platform admin
    const platformAdmin = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      communityId: null,
      isActive: true
    });

    if (platformAdmin) {
      return next();
    }

    // Check if user is the group creator
    const Group = require('../groups/group');
    const group = await Group.findById(groupId);
    
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.createdBy.toString() === req.user._id.toString()) {
      return next();
    }

    return res.status(403).json({ 
      error: 'Access denied. Group admin privileges required.' 
    });
  } catch (error) {
    console.error('Group admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to get user's roles in context
const attachUserRoles = async (req, res, next) => {
  try {
    if (!req.user) {
      return next();
    }

    const communityId = req.params.communityId || req.body.communityId;
    const groupId = req.params.groupId || req.body.groupId;

    // Get all user roles
    const userRoles = await UserRole.getUserRoles(req.user._id, communityId, groupId);
    
    // Attach roles to request for easy access
    req.userRoles = {
      all: userRoles,
      isPlatformAdmin: userRoles.some(role => 
        role.role === 'admin' && !role.communityId && !role.groupId
      ),
      communityRoles: userRoles.filter(role => 
        role.communityId && role.communityId.toString() === communityId
      ),
      groupRoles: userRoles.filter(role => 
        role.groupId && role.groupId.toString() === groupId
      )
    };

    next();
  } catch (error) {
    console.error('Attach user roles error:', error);
    next(); // Continue without roles if there's an error
  }
};

// Helper function to check if user has any role in community
const hasAnyCommunityRole = async (userId, communityId) => {
  const roles = await UserRole.find({
    userId,
    communityId,
    isActive: true
  });
  return roles.length > 0;
};

// Helper function to check if user has any role in group
const hasAnyGroupRole = async (userId, groupId) => {
  const roles = await UserRole.find({
    userId,
    groupId,
    isActive: true
  });
  return roles.length > 0;
};

module.exports = {
  requireScopedPermission,
  requireCommunityModerator,
  requireCommunityExpert,
  requireGroupAdmin,
  attachUserRoles,
  hasAnyCommunityRole,
  hasAnyGroupRole
};


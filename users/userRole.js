const mongoose = require('mongoose');

const userRoleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'expert', 'moderator', 'groupAdmin','user'],
    required: true
  },
  // Community scope for role (null for platform-wide roles like admin)
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    default: null
  },
  // Group scope for role (null for community-wide or platform-wide roles)
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  permissions: [{
    type: String,
    enum: [
      'create_community',
      'edit_community',
      'delete_community',
      'assign_moderators',
      'approve_experts',
      'manage_groups',
      'moderate_posts',
      'ban_users',
      'view_reports',
      'mark_best_answer',
      'pin_posts',
      'edit_group',
      'delete_group'
    ]
  }],
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expertiseAreas: [{
    type: String,
    enum: [
      'Child Psychology',
      'Pediatric Health',
      'Education',
      'Nutrition',
      'Child Development',
      'Special Needs',
      'Mental Health',
      'Parenting Techniques',
      'Safety',
      'Technology & Screen Time'
    ]
  }],
  credentials: {
    type: String,
    maxlength: 1000
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verifiedAt: {
    type: Date
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  }
}, {
  timestamps: true
});

// Compound indexes for scoped roles
userRoleSchema.index({ userId: 1, role: 1, communityId: 1, groupId: 1 }, { unique: true });
userRoleSchema.index({ userId: 1, communityId: 1 });
userRoleSchema.index({ userId: 1, groupId: 1 });
userRoleSchema.index({ role: 1, isActive: 1 });
userRoleSchema.index({ verificationStatus: 1 });
userRoleSchema.index({ expertiseAreas: 1 });

// Pre-save middleware to set default permissions based on role
userRoleSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('role')) {
    switch (this.role) {
      case 'admin':
        this.permissions = [
          'create_community',
          'edit_community',
          'delete_community',
          'assign_moderators',
          'approve_experts',
          'manage_groups',
          'moderate_posts',
          'ban_users',
          'view_reports',
          'pin_posts',
          'edit_group',
          'delete_group'
        ];
        break;
      case 'moderator':
        this.permissions = [
          'moderate_posts',
          'ban_users',
          'view_reports',
          'pin_posts'
        ];
        break;
      case 'expert':
        this.permissions = [
          'mark_best_answer'
        ];
        break;
      case 'user':
        this.permissions = [];
        break;
    }
  }
  next();
});

// Instance method to verify expert
userRoleSchema.methods.verify = function(verifiedBy) {
  this.verificationStatus = 'verified';
  this.verifiedAt = new Date();
  this.verifiedBy = verifiedBy;
  return this.save();
};

// Instance method to reject expert
userRoleSchema.methods.reject = function() {
  this.verificationStatus = 'rejected';
  return this.save();
};

// Instance method to check permission
userRoleSchema.methods.hasPermission = function(permission) {
  return this.isActive && this.permissions.includes(permission);
};

// Static method to get user roles (with scope)
userRoleSchema.statics.getUserRoles = function(userId, communityId = null, groupId = null) {
  const query = { userId, isActive: true };
  if (communityId !== null) query.communityId = communityId;
  if (groupId !== null) query.groupId = groupId;
  
  return this.find(query)
    .populate('assignedBy', 'name email')
    .populate('verifiedBy', 'name email')
    .populate('communityId', 'title')
    .populate('groupId', 'title');
};

// Static method to get users by role in a specific scope
userRoleSchema.statics.getUsersByRole = function(role, communityId = null, groupId = null, isActive = true) {
  const query = { role, isActive };
  if (communityId !== null) query.communityId = communityId;
  if (groupId !== null) query.groupId = groupId;
  
  return this.find(query)
    .populate('userId', 'name email avatar')
    .sort({ assignedAt: -1 });
};

// Static method to check if user has permission in a specific scope
userRoleSchema.statics.userHasPermission = async function(userId, permission, communityId = null, groupId = null) {
  // Check platform-wide admin first
  const adminRole = await this.findOne({ 
    userId, 
    role: 'admin', 
    isActive: true,
    communityId: null,
    groupId: null
  });
  
  if (adminRole && adminRole.hasPermission(permission)) {
    return true;
  }
  
  // Check scoped permissions
  const query = { userId, isActive: true };
  if (communityId !== null) {
    query.$or = [
      { communityId: communityId },
      { communityId: null } // Include platform-wide roles
    ];
  }
  if (groupId !== null) {
    query.$or = [
      { groupId: groupId },
      { groupId: null } // Include community-wide and platform-wide roles
    ];
  }
  
  const userRoles = await this.find(query);
  return userRoles.some(role => role.hasPermission(permission));
};

// Static method to get user's role in a specific community
userRoleSchema.statics.getUserCommunityRole = function(userId, communityId) {
  return this.findOne({ 
    userId, 
    communityId, 
    isActive: true 
  });
};

// Static method to get user's role in a specific group
userRoleSchema.statics.getUserGroupRole = function(userId, groupId) {
  return this.findOne({ 
    userId, 
    groupId, 
    isActive: true 
  });
};

// Static method to get pending expert verifications
userRoleSchema.statics.getPendingExperts = function(communityId = null) {
  const query = { 
    role: 'expert', 
    verificationStatus: 'pending',
    isActive: true 
  };
  
  if (communityId) {
    query.communityId = communityId;
  }
  
  return this.find(query)
    .populate('userId', 'name email avatar')
    .populate('communityId', 'title')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('UserRole', userRoleSchema);


const mongoose = require('mongoose');

const userRoleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'expert', 'user'],
    required: true
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
      'mark_best_answer'
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

// Compound index to ensure unique user-role combinations
userRoleSchema.index({ userId: 1, role: 1 }, { unique: true });

// Indexes for better query performance
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
          'view_reports'
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

// Static method to get user roles
userRoleSchema.statics.getUserRoles = function(userId) {
  return this.find({ userId, isActive: true })
    .populate('assignedBy', 'name email')
    .populate('verifiedBy', 'name email');
};

// Static method to get users by role
userRoleSchema.statics.getUsersByRole = function(role, isActive = true) {
  return this.find({ role, isActive })
    .populate('userId', 'name email avatar')
    .sort({ assignedAt: -1 });
};

// Static method to check if user has permission
userRoleSchema.statics.userHasPermission = async function(userId, permission) {
  // Accept both ObjectId and string userId
  const query = [
    { userId: userId, isActive: true }, // string match (for string userId)
    { userId: { $eq: userId }, isActive: true } // ObjectId match (for ObjectId userId)
  ];
  const userRoles = await this.find({ $or: query });
  return userRoles.some(role =>
    role.role === 'admin' || role.hasPermission(permission)
  );
};

// Static method to get pending expert verifications
userRoleSchema.statics.getPendingExperts = function() {
  return this.find({ 
    role: 'expert', 
    verificationStatus: 'pending',
    isActive: true 
  })
    .populate('userId', 'name email avatar')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('UserRole', userRoleSchema);


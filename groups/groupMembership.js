const mongoose = require('mongoose');

const groupMembershipSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'banned', 'left'],
    default: 'active'
  },
  role: {
    type: String,
    enum: ['member', 'moderator', 'admin'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  approvedAt: {
    type: Date
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  },
  bannedAt: {
    type: Date
  },
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  },
  banReason: {
    type: String,
    maxlength: 500
  },
  leftAt: {
    type: Date
  },
  requestMessage: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index to ensure unique user-group combinations
groupMembershipSchema.index({ groupId: 1, userId: 1 }, { unique: true });

// Indexes for better query performance
groupMembershipSchema.index({ groupId: 1, status: 1 });
groupMembershipSchema.index({ userId: 1, status: 1 });
groupMembershipSchema.index({ status: 1, joinedAt: -1 });

// Instance method to approve membership
groupMembershipSchema.methods.approve = function(approvedBy) {
  this.status = 'active';
  this.approvedAt = new Date();
  this.approvedBy = approvedBy;
  return this.save();
};

// Instance method to ban member
groupMembershipSchema.methods.ban = function(bannedBy, reason) {
  this.status = 'banned';
  this.bannedAt = new Date();
  this.bannedBy = bannedBy;
  this.banReason = reason;
  return this.save();
};

// Instance method to leave group
groupMembershipSchema.methods.leave = function() {
  this.status = 'left';
  this.leftAt = new Date();
  return this.save();
};

// Static method to get active members of a group
groupMembershipSchema.statics.getActiveMembers = function(groupId) {
  return this.find({ groupId, status: 'active' })
    .populate('userId', 'name email avatar')
    .sort({ joinedAt: 1 });
};

// Static method to get pending join requests
groupMembershipSchema.statics.getPendingRequests = function(groupId) {
  return this.find({ groupId, status: 'pending' })
    .populate('userId', 'name email avatar')
    .sort({ createdAt: -1 });
};

// Static method to check if user is member of group
groupMembershipSchema.statics.isMember = function(groupId, userId) {
  return this.findOne({ 
    groupId, 
    userId, 
    status: { $in: ['active', 'pending'] } 
  });
};

// Static method to get user's groups
groupMembershipSchema.statics.getUserGroups = function(userId, status = 'active') {
  return this.find({ userId, status })
    .populate('groupId')
    .sort({ joinedAt: -1 });
};

module.exports = mongoose.model('GroupMembership', groupMembershipSchema);


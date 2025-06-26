const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  groupId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return `GRP${Math.floor(100000 + Math.random() * 900000)}`;
    }
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  intro: {
    type: String,
    required: true,
    maxlength: 1000
  },
  image: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Parenting Tips',
      'Education',
      'Health & Wellness',
      'Activities & Fun',
      'Support Groups',
      'Local Communities',
      'Special Needs',
      'Teen Parenting',
      'Single Parents',
      'Working Parents'
    ]
  },
  type: {
    type: String,
    required: true,
    enum: ['Public', 'Private', 'Secret'],
    default: 'Public'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active'
  },
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  admins: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    }
  }],
  moderators: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    }
  }],
  rules: [{
    title: {
      type: String,
      required: true,
      maxlength: 100
    },
    description: {
      type: String,
      required: true,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  memberCount: {
    type: Number,
    default: 1 // Creator is automatically a member
  },
  postCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better query performance
groupSchema.index({ communityId: 1, type: 1, status: 1 });
groupSchema.index({ category: 1, type: 1 });
groupSchema.index({ createdAt: -1 });
groupSchema.index({ title: 'text', intro: 'text' });

// Pre-save middleware to add creator as admin
groupSchema.pre('save', function(next) {
  if (this.isNew) {
    this.admins.push({
      userId: this.createdBy,
      assignedBy: this.createdBy
    });
  }
  next();
});

// Instance method to add admin
groupSchema.methods.addAdmin = function(userId, assignedBy) {
  const existingAdmin = this.admins.find(admin => 
    admin.userId.toString() === userId.toString()
  );
  
  if (!existingAdmin) {
    this.admins.push({ userId, assignedBy });
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to remove admin
groupSchema.methods.removeAdmin = function(userId) {
  // Don't allow removing the creator
  if (userId.toString() === this.createdBy.toString()) {
    throw new Error('Cannot remove group creator as admin');
  }
  
  this.admins = this.admins.filter(admin => 
    admin.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Instance method to add moderator
groupSchema.methods.addModerator = function(userId, assignedBy) {
  const existingModerator = this.moderators.find(mod => 
    mod.userId.toString() === userId.toString()
  );
  
  if (!existingModerator) {
    this.moderators.push({ userId, assignedBy });
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to remove moderator
groupSchema.methods.removeModerator = function(userId) {
  this.moderators = this.moderators.filter(mod => 
    mod.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Instance method to add rule
groupSchema.methods.addRule = function(title, description) {
  this.rules.push({ title, description });
  return this.save();
};

// Instance method to remove rule
groupSchema.methods.removeRule = function(ruleId) {
  this.rules = this.rules.filter(rule => 
    rule._id.toString() !== ruleId.toString()
  );
  return this.save();
};

// Static method to get groups with details
groupSchema.statics.getGroupsWithDetails = function(query = {}) {
  return this.find({ isActive: true, ...query })
    .populate('communityId', 'title category')
    .populate('createdBy', 'name email avatar')
    .populate('admins.userId', 'name email avatar')
    .populate('moderators.userId', 'name email avatar')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Group', groupSchema);


const mongoose = require('mongoose');

const communitySchema = new mongoose.Schema({
  communityId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return `COM${Math.floor(100000 + Math.random() * 900000)}`;
    }
  },
  title: {
    type: String,
    required: true,
    maxlength: 100
  },
  shortDescription: {
    type: String,
    required: true,
    maxlength: 200
  },
  longDescription: {
    type: String,
    required: true,
    maxlength: 2000
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
  tagline: {
    type: String,
    maxlength: 100
  },
  icon: {
    type: String,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
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
  experts: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    approvedAt: {
      type: Date
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  memberCount: {
    type: Number,
    default: 0
  },
  groupCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for better query performance
communitySchema.index({ category: 1, isActive: 1 });
communitySchema.index({ createdAt: -1 });
communitySchema.index({ title: 'text', shortDescription: 'text' });

// Instance method to add moderator
communitySchema.methods.addModerator = function(userId, assignedBy) {
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
communitySchema.methods.removeModerator = function(userId) {
  this.moderators = this.moderators.filter(mod => 
    mod.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Instance method to approve expert request
communitySchema.methods.approveExpert = function(userId, approvedBy) {
  const expert = this.experts.find(exp => 
    exp.userId.toString() === userId.toString()
  );
  
  if (expert) {
    expert.status = 'approved';
    expert.approvedAt = new Date();
    expert.approvedBy = approvedBy;
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to reject expert request
communitySchema.methods.rejectExpert = function(userId) {
  const expert = this.experts.find(exp => 
    exp.userId.toString() === userId.toString()
  );
  
  if (expert) {
    expert.status = 'rejected';
    return this.save();
  }
  return Promise.resolve(this);
};

// Static method to get communities with moderator and expert details
communitySchema.statics.getCommunitiesWithDetails = function(query = {}) {
  return this.find({ isActive: true, ...query })
    .populate('createdBy', 'name email avatar')
    .populate('moderators.userId', 'name email avatar')
    .populate('experts.userId', 'name email avatar')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('Community', communitySchema);


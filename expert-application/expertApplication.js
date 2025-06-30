const mongoose = require('mongoose');

const expertApplicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  communityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Community',
    required: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  location: {
    type: String,
    required: true,
    maxlength: 100
  },
  occupation: {
    type: String,
    required: true,
    maxlength: 100
  },
  degree: {
    type: String,
    required: true,
    maxlength: 100
  },
  phone: {
    type: String,
    required: true,
    maxlength: 20
  },
  socialMediaLinks: [{
    platform: {
      type: String,
      enum: ['linkedin', 'twitter', 'facebook', 'instagram', 'website', 'other'],
      required: true
    },
    url: {
      type: String,
      required: true,
      maxlength: 200
    }
  }],
  experienceYears: {
    type: Number,
    required: true,
    min: 0,
    max: 50
  },
  bio: {
    type: String,
    required: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  },
  rejectionReason: {
    type: String,
    maxlength: 500
  },
  // Additional fields for tracking
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better query performance
expertApplicationSchema.index({ userId: 1, communityId: 1 });
expertApplicationSchema.index({ communityId: 1, status: 1 });
expertApplicationSchema.index({ status: 1, submittedAt: -1 });

// Ensure one application per user per community
expertApplicationSchema.index({ userId: 1, communityId: 1 }, { unique: true });

// Instance methods
expertApplicationSchema.methods.approve = function(reviewedBy) {
  this.status = 'approved';
  this.reviewedAt = new Date();
  this.reviewedBy = reviewedBy;
  this.updatedAt = new Date();
  return this.save();
};

expertApplicationSchema.methods.reject = function(reviewedBy, reason) {
  this.status = 'rejected';
  this.reviewedAt = new Date();
  this.reviewedBy = reviewedBy;
  this.rejectionReason = reason;
  this.updatedAt = new Date();
  return this.save();
};

// Static methods
expertApplicationSchema.statics.getPendingApplications = function(communityId) {
  return this.find({ 
    communityId, 
    status: 'pending',
    isActive: true 
  })
    .populate('userId', 'name email avatar')
    .sort({ submittedAt: 1 });
};

expertApplicationSchema.statics.getUserApplication = function(userId, communityId) {
  return this.findOne({ 
    userId, 
    communityId,
    isActive: true 
  });
};

// Pre-save middleware to update timestamps
expertApplicationSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ExpertApplication', expertApplicationSchema, 'expertapplications');


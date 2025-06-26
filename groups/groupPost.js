const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  }
}, {
  timestamps: true
});

const commentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000
  },
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  replies: [replySchema],
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  }
}, {
  timestamps: true
});

const groupPostSchema = new mongoose.Schema({
  postId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return `GP${Math.floor(100000 + Math.random() * 900000)}`;
    }
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  content: {
    type: String,
    required: function() {
      return !this.mediaUrls || this.mediaUrls.length === 0;
    },
    maxlength: 5000
  },
  mediaUrls: [{
    type: String,
    url: String,
    mediaType: {
      type: String,
      enum: ['image', 'video']
    }
  }],
  tags: [{
    type: String,
    maxlength: 50
  }],
  isAnonymous: {
    type: Boolean,
    default: false
  },
  urgencyLevel: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'low'
  },
  postType: {
    type: String,
    enum: ['general', 'help', 'question', 'event', 'poll'],
    default: 'general'
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  pinnedAt: {
    type: Date
  },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  },
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [commentSchema],
  bookmarks: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  reports: [{
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser',
      required: true
    },
    reason: {
      type: String,
      required: true,
      enum: [
        'spam',
        'harassment',
        'inappropriate_content',
        'misinformation',
        'violence',
        'hate_speech',
        'other'
      ]
    },
    description: {
      type: String,
      maxlength: 500
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
      default: 'pending'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    reviewedAt: {
      type: Date
    }
  }],
  bestAnswer: {
    commentId: {
      type: mongoose.Schema.Types.ObjectId
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    markedAt: {
      type: Date
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser'
  },
  editHistory: [{
    editedAt: {
      type: Date,
      default: Date.now
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser'
    },
    previousContent: String,
    reason: String
  }]
}, {
  timestamps: true
});

// Indexes for better query performance
groupPostSchema.index({ groupId: 1, createdAt: -1 });
groupPostSchema.index({ authorId: 1, createdAt: -1 });
groupPostSchema.index({ postType: 1, urgencyLevel: 1 });
groupPostSchema.index({ isPinned: 1, createdAt: -1 });
groupPostSchema.index({ tags: 1 });
groupPostSchema.index({ 'reports.status': 1 });

// Instance method to add like
groupPostSchema.methods.addLike = function(userId) {
  const existingLike = this.likes.find(like => 
    like.userId.toString() === userId.toString()
  );
  
  if (!existingLike) {
    this.likes.push({ userId });
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to remove like
groupPostSchema.methods.removeLike = function(userId) {
  this.likes = this.likes.filter(like => 
    like.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Instance method to add comment
groupPostSchema.methods.addComment = function(userId, content) {
  this.comments.push({ userId, content });
  return this.save();
};

// Instance method to add bookmark
groupPostSchema.methods.addBookmark = function(userId) {
  const existingBookmark = this.bookmarks.find(bookmark => 
    bookmark.userId.toString() === userId.toString()
  );
  
  if (!existingBookmark) {
    this.bookmarks.push({ userId });
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to remove bookmark
groupPostSchema.methods.removeBookmark = function(userId) {
  this.bookmarks = this.bookmarks.filter(bookmark => 
    bookmark.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Instance method to pin post
groupPostSchema.methods.pin = function(pinnedBy) {
  this.isPinned = true;
  this.pinnedAt = new Date();
  this.pinnedBy = pinnedBy;
  return this.save();
};

// Instance method to unpin post
groupPostSchema.methods.unpin = function() {
  this.isPinned = false;
  this.pinnedAt = null;
  this.pinnedBy = null;
  return this.save();
};

// Instance method to mark best answer
groupPostSchema.methods.markBestAnswer = function(commentId, markedBy) {
  this.bestAnswer = {
    commentId,
    markedBy,
    markedAt: new Date()
  };
  return this.save();
};

// Instance method to report post
groupPostSchema.methods.addReport = function(reportedBy, reason, description) {
  this.reports.push({
    reportedBy,
    reason,
    description
  });
  return this.save();
};

// Instance method to soft delete
groupPostSchema.methods.softDelete = function(deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  return this.save();
};

// Static method to get group posts with details
groupPostSchema.statics.getGroupPostsWithDetails = function(groupId, query = {}) {
  return this.find({ 
    groupId, 
    isDeleted: false, 
    ...query 
  })
    .populate('authorId', 'name email avatar')
    .populate('comments.userId', 'name email avatar')
    .populate('pinnedBy', 'name email avatar')
    .sort({ isPinned: -1, createdAt: -1 });
};

module.exports = mongoose.model('GroupPost', groupPostSchema, 'groupposts');



const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  postId: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return new mongoose.Types.ObjectId().toString();
    }
  },
  authorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentUser',
    required: true
  },
  content: {
    type: String,
    required: function() {
      return !this.mediaUrl; // Content required if no media
    },
    maxlength: 2000
  },
  category: {
    type: String,
    required: true,
    enum: [
      'Parenting Tips',
      'Education',
      'Toys & Games', 
      'Mental Wellness',
      'General Thoughts'
    ]
  },
  mediaType: {
    type: String,
    enum: ['photo', 'video', ''],
    default: ''
  },
  mediaUrl: {
    type: String,
    default: ''
  },
  mediaSize: {
    type: Number,
    default: 0,
    validate: {
      validator: function(size) {
        if (this.mediaType === 'photo') {
          return size <= 2 * 1024 * 1024; // 2MB for photos
        } else if (this.mediaType === 'video') {
          return size <= 20 * 1024 * 1024; // 20MB for videos
        }
        return true;
      },
      message: 'File size exceeds allowed limit'
    }
  },
  postType: {
    type: String,
    enum: ['thought', 'photo', 'video'],
    required: true
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
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ParentUser',
      required: true
    },
    content: {
      type: String,
      required: true,
      maxlength: 500
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
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
}, {
  timestamps: true
});

// Indexes for better query performance
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ category: 1, createdAt: -1 });
postSchema.index({ postType: 1, createdAt: -1 });
postSchema.index({ createdAt: -1 });

// // Virtual for like count
// postSchema.virtual('likeCount').get(function() {
//   return this.likes.length;
// });

// // Virtual for comment count
// postSchema.virtual('commentCount').get(function() {
//   return this.comments.length;
// });

// // Ensure virtual fields are serialized
// postSchema.set('toJSON', { virtuals: true });

// // Pre-save middleware to update the updatedAt field
// postSchema.pre('save', function(next) {
//   this.updatedAt = new Date();
//   next();
// });

// // Static method to get posts with author details
// postSchema.statics.getPostsWithAuthor = function(query = {}) {
//   return this.find({ isActive: true, ...query })
//     .populate('authorId', 'name email avatar')
//     .populate('comments.userId', 'name avatar')
//     .sort({ createdAt: -1 });
// };

// Instance method to add like
postSchema.methods.addLike = function(userId) {
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
postSchema.methods.removeLike = function(userId) {
  this.likes = this.likes.filter(like => 
    like.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Instance method to add comment
postSchema.methods.addComment = function(userId, content) {
  this.comments.push({ userId, content });
  return this.save();
};

module.exports = mongoose.model('Post', postSchema);
const GroupPost = require('./groupPost');
const Group = require('./group');
const GroupMembership = require('./groupMembership');
const UserRole = require('../users/userRole');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage config for post media
const postMediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/post_media/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const postMediaFileFilter = (req, file, cb) => {
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/avi', 'video/mov'];
  const allowedDocTypes = ['application/pdf', 'text/plain'];
  
  const allAllowedTypes = [...allowedImageTypes, ...allowedVideoTypes, ...allowedDocTypes];
  
  if (allAllowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images (JPEG, PNG, WEBP, GIF), videos (MP4, WEBM, AVI, MOV), and documents (PDF, TXT) are allowed.'), false);
  }
};

const uploadPostMediaMulter = multer({
  storage: postMediaStorage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB max per file
    files: 10 // Allow up to 10 files
  },
  fileFilter: postMediaFileFilter
}).array('media', 10); // Allow up to 10 files

// Enhanced controller for post media upload
exports.uploadPostMedia = (req, res) => {
  uploadPostMediaMulter(req, res, function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
          success: false, 
          message: 'File too large. Maximum size is 50MB per file.' 
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ 
          success: false, 
          message: 'Too many files. Maximum 10 files allowed.' 
        });
      }
      return res.status(400).json({ success: false, message: err.message });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files uploaded.' });
    }

    const fileUrls = req.files.map(file => {
      let mediaType = 'document';
      if (file.mimetype.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.mimetype.startsWith('video/')) {
        mediaType = 'video';
      }

      return {
        url: `/uploads/post_media/${file.filename}`,
        mediaType,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype
      };
    });

    res.json({ 
      success: true, 
      urls: fileUrls,
      message: `Successfully uploaded ${fileUrls.length} file(s)`
    });
  });
};

// Profanity filter middleware
const profanityFilter = (text) => {
  const profanityWords = [
    'spam', 'scam', 'fake', 'stupid', 'idiot', 'hate', 'kill', 'die', 'damn', 'hell'
    // Add more words as needed
  ];

  let filteredText = text;
  profanityWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredText = filteredText.replace(regex, '*'.repeat(word.length));
  });

  return filteredText;
};

// Create Post (Group members only)
exports.createPost = async (req, res) => {
  try {
    const { groupId } = req.params;

    // Check if group exists
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is a member of the group
    const membership = await GroupMembership.findOne({
      groupId,
      userId: req.user._id,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Must be a group member to post.' });
    }

    const allowedFields = [
      'content', 'mediaUrls', 'tags', 'isAnonymous', 'urgencyLevel', 'postType'
    ];
    const postData = { groupId, authorId: req.user._id };

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) postData[field] = req.body[field];
    });

    // Apply profanity filter to content
    if (postData.content) {
      postData.content = profanityFilter(postData.content);
    }

    const post = new GroupPost(postData);
    await post.save();

    // Update group post count
    group.postCount += 1;
    await group.save();

    // Fetch the post again with author populated
    const populatedPost = await GroupPost.findById(post._id)
      .populate('authorId', 'name avatar bio')
      .populate('groupId', 'title type');

    const postObj = populatedPost.toObject();
    postObj.id = postObj._id;
    res.status(201).json(postObj);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get Posts by Group (Visible to all, interactions for members only)
exports.getPostsByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 10, postType, urgencyLevel, sortBy = 'recent' } = req.query;

    // Check if group exists
    const group = await Group.findById(groupId);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Posts are visible to all users, but interactions are restricted to members
    let isMember = false;
    let isAdmin = false;

    if (req.user) {
      // Check if user is a member of the group
      const membership = await GroupMembership.findOne({
        groupId,
        userId: req.user._id,
        status: 'active'
      });
      isMember = !!membership;

      // Check if user is platform admin
      const userRole = await UserRole.findOne({
        userId: req.user._id,
        role: 'admin',
        isActive: true
      });
      isAdmin = !!userRole;
    }

    // Build query
    const query = { groupId, isDeleted: false };
    if (postType) query.postType = postType;
    if (urgencyLevel) query.urgencyLevel = urgencyLevel;

    // Sort options
    let sortOptions = {};
    switch (sortBy) {
      case 'popular':
        sortOptions = { likeCount: -1, createdAt: -1 };
        break;
      case 'urgent':
        sortOptions = { urgencyLevel: -1, isPinned: -1, createdAt: -1 };
        break;
      default:
        sortOptions = { isPinned: -1, createdAt: -1 };
    }

    const posts = await GroupPost.find(query)
      .populate('authorId', 'name avatar bio')
      .populate('groupId', 'title type')
      .populate('comments.userId', 'name avatar')
      .populate('pinnedBy', 'name')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalPosts = await GroupPost.countDocuments(query);

    const postsWithDetails = posts.map(post => {
      const postObj = post.toObject();
      postObj.id = postObj._id;
      postObj.likeCount = post.likes.length;
      postObj.commentCount = post.comments.filter(c => !c.isDeleted).length;
      postObj.bookmarkCount = post.bookmarks.length;

      // Add interaction permissions
      postObj.canInteract = isMember || isAdmin;

      // Check if current user has liked/bookmarked (only if they can interact)
      if (req.user && (isMember || isAdmin)) {
        postObj.isLiked = post.likes.some(like =>
          like.userId.toString() === req.user._id.toString()
        );
        postObj.isBookmarked = post.bookmarks.some(bookmark =>
          bookmark.userId.toString() === req.user._id.toString()
        );
      } else {
        postObj.isLiked = false;
        postObj.isBookmarked = false;
      }

      return postObj;
    });

    res.json({
      posts: postsWithDetails,
      totalPages: Math.ceil(totalPosts / limit),
      currentPage: parseInt(page),
      totalPosts,
      hasNextPage: page < Math.ceil(totalPosts / limit),
      hasPrevPage: page > 1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Post by ID
exports.getPostById = async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.id)
      .populate('authorId', 'name avatar bio')
      .populate('groupId', 'title type')
      .populate('comments.userId', 'name avatar')
      .populate('comments.replies.userId', 'name avatar')
      .populate('pinnedBy', 'name');

    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user has access to view this post
    if (req.user) {
      const membership = await GroupMembership.findOne({
        groupId: post.groupId._id,
        userId: req.user._id,
        status: 'active'
      });

      if (!membership) {
        return res.status(403).json({ error: 'Access denied. Must be a group member to view this post.' });
      }
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const postObj = post.toObject();
    postObj.id = postObj._id;
    postObj.likeCount = post.likes.length;
    postObj.commentCount = post.comments.filter(c => !c.isDeleted).length;
    postObj.bookmarkCount = post.bookmarks.length;

    // Check if current user has liked/bookmarked
    if (req.user) {
      postObj.isLiked = post.likes.some(like =>
        like.userId.toString() === req.user._id.toString()
      );
      postObj.isBookmarked = post.bookmarks.some(bookmark =>
        bookmark.userId.toString() === req.user._id.toString()
      );
    }

    res.json(postObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Post (Author or Admin/Moderator only)
exports.updatePost = async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is the author or has moderation privileges
    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!isAuthor && !membership) {
      return res.status(403).json({ error: 'Access denied. Only author or moderators can edit posts.' });
    }

    // Store edit history if content is being changed
    if (req.body.content && req.body.content !== post.content) {
      post.editHistory.push({
        editedBy: req.user._id,
        previousContent: post.content,
        reason: req.body.editReason || 'Content updated'
      });
    }

    const allowedFields = ['content', 'tags', 'urgencyLevel', 'postType'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'content') {
          post[field] = profanityFilter(req.body[field]);
        } else {
          post[field] = req.body[field];
        }
      }
    });

    await post.save();

    const updatedPost = await GroupPost.findById(post._id)
      .populate('authorId', 'name avatar bio')
      .populate('groupId', 'title type');

    res.json(updatedPost);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete Post (Author or Admin/Moderator only)
exports.deletePost = async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is the author or has moderation privileges
    const isAuthor = post.authorId.toString() === req.user._id.toString();
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!isAuthor && !membership) {
      return res.status(403).json({ error: 'Access denied. Only author or moderators can delete posts.' });
    }

    await post.softDelete(req.user._id);

    // Update group post count
    const group = await Group.findById(post.groupId);
    if (group) {
      group.postCount = Math.max(0, group.postCount - 1);
      await group.save();
    }

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Like/Unlike Post
exports.toggleLike = async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is a member of the group or is an admin
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active'
    });

    // Check if user is platform admin
    const userRole = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      isActive: true
    });

    if (!membership && !userRole) {
      return res.status(403).json({ error: 'Access denied. Must be a group member to like posts.' });
    }

    const existingLike = post.likes.find(like =>
      like.userId.toString() === req.user._id.toString()
    );

    let liked;
    if (existingLike) {
      await post.removeLike(req.user._id);
      liked = false;
    } else {
      await post.addLike(req.user._id);
      liked = true;
    }

    // Get the updated post to return accurate like count
    const updatedPost = await GroupPost.findById(req.params.id);

    res.json({
      success: true,
      liked,
      likeCount: updatedPost.likes.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Add Comment
exports.addComment = async (req, res) => {
  try {
    const { content } = req.body;
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is a member of the group
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Must be a group member to comment.' });
    }

    const filteredContent = profanityFilter(content);
    await post.addComment(req.user._id, filteredContent);

    const updatedPost = await GroupPost.findById(post._id)
      .populate('comments.userId', 'name avatar');

    const newComment = updatedPost.comments[updatedPost.comments.length - 1];
    res.status(201).json(newComment);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Add Reply to Comment
exports.addReply = async (req, res) => {
  try {
    const { content } = req.body;
    const { commentId } = req.params;
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is a member of the group
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Must be a group member to reply.' });
    }

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    const filteredContent = profanityFilter(content);
    const newReply = {
      userId: req.user._id,
      content: filteredContent
    };

    comment.replies.push(newReply);
    await post.save();

    const updatedPost = await GroupPost.findById(post._id)
      .populate('comments.replies.userId', 'name avatar');

    const updatedComment = updatedPost.comments.id(commentId);
    const reply = updatedComment.replies[updatedComment.replies.length - 1];

    res.status(201).json(reply);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Toggle Bookmark
exports.toggleBookmark = async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is a member of the group
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Must be a group member to bookmark posts.' });
    }

    const existingBookmark = post.bookmarks.find(bookmark =>
      bookmark.userId.toString() === req.user._id.toString()
    );

    let bookmarked;
    if (existingBookmark) {
      await post.removeBookmark(req.user._id);
      bookmarked = false;
    } else {
      await post.addBookmark(req.user._id);
      bookmarked = true;
    }

    res.json({
      success: true,
      bookmarked,
      bookmarkCount: post.bookmarks.length + (bookmarked ? 1 : -1)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Pin/Unpin Post (Group Admin/Moderator or Platform Admin)
exports.togglePin = async (req, res) => {
  try {
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user has moderation privileges in the group
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    // Check if user is platform admin
    const userRole = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      isActive: true
    });
    const isPlatformAdmin = !!userRole;

    if (!membership && !isPlatformAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin or moderator privileges required.' });
    }

    if (post.isPinned) {
      await post.unpin();
    } else {
      await post.pin(req.user._id);
    }

    res.json({
      success: true,
      isPinned: !post.isPinned,
      message: post.isPinned ? 'Post unpinned' : 'Post pinned'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Mark Best Answer (Expert only)
exports.markBestAnswer = async (req, res) => {
  try {
    const { commentId } = req.body;
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is an expert
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'mark_best_answer');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Expert privileges required.' });
    }

    // Check if user is a member of the group
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Must be a group member.' });
    }

    const comment = post.comments.id(commentId);
    if (!comment) return res.status(404).json({ error: 'Comment not found' });

    await post.markBestAnswer(commentId, req.user._id);

    res.json({ success: true, message: 'Best answer marked successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Report Post
exports.reportPost = async (req, res) => {
  try {
    const { reason, description } = req.body;
    const post = await GroupPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Check if user is a member of the group
    const membership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Must be a group member to report posts.' });
    }

    await post.addReport(req.user._id, reason, description);

    res.json({ success: true, message: 'Post reported successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

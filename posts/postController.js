const Post = require('./post');
const User = require('../users/parentUser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = 'uploads/posts/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.fieldname === 'media') {
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', // Images
      'video/mp4' // Videos
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP images and MP4 videos are allowed.'), false);
    }
  } else {
    cb(new Error('Unexpected field'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB max file size
  },
  fileFilter: fileFilter
});

// Create a new post
exports.createPost = async (req, res) => {
  try {
    const { authorId, content, category, mediaType, mediaUrl, mediaSize, postType } = req.body;
    
    // Validate required fields
    if (!authorId || !category || !postType) {
      return res.status(400).json({
        success: false,
        message: 'Author ID, category, and post type are required'
      });
    }

    // Validate that either content or media is provided
    if (!content && !mediaUrl) {
      return res.status(400).json({
        success: false,
        message: 'Either content or media must be provided'
      });
    }

    // Validate author exists and ensure it's a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(authorId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid author ID format'
      });
    }

    const author = await User.findById(authorId);
    if (!author) {
      return res.status(404).json({
        success: false,
        message: 'Author not found'
      });
    }

    // Validate file size limits
    if (mediaType === 'photo' && mediaSize > 2 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Image size must be under 2MB'
      });
    }

    if (mediaType === 'video' && mediaSize > 20 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'Video size must be under 20MB'
      });
    }

    // Create new post with proper ObjectId conversion
    const newPost = new Post({
      authorId: new mongoose.Types.ObjectId(authorId), // Ensure it's a proper ObjectId
      content: content || '',
      category,
      mediaType: mediaType || '',
      mediaUrl: mediaUrl || '',
      mediaSize: mediaSize || 0,
      postType
    });

    const savedPost = await newPost.save();

    // Populate author details for response
    await savedPost.populate('authorId', 'name email avatar bio');

    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      postId: savedPost.postId,
      post: savedPost
    });

  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create post',
      error: error.message
    });
  }
};

// Upload media file
exports.uploadMedia = upload.single('media');

exports.handleMediaUpload = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Validate file size based on type
    const isImage = req.file.mimetype.startsWith('image/');
    const isVideo = req.file.mimetype.startsWith('video/');

    if (isImage && req.file.size > 2 * 1024 * 1024) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Image size must be under 2MB'
      });
    }

    if (isVideo && req.file.size > 20 * 1024 * 1024) {
      // Delete uploaded file
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Video size must be under 20MB'
      });
    }

    const fileUrl = `/uploads/posts/${req.file.filename}`;

    res.status(200).json({
      success: true,
      message: 'File uploaded successfully',
      url: fileUrl,
      filename: req.file.filename,
      size: req.file.size,
      type: req.file.mimetype
    });

  } catch (error) {
    console.error('Error uploading media:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload media',
      error: error.message
    });
  }
};

// Get all posts with enhanced debugging
exports.getAllPosts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // console.log('=== DEBUGGING POST RETRIEVAL ===');
    // console.log('Fetching posts with pagination:', { page, limit, skip });

    // Step 1: Check raw posts without populate
    const rawPosts = await Post.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    // console.log('Total raw posts found:', rawPosts.length);
    // console.log('Raw authorId values:', rawPosts.map(p => ({
    //   postId: p._id,
    //   authorId: p.authorId,
    //   authorIdType: typeof p.authorId,
    //   isValidObjectId: mongoose.Types.ObjectId.isValid(p.authorId)
    // })));

    // Step 2: Check if users exist for these authorIds
    const authorIds = rawPosts.map(p => p.authorId).filter(id => id && mongoose.Types.ObjectId.isValid(id));
    // console.log('Valid author IDs to check:', authorIds);
    
    const existingUsers = await User.find({ _id: { $in: authorIds } }).select('_id name email');
    // console.log('Existing users found:', existingUsers);

    // Step 3: Try populate with better error handling
    const posts = await Post.find({ isActive: true })
      .populate({
        path: 'authorId',
        select: 'name email avatar bio',
        options: { strictPopulate: false }
      })
      .populate('comments.userId', 'name avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for better performance

    // console.log('=== POPULATE RESULTS ===');
    // posts.forEach((post, index) => {
    //   console.log(`Post ${index + 1}:`, {
    //     postId: post._id,
    //     originalAuthorId: rawPosts[index]?.authorId,
    //     populatedAuthor: post.authorId,
    //     hasAuthorData: !!post.authorId?.name
    //   });
    // });

    // Step 4: Manual population for null authors (fallback)
    const processedPosts = await Promise.all(posts.map(async (post) => {
      if (!post.authorId && post.authorId !== null) {
        // Try to find the original authorId from raw data
        const rawPost = rawPosts.find(rp => rp._id.toString() === post._id.toString());
        if (rawPost && rawPost.authorId) {
          try {
            const author = await User.findById(rawPost.authorId).select('name email avatar bio').lean();
            if (author) {
              console.log(`Manual population successful for post ${post._id}`);
              return { ...post, authorId: author };
            }
          } catch (error) {
            console.log(`Manual population failed for post ${post._id}:`, error.message);
          }
        }
      }
      return post;
    }));

    const totalPosts = await Post.countDocuments({ isActive: true });
    const totalPages = Math.ceil(totalPosts / limit);

    // console.log('=== FINAL RESPONSE ===');
    // console.log('Total posts in response:', processedPosts.length);
    // console.log('Posts with valid authors:', processedPosts.filter(p => p.authorId?.name).length);

    res.status(200).json({
      success: true,
      posts: processedPosts,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch posts',
      error: error.message
    });
  }
};

// Helper function to clean up orphaned posts
exports.cleanupOrphanedPosts = async (req, res) => {
  try {
    console.log('Starting cleanup of orphaned posts...');
    
    // Find all posts
    const allPosts = await Post.find({});
    console.log(`Found ${allPosts.length} total posts`);
    
    let orphanedCount = 0;
    let cleanedCount = 0;
    
    for (const post of allPosts) {
      if (!post.authorId || !mongoose.Types.ObjectId.isValid(post.authorId)) {
        console.log(`Post ${post._id} has invalid authorId: ${post.authorId}`);
        orphanedCount++;
        continue;
      }
      
      const author = await User.findById(post.authorId);
      if (!author) {
        console.log(`Post ${post._id} has non-existent author: ${post.authorId}`);
        // Optionally delete or mark as inactive
        // await Post.findByIdAndUpdate(post._id, { isActive: false });
        cleanedCount++;
      }
    }
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      stats: {
        totalPosts: allPosts.length,
        orphanedPosts: orphanedCount,
        postsWithMissingAuthors: cleanedCount
      }
    });
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Cleanup failed',
      error: error.message
    });
  }
};
// Get posts by category
exports.getPostsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await Post.getPostsWithAuthor({ category })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments({ category, isActive: true });
    const totalPages = Math.ceil(totalPosts / limit);

    res.status(200).json({
      success: true,
      posts,
      category,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching posts by category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch posts by category',
      error: error.message
    });
  }
};

// Get posts by user
exports.getUserPosts = async (req, res) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await Post.getPostsWithAuthor({ authorId: userId })
      .skip(skip)
      .limit(limit);

    const totalPosts = await Post.countDocuments({ authorId: userId, isActive: true });
    const totalPages = Math.ceil(totalPosts / limit);

    res.status(200).json({
      success: true,
      posts,
      userId,
      pagination: {
        currentPage: page,
        totalPages,
        totalPosts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });

  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user posts',
      error: error.message
    });
  }
};

// Get single post by ID
exports.getPostById = async (req, res) => {
  try {
    const { postId } = req.params;

    const post = await Post.findOne({ postId, isActive: true })
      .populate('authorId', 'name email avatar')
      .populate('comments.userId', 'name avatar');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    res.status(200).json({
      success: true,
      post
    });

  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post',
      error: error.message
    });
  }
};

// Update post
exports.updatePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content, category } = req.body;
    const userId = req.user.id;

    const post = await Post.findOne({ postId, isActive: true });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the author
    if (post.authorId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own posts'
      });
    }

    // Update fields if provided
    if (content !== undefined) post.content = content;
    if (category !== undefined) post.category = category;

    const updatedPost = await post.save();
    await updatedPost.populate('authorId', 'name email avatar');

    res.status(200).json({
      success: true,
      message: 'Post updated successfully',
      post: updatedPost
    });

  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update post',
      error: error.message
    });
  }
};

// Delete post (soft delete)
exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;

    const post = await Post.findOne({ postId, isActive: true });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if user is the author
    if (post.authorId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own posts'
      });
    }

    // Soft delete
    post.isActive = false;
    await post.save();

    // Delete associated media file if exists
    if (post.mediaUrl) {
      const filePath = path.join(__dirname, '..', post.mediaUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Post deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete post',
      error: error.message
    });
  }
};

// Like/Unlike post
// Replace your existing toggleLike function in the controller:
exports.toggleLike = async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.body;

    // Validate inputs
    if (!postId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Post ID and User ID are required'
      });
    }

    // Validate userId format
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const post = await Post.findOne({ postId, isActive: true });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    const existingLikeIndex = post.likes.findIndex(like => 
      like.userId.toString() === userId.toString()
    );

    let liked = false;
    let message = '';

    if (existingLikeIndex > -1) {
      // Unlike the post - remove the like
      post.likes.splice(existingLikeIndex, 1);
      liked = false;
      message = 'Post unliked successfully';
    } else {
      // Like the post - add the like
      post.likes.push({ 
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: new Date()
      });
      liked = true;
      message = 'Post liked successfully';
    }

    await post.save();

    res.status(200).json({
      success: true,
      message,
      liked,
      likeCount: post.likes.length,
      likes: post.likes.map(like => like.userId) // Return just the userIds for privacy
    });

  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle like',
      error: error.message
    });
  }
};
// Fixed Check if user has liked a post
exports.getLikeStatus = async (req, res) => {
  try {
    const { postId, userId } = req.params;
    
    if (!postId || !userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Post ID and User ID are required' 
      });
    }

    const post = await Post.findOne({ postId, isActive: true });
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }

    const hasLiked = post.likes.some(like => 
      like.userId.toString() === userId.toString()
    );

    return res.json({ 
      success: true,
      hasLiked, 
      likeCount: post.likes.length,
      likes: post.likes
    });

  } catch (error) {
    console.error('Error checking like status:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error', 
      error: error.message 
    });
  }
};


// // Dislike a post (simple counter, not per-user)
// exports.dislikePost = async (req, res) => {
//   try {
//     const { postId } = req.params;
//     const post = await Post.findOne({ postId, isActive: true });
//     if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
//     // Add a dislikes field if not present
//     if (typeof post.dislikes !== 'number') post.dislikes = 0;
//     post.dislikes += 1;
//     await post.save();
//     res.json({ success: true, message: 'Disliked successfully', dislikes: post.dislikes });
//   } catch (error) {
//     res.status(500).json({ success: false, message: 'Server error', error: error.message });
//   }
// };

// Fixed Get all comments for a post
exports.getComments = async (req, res) => {
  try {
    const { postId } = req.params;
    
    if (!postId) {
      return res.status(400).json({
        success: false,
        message: 'Post ID is required'
      });
    }

    const post = await Post.findOne({ postId, isActive: true })
      .populate('comments.userId', 'name avatar')
      .lean();
    
    if (!post) {
      return res.status(404).json({ 
        success: false, 
        message: 'Post not found' 
      });
    }

    // Transform comments to frontend format and sort by newest first
    const transformedComments = post.comments
      .map(comment => ({
        _id: comment._id,
        comment: comment.content, // Map content to comment
        authorName: comment.userId?.name || 'Unknown User',
        authorAvatar: comment.userId?.avatar || '',
        createdAt: comment.createdAt
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ 
      success: true, 
      comments: transformedComments,
      commentCount: transformedComments.length
    });

  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch comments', 
      error: error.message 
    });
  }
};

// Add comment to post
exports.addComment = async (req, res) => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Comment content is required'
      });
    }

    const post = await Post.findOne({ postId, isActive: true });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    post.comments.push({ userId, content: content.trim() });
    await post.save();

    // Re-fetch with populated data
    const updatedPost = await Post.findOne({ postId })
      .populate('comments.userId', 'name avatar');

    const newComment = updatedPost.comments[updatedPost.comments.length - 1];
    
    // Transform to frontend format
    const transformedComment = {
      _id: newComment._id,
      comment: newComment.content, // Map content to comment
      authorName: newComment.userId?.name || 'Unknown User',
      authorAvatar: newComment.userId?.avatar || '',
      createdAt: newComment.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      comment: transformedComment,
      commentCount: updatedPost.comments.length
    });

  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment',
      error: error.message
    });
  }
};
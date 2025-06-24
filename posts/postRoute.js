const express = require('express');
const router = express.Router();
const postController = require('./postController');
const authMiddleware = require('../middleware/auth');

// ✅ Public routes
router.get('/', postController.getAllPosts); // Feed
router.get('/category/:category', postController.getPostsByCategory);
router.get('/user/:userId', postController.getUserPosts);
router.get('/:postId', postController.getPostById);
router.get('/:postId/like-status/:userId', postController.getLikeStatus); // Like status
router.get('/:postId/comments', postController.getComments); // Get all comments for a post

// ✅ Protected routes
router.post('/', authMiddleware, postController.createPost);
router.post('/upload', authMiddleware, postController.uploadMedia, postController.handleMediaUpload);
router.put('/:postId', authMiddleware, postController.updatePost);
router.delete('/:postId', authMiddleware, postController.deletePost);
router.post('/:postId/like', authMiddleware, postController.toggleLike);
router.post('/:postId/comment', authMiddleware, postController.addComment);


module.exports = router;
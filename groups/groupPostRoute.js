const express = require('express');
const router = express.Router();
const groupPostController = require('./groupPostController');
const auth = require('../middleware/auth');
const { 
  requireGroupMembership, 
  requirePermission,
  canModeratePost 
} = require('../middleware/authorization');
const { filterPostContent, filterCommentContent } = require('../middleware/contentFilter');

// Media upload route (authenticated users only)
router.post('/upload-media', auth, groupPostController.uploadPostMedia);

// Post CRUD routes
router.post('/group/:groupId', 
  auth, 
  requireGroupMembership('active'), 
  filterPostContent, 
  groupPostController.createPost
);

router.get('/group/:groupId', 
  auth, 
  requireGroupMembership('active'), 
  groupPostController.getPostsByGroup
);

router.get('/:id', 
  auth, 
  groupPostController.getPostById
);

router.put('/:id', 
  auth, 
  filterPostContent, 
  groupPostController.updatePost
);

router.delete('/:id', 
  auth, 
  groupPostController.deletePost
);

// Post interaction routes (require group membership)
router.post('/:id/like', 
  auth, 
  groupPostController.toggleLike
);

router.post('/:id/bookmark', 
  auth, 
  groupPostController.toggleBookmark
);

router.post('/:id/pin', 
  auth, 
  canModeratePost, 
  groupPostController.togglePin
);

// Comment routes (require group membership)
router.post('/:id/comments', 
  auth, 
  filterCommentContent, 
  groupPostController.addComment
);

router.post('/:id/comments/:commentId/replies', 
  auth, 
  filterCommentContent, 
  groupPostController.addReply
);

// Expert features (require expert permission)
router.post('/:id/best-answer', 
  auth, 
  requirePermission('mark_best_answer'), 
  groupPostController.markBestAnswer
);

// Reporting (require group membership)
router.post('/:id/report', 
  auth, 
  groupPostController.reportPost
);

module.exports = router;


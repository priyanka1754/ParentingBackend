const express = require('express');
const router = express.Router();
const moderationController = require('./moderationController');
const auth = require('../middleware/auth');
const { requireAdmin, requirePermission, canModeratePost } = require('../middleware/authorization');

// Reported content management
router.get('/reports', 
  auth, 
  requirePermission('view_reports'), 
  moderationController.getReportedContent
);

router.post('/reports/:contentType/:contentId/review', 
  auth, 
  requirePermission('moderate_posts'), 
  moderationController.reviewReport
);

// User moderation
router.post('/ban-user', 
  auth, 
  canModeratePost, 
  moderationController.banUserFromGroup
);

router.post('/unban-user', 
  auth, 
  canModeratePost, 
  moderationController.unbanUserFromGroup
);

router.get('/banned-users/:groupId', 
  auth, 
  requirePermission('view_reports'), 
  moderationController.getBannedUsers
);

// Content moderation
router.post('/delete-post', 
  auth, 
  canModeratePost, 
  moderationController.deletePost
);

router.post('/edit-post', 
  auth, 
  canModeratePost, 
  moderationController.editPost
);

// Moderation logs and statistics (Admin only)
router.get('/logs', 
  auth, 
  requireAdmin, 
  moderationController.getModerationLogs
);

router.get('/stats', 
  auth, 
  requireAdmin, 
  moderationController.getModerationStats
);

module.exports = router;


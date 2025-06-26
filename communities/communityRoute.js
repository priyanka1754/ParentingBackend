const express = require('express');
const router = express.Router();
const communityController = require('./communityController');
const auth = require('../middleware/auth');
const { requireAdmin, requirePermission, optionalAuth } = require('../middleware/authorization');

// Media upload route (authenticated users only)
router.post('/upload-media', auth, communityController.uploadCommunityMedia);

// Community CRUD routes
router.post('/', auth, requirePermission('create_community'), communityController.createCommunity);
router.get('/', optionalAuth, communityController.getCommunities); // Optional auth for filtering
router.get('/:id', optionalAuth, communityController.getCommunityById);
router.put('/:id', auth, requirePermission('edit_community'), communityController.updateCommunity);
router.delete('/:id', auth, requirePermission('delete_community'), communityController.deleteCommunity);

// Moderator management routes (Admin only)
router.post('/:id/moderators', auth, requirePermission('assign_moderators'), communityController.assignModerator);
router.delete('/:id/moderators', auth, requirePermission('assign_moderators'), communityController.removeModerator);

// Expert management routes
router.post('/:id/expert-request', auth, communityController.requestExpertStatus);
router.post('/:id/approve-expert', auth, requirePermission('approve_experts'), communityController.approveExpertRequest);
router.post('/:id/reject-expert', auth, requirePermission('approve_experts'), communityController.rejectExpertRequest);

// Statistics route (public)
router.get('/:id/stats', communityController.getCommunityStats);

module.exports = router;


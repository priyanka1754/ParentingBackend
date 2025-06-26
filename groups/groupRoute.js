const express = require('express');
const router = express.Router();
const groupController = require('./groupController');
const auth = require('../middleware/auth');
const { 
  requireGroupMembership, 
  requireGroupModerator, 
  requireGroupAdmin,
  optionalAuth 
} = require('../middleware/authorization');

// Media upload route (authenticated users only)
router.post('/upload-media', auth, groupController.uploadGroupMedia);

// Group CRUD routes
router.post('/', auth, groupController.createGroup);
router.get('/community/:communityId', optionalAuth, groupController.getGroupsByCommunity);
router.get('/:id', optionalAuth, groupController.getGroupById);
router.put('/:id', auth, groupController.updateGroup); // Updated to use creator/admin check
router.delete('/:id', auth, groupController.deleteGroup); // New delete route

// Group membership routes
router.post('/:id/join', auth, groupController.joinGroup);
router.post('/:id/leave', auth, requireGroupMembership('active'), groupController.leaveGroup);
router.get('/:id/members', optionalAuth, groupController.getGroupMembers); // Updated to show members to all

// Join request management routes (Admin/Moderator only)
router.get('/:id/pending-requests', auth, requireGroupModerator, groupController.getPendingRequests);
router.post('/:id/approve-request', auth, requireGroupModerator, groupController.approveJoinRequest);
router.post('/:id/reject-request', auth, requireGroupModerator, groupController.rejectJoinRequest);

// Group rules management (Admin only)
router.post('/:id/rules', auth, requireGroupAdmin, groupController.addGroupRule);
router.delete('/:id/rules/:ruleId', auth, requireGroupAdmin, groupController.removeGroupRule);

module.exports = router;


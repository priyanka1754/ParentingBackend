const express = require('express');
const router = express.Router();
const userRoleController = require('./userRoleController');
const auth = require('../middleware/auth');
const { requireAdmin, requirePermission } = require('../middleware/authorization');

// Get user roles (users can view their own, admins can view any)
router.get('/user/:userId', auth, userRoleController.getUserRoles);

// Role management routes (Admin only)
router.post('/assign', auth, requireAdmin, userRoleController.assignRole);
router.post('/remove', auth, requireAdmin, userRoleController.removeRole);
router.get('/role/:role', auth, requireAdmin, userRoleController.getUsersByRole);

// Expert verification routes (Admin only)
router.get('/pending-experts', auth, requireAdmin, userRoleController.getPendingExperts);
router.post('/verify-expert', auth, requireAdmin, userRoleController.verifyExpert);
router.post('/reject-expert', auth, requireAdmin, userRoleController.rejectExpert);

// Permission management
router.get('/permissions/check', auth, userRoleController.checkPermissions);
router.post('/permissions/update', auth, requireAdmin, userRoleController.updatePermissions);

// Statistics (Admin only)
router.get('/stats', auth, requireAdmin, userRoleController.getRoleStats);

module.exports = router;


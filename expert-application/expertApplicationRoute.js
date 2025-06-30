const express = require('express');
const router = express.Router();
const expertApplicationController = require('./expertApplicationController');
const auth = require('../middleware/auth');

// Submit expert application
router.post('/communities/:communityId/apply', auth, expertApplicationController.submitApplication);

// Get user's application status for a community
router.get('/communities/:communityId/my-application', auth, expertApplicationController.getUserApplication);

// Update user's pending application
router.put('/applications/:applicationId', auth, expertApplicationController.updateApplication);

// Get application by ID (admin or applicant)
router.get('/applications/:applicationId', auth, expertApplicationController.getApplicationById);

// Admin routes for managing applications
router.get('/communities/:communityId/applications/pending', auth, expertApplicationController.getPendingApplications);
router.get('/communities/:communityId/applications', auth, expertApplicationController.getAllApplications);
router.post('/applications/:applicationId/approve', auth, expertApplicationController.approveApplication);
router.post('/applications/:applicationId/reject', auth, expertApplicationController.rejectApplication);

module.exports = router;


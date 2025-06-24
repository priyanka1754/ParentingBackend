const express = require('express');
const router = express.Router();
const eventCtrl = require('./eventController');
const auth = require('../middleware/auth'); // your JWT/auth middleware

router.post('/', auth, eventCtrl.createEvent);
router.get('/', eventCtrl.getEvents);
router.get('/:id', eventCtrl.getEventById);
router.put('/:id', auth, eventCtrl.updateEvent);
router.delete('/:id', auth, eventCtrl.cancelEvent);
router.post('/:id/rsvp', auth, eventCtrl.rsvpEvent);
router.post('/:id/comment', auth, eventCtrl.addComment); // New route for adding a comment
router.get('/:id/comments', eventCtrl.getComments); // New route for fetching all comments for an event
// Add this route for media upload
router.post('/upload', auth, eventCtrl.uploadEventMedia);
router.post('/:id/feedback', auth, eventCtrl.addFeedback);
router.get('/:id/feedback', eventCtrl.getFeedback);
router.post('/:id/comment/:commentId/reply', auth, eventCtrl.replyToComment); // Reply to a comment
router.post('/:id/comment/:commentId/like', auth, eventCtrl.likeComment); // Like/unlike a comment
router.get('/user/:userId', eventCtrl.getUserEvents); // New route for getting events created by a user

module.exports = router;
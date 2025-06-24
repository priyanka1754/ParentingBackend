const Event = require('./event'); // Your Mongoose Event model
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage config for event media
const eventMediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/event_media/';
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

const eventMediaFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP images and MP4/WEBM videos are allowed.'), false);
  }
};

const uploadEventMediaMulter = multer({
  storage: eventMediaStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: eventMediaFileFilter
}).single('media');

// Controller for event media upload
exports.uploadEventMedia = (req, res) => {
  uploadEventMediaMulter(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    // Return the relative URL to the uploaded file
    const fileUrl = `/uploads/event_media/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  });
};

// Create Event (secure: whitelist fields, set host from JWT)
exports.createEvent = async (req, res) => {
  try {
    const allowedFields = [
      'title', 'description', 'date', 'time', 'coverImageUrl', 'eventType',
      'location', 'meetingLink', 'category', 'maxAttendees', 'visibility', 'duration'
    ];
    const eventData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) eventData[field] = req.body[field];
    });
    eventData.host = req.user._id; // Always set host from JWT
    const event = new Event(eventData);
    await event.save();
    // Fetch the event again with host populated
    const populatedEvent = await Event.findById(event._id).populate('host', 'name avatar bio');
    // Always return id as both _id and id for frontend compatibility
    const eventObj = populatedEvent.toObject();
    eventObj.id = eventObj._id;
    res.status(201).json(eventObj);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get All Events (with filters, pagination)
exports.getEvents = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, type, location, past } = req.query;
    const now = new Date();
    let filter = { isCancelled: false };
    if (category) filter.category = category;
    if (type) filter.eventType = type;
    if (location) filter.location = location;
    if (past === 'true') {
      // Only completed events: endTime < now
      filter.$expr = {
        $lt: [
          { $add: [
            { $toLong: "$date" },
            { $multiply: [ { $ifNull: ["$duration", 1] }, 60 * 60 * 1000 ] }
          ] },
          now.getTime()
        ]
      };
      console.log('[getEvents] Completed filter:', JSON.stringify(filter.$expr), '| Now:', now.toISOString());
    } else {
      // Upcoming or ongoing: endTime >= now
      filter.$expr = {
        $gte: [
          { $add: [
            { $toLong: "$date" },
            { $multiply: [ { $ifNull: ["$duration", 1] }, 60 * 60 * 1000 ] }
          ] },
          now.getTime()
        ]
      };
      console.log('[getEvents] Upcoming/Ongoing filter:', JSON.stringify(filter.$expr), '| Now:', now.toISOString());
    }
    // Remove old date filter if present
    delete filter.date;

    const events = await Event.find(filter)
      .populate('host', 'name avatar bio')
      .sort({ date: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    console.log('[getEvents] Returned events:', events.map(e => ({ title: e.title, date: e.date, duration: e.duration })));
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Event by ID
exports.getEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      // Populate host with _id as id, name, avatar, bio
      .populate({
        path: 'host',
        select: 'name avatar bio',
        transform: (doc) => doc ? { id: doc._id, name: doc.name, avatar: doc.avatar, bio: doc.bio } : null
      });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Event (host only, whitelist fields)
exports.updateEvent = async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    // Debugging output to help trace 403 errors
    console.log('Event host:', event.host);
    console.log('Authenticated user _id:', req.user._id);
    if (String(event.host) !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not authorized', debug: { eventHost: event.host, userId: req.user._id } });
    }
    const allowedFields = [
      'title', 'description', 'date', 'time', 'coverImageUrl', 'eventType',
      'location', 'meetingLink', 'category', 'maxAttendees', 'visibility'
    ];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) event[field] = req.body[field];
    });
    event.updatedAt = new Date();
    await event.save();
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Cancel Event (host only)
exports.cancelEvent = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (String(event.host) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    event.isCancelled = true;
    await event.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// RSVP to Event
exports.rsvpEvent = async (req, res) => {
  try {
    const { status } = req.body;
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Check if already RSVP'd
    const existing = event.attendees.find(a => String(a.userId) === String(req.user._id));
    if (existing) {
      existing.status = status;
      existing.respondedAt = new Date();
    } else {
      if (event.maxAttendees && event.attendees.filter(a => a.status === 'Going').length >= event.maxAttendees && status === 'Going') {
        return res.status(400).json({ error: 'Event is full' });
      }
      event.attendees.push({ userId: req.user._id, status, respondedAt: new Date() });
    }
    await event.save();
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Add a comment to an event
exports.addComment = async (req, res) => {
  try {
    const eventId = req.params.id;
    const { comment } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;
    const userAvatar = req.user.avatar;

    if (!comment || !comment.trim()) {
      return res.status(400).json({ message: 'Comment cannot be empty.' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    const newComment = {
      eventId,
      userId,
      comment,
      authorName: userName,
      authorAvatar: userAvatar,
      createdAt: new Date()
    };

    event.comments = event.comments || [];
    event.comments.push(newComment);
    await event.save();

    res.status(201).json(newComment);
  } catch (err) {
    res.status(500).json({ message: 'Failed to add comment.', error: err.message });
  }
};

// Get all comments for an event
exports.getComments = async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    res.json(event.comments || []);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch comments.', error: err.message });
  }
};

// Add feedback to an event
exports.addFeedback = async (req, res) => {
  try {
    const eventId = req.params.id;
    // Accept both 'review' and 'comment' for compatibility
    const { rating, review, comment } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;
    const userAvatar = req.user.avatar;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5.' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }

    // Only allow feedback if event is completed
    const now = new Date();
    const eventStart = new Date(event.date);
    const [hours, minutes] = event.time.split(':').map(Number);
    eventStart.setHours(hours, minutes, 0, 0);
    const eventEnd = new Date(eventStart.getTime() + Number(event.duration) * 60 * 60 * 1000);
    if (now < eventEnd) {
      return res.status(400).json({ message: 'Feedback can only be given after the event is completed.' });
    }

    // Only allow feedback if user RSVP'd as 'Going'
    const attendee = (event.attendees || []).find(a => String(a.userId) === String(userId) && a.status === 'Going');
    if (!attendee) {
      return res.status(403).json({ message: 'Only users who RSVP’d as Going can give feedback.' });
    }

    // Prevent duplicate feedback from the same user
    const existing = event.feedback.find(f => String(f.userId) === String(userId));
    const feedbackText = comment || review || '';
    if (existing) {
      existing.rating = rating;
      existing.review = feedbackText;
      existing.createdAt = new Date();
    } else {
      const newFeedback = {
        eventId,
        userId,
        rating,
        review: feedbackText,
        authorName: userName,
        authorAvatar: userAvatar,
        createdAt: new Date()
      };
      event.feedback.push(newFeedback);
    }
    await event.save();
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add feedback.', error: err.message });
  }
};

// Get all feedback for an event
exports.getFeedback = async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: 'Event not found.' });
    }
    // Map 'review' to 'comment' for frontend compatibility
    const feedbackList = (event.feedback || []).map(fb => ({
      ...fb.toObject ? fb.toObject() : fb,
      comment: fb.review || ''
    }));
    res.json(feedbackList);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch feedback.', error: err.message });
  }
};

// Add a reply to a comment
exports.replyToComment = async (req, res) => {
  try {
    const eventId = req.params.id;
    const commentId = req.params.commentId;
    const { reply } = req.body;
    const userId = req.user._id;
    const userName = req.user.name;
    const userAvatar = req.user.avatar;
    if (!reply || !reply.trim()) {
      return res.status(400).json({ message: 'Reply cannot be empty.' });
    }
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    const comment = event.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found.' });
    const newReply = {
      eventId,
      userId,
      comment: reply,
      authorName: userName,
      authorAvatar: userAvatar,
      createdAt: new Date(),
      likes: [],
      replies: []
    };
    comment.replies = comment.replies || [];
    comment.replies.push(newReply);
    await event.save();
    res.status(201).json(newReply);
  } catch (err) {
    res.status(500).json({ message: 'Failed to add reply.', error: err.message });
  }
};

// Like/unlike a comment
exports.likeComment = async (req, res) => {
  try {
    const eventId = req.params.id;
    const commentId = req.params.commentId;
    const userId = req.user._id;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: 'Event not found.' });
    const comment = event.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found.' });
    comment.likes = comment.likes || [];
    const index = comment.likes.findIndex(id => String(id) === String(userId));
    let liked;
    if (index === -1) {
      comment.likes.push(userId);
      liked = true;
    } else {
      comment.likes.splice(index, 1);
      liked = false;
    }
    await event.save();
    res.json({ liked, likesCount: comment.likes.length });
  } catch (err) {
    res.status(500).json({ message: 'Failed to like/unlike comment.', error: err.message });
  }
};

// Get events created by a user
exports.getUserEvents = async (req, res) => {
  try {
    const userId = req.params.userId;
    // Events created by user
    const createdEvents = await Event.find({ host: userId }).populate('host', 'name avatar bio');
    // Map to add 'id' property
    const eventsWithId = createdEvents.map(event => {
      const obj = event.toObject();
      obj.id = obj._id;
      return obj;
    });
    res.json(eventsWithId);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
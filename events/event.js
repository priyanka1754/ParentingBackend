const mongoose = require('mongoose');

const RSVP_SCHEMA = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParentUser', required: true },
  status: { type: String, enum: ['Going', 'Interested', 'Not Going'], required: true },
  respondedAt: { type: Date, default: Date.now }
}, { _id: false });

const COMMENT_SCHEMA = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParentUser', required: true },
  comment: { type: String, required: true },
  authorName: { type: String },
  authorAvatar: { type: String },
  createdAt: { type: Date, default: Date.now },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ParentUser' }],
  replies: [this]
});

const FEEDBACK_SCHEMA = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'ParentUser', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  review: { type: String },
  authorName: { type: String },
  authorAvatar: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  coverImageUrl: { type: String },
  eventType: { type: String, enum: ['Online', 'Offline'], required: true },
  location: { type: String },
  meetingLink: { type: String },
  category: { type: String, required: true },
  maxAttendees: { type: Number },
  visibility: { type: String, enum: ['Public', 'Private', 'Group-only'], default: 'Public' },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'ParentUser', required: true },
  attendees: [RSVP_SCHEMA],
  comments: [COMMENT_SCHEMA],
  feedback: [FEEDBACK_SCHEMA],
  isCancelled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  duration: { type: Number, required: true } // Duration in hours
});

EventSchema.index({ date: 1, time: 1 });

module.exports = mongoose.model('Event', EventSchema);
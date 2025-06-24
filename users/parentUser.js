const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Utility to generate a custom user ID
const generateUserId = () => {
  const random = Math.floor(100000 + Math.random() * 900000); // 6-digit random number
  return `USR${random}`;
};

const childSchema = new mongoose.Schema({
  name: { type: String, required: true },
  age: { type: Number, min: 0, required: true },
  interests: { type: [String], default: [] }
}, { _id: false });

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    unique: true,
    required: true
  },
  name: { type: String, required: true },
  email: {
    type: String,
    required: true,
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: { type: String, required: true },
  avatar: { type: String, default: '', maxlength: 2048 },
  bio: { type: String, default: '' },
  role: {
    type: String,
    enum: ['parent', 'coach', 'admin'],
    default: 'parent'
  },
  children: [childSchema],
  location: { type: String, default: '' },
  joinedGroups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }],
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Generate unique userId before save
userSchema.pre('validate', async function (next) {
  if (this.userId) return next();

  let unique = false;
  while (!unique) {
    const newId = generateUserId();
    const existing = await mongoose.models.User.findOne({ userId: newId });
    if (!existing) {
      this.userId = newId;
      unique = true;
    }
  }

  next();
});

// Password comparison
userSchema.methods.comparePassword = function (inputPassword) {
  return bcrypt.compare(inputPassword, this.password);
};

// module.exports = mongoose.model('User', userSchema);
module.exports = mongoose.models.ParentUser || mongoose.model('ParentUser', userSchema);


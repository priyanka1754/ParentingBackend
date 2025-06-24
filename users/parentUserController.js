const User = require('./parentUser');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Multer storage for avatar uploads
const avatarStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    const uploadPath = 'uploads/avatar/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function(req, file, cb) {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const avatarFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP images are allowed.'), false);
  }
};

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: avatarFileFilter
}).single('avatar');

// Controller for avatar upload
exports.handleAvatarUpload = (req, res) => {
  uploadAvatar(req, res, function(err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const fileUrl = `/uploads/avatar/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  });
};
// Use environment variables in production
const JWT_SECRET = 'your_jwt_secret';

exports.registerUser = async (req, res) => {
  console.log("Registering user with data:", req.body);
  try {
    const {
      name,
      email,
      password,
      avatar,
      bio,
      role = 'parent',
      location,
      children = []
    } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ message: 'Email already in use' });

    // Create new user object
    const user = new User({
      name,
      email,
      password,
      avatar,
      bio,
      role,
      location,
      children
    });

    await user.save();

    // Fetch the saved user to get all fields (including userId)
    const savedUser = await User.findOne({ email });

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: savedUser._id,
        userId: savedUser.userId,
        name: savedUser.name,
        email: savedUser.email,
        role: savedUser.role,
        avatar: savedUser.avatar,
        bio: savedUser.bio,
        location: savedUser.location,
        children: savedUser.children,
        joinedGroups: savedUser.joinedGroups,
        followers: savedUser.followers,
        following: savedUser.following,
        createdAt: savedUser.createdAt,
        updatedAt: savedUser.updatedAt
      }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user)
      return res.status(400).json({ message: 'Invalid email or password' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch)
      return res.status(400).json({ message: 'Invalid email or password' });

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        location: user.location,
        children: user.children,
        joinedGroups: user.joinedGroups,
        followers: user.followers,
        following: user.following,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ message: 'Server error during login' });
  }
};

// Get user profile
exports.getUserProfile = async (req, res) => {
  try {
    // Try to get userId from session, fallback to req.user
    const userId = req.session?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({
      user: {
        id: user._id,
        userId: user.userId,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        bio: user.bio,
        location: user.location,
        children: user.children,
        joinedGroups: user.joinedGroups,
        followers: user.followers,
        following: user.following,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ message: 'Server error fetching profile' });
  }
};

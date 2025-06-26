const Community = require('./community');
const UserRole = require('../users/userRole');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage config for community media
const communityMediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/community_media/';
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

const communityMediaFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP images are allowed.'), false);
  }
};

const uploadCommunityMediaMulter = multer({
  storage: communityMediaStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: communityMediaFileFilter
}).single('media');

// Controller for community media upload
exports.uploadCommunityMedia = (req, res) => {
  uploadCommunityMediaMulter(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const fileUrl = `/uploads/community_media/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  });
};

// Create Community (Admin only)
exports.createCommunity = async (req, res) => {
  try {
    // Check if user has admin permissions
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'create_community');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const allowedFields = [
      'title', 'shortDescription', 'longDescription', 'image', 'category', 'tagline', 'icon'
    ];
    const communityData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) communityData[field] = req.body[field];
    });
    
    communityData.createdBy = req.user._id;
    const community = new Community(communityData);
    await community.save();
    
    // Fetch the community again with creator populated
    const populatedCommunity = await Community.findById(community._id)
      .populate('createdBy', 'name avatar bio');
    
    const communityObj = populatedCommunity.toObject();
    communityObj.id = communityObj._id;
    res.status(201).json(communityObj);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get All Communities (with filters, pagination)
exports.getCommunities = async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    let filter = { isActive: true };
    
    if (category) filter.category = category;
    if (search) {
      filter.$text = { $search: search };
    }

    const communities = await Community.find(filter)
      .populate('createdBy', 'name avatar bio')
      .populate('moderators.userId', 'name avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const communitiesWithId = communities.map(community => {
      const obj = community.toObject();
      obj.id = obj._id;
      return obj;
    });

    res.json(communitiesWithId);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Community by ID
exports.getCommunityById = async (req, res) => {
  try {
    const community = await Community.findById(req.params.id)
      .populate('createdBy', 'name avatar bio')
      .populate('moderators.userId', 'name avatar')
      .populate('experts.userId', 'name avatar')
      .populate('moderators.assignedBy', 'name')
      .populate('experts.approvedBy', 'name');
    
    if (!community) return res.status(404).json({ error: 'Community not found' });
    
    const communityObj = community.toObject();
    communityObj.id = communityObj._id;
    res.json(communityObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Community (Admin only)
exports.updateCommunity = async (req, res) => {
  try {
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'edit_community');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    const allowedFields = [
      'title', 'shortDescription', 'longDescription', 'image', 'category', 'tagline', 'icon'
    ];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) community[field] = req.body[field];
    });

    await community.save();
    
    const populatedCommunity = await Community.findById(community._id)
      .populate('createdBy', 'name avatar bio')
      .populate('moderators.userId', 'name avatar');
    
    res.json(populatedCommunity);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete Community (Admin only)
exports.deleteCommunity = async (req, res) => {
  try {
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'delete_community');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    community.isActive = false;
    await community.save();
    
    res.json({ success: true, message: 'Community deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Assign Moderator (Admin only)
exports.assignModerator = async (req, res) => {
  try {
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'assign_moderators');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const { userId } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    await community.addModerator(userId, req.user._id);
    
    const updatedCommunity = await Community.findById(community._id)
      .populate('moderators.userId', 'name avatar');
    
    res.json({ success: true, moderators: updatedCommunity.moderators });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Remove Moderator (Admin only)
exports.removeModerator = async (req, res) => {
  try {
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'assign_moderators');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const { userId } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    await community.removeModerator(userId);
    
    const updatedCommunity = await Community.findById(community._id)
      .populate('moderators.userId', 'name avatar');
    
    res.json({ success: true, moderators: updatedCommunity.moderators });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Request Expert Status
exports.requestExpertStatus = async (req, res) => {
  try {
    const { expertiseAreas, credentials } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Check if user already has a pending or approved request
    const existingRequest = community.experts.find(expert => 
      expert.userId.toString() === req.user._id.toString()
    );

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({ error: 'Expert request already pending' });
      }
      if (existingRequest.status === 'approved') {
        return res.status(400).json({ error: 'User is already an approved expert' });
      }
    }

    // Create or update expert role
    let userRole = await UserRole.findOne({ userId: req.user._id, role: 'expert' });
    if (!userRole) {
      userRole = new UserRole({
        userId: req.user._id,
        role: 'expert',
        expertiseAreas,
        credentials
      });
    } else {
      userRole.expertiseAreas = expertiseAreas;
      userRole.credentials = credentials;
      userRole.verificationStatus = 'pending';
    }
    await userRole.save();

    // Add to community experts list
    if (existingRequest) {
      existingRequest.status = 'pending';
      existingRequest.requestedAt = new Date();
    } else {
      community.experts.push({
        userId: req.user._id,
        status: 'pending'
      });
    }
    await community.save();

    res.json({ success: true, message: 'Expert request submitted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Approve Expert Request (Admin only)
exports.approveExpertRequest = async (req, res) => {
  try {
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'approve_experts');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const { userId } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    await community.approveExpert(userId, req.user._id);

    // Update user role verification status
    const userRole = await UserRole.findOne({ userId, role: 'expert' });
    if (userRole) {
      await userRole.verify(req.user._id);
    }

    const updatedCommunity = await Community.findById(community._id)
      .populate('experts.userId', 'name avatar');
    
    res.json({ success: true, experts: updatedCommunity.experts });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Reject Expert Request (Admin only)
exports.rejectExpertRequest = async (req, res) => {
  try {
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'approve_experts');
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const { userId } = req.body;
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    await community.rejectExpert(userId);

    // Update user role verification status
    const userRole = await UserRole.findOne({ userId, role: 'expert' });
    if (userRole) {
      await userRole.reject();
    }

    const updatedCommunity = await Community.findById(community._id)
      .populate('experts.userId', 'name avatar');
    
    res.json({ success: true, experts: updatedCommunity.experts });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get Community Statistics
exports.getCommunityStats = async (req, res) => {
  try {
    const community = await Community.findById(req.params.id);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Get group count and member count from related collections
    const Group = require('../groups/group');
    const GroupMembership = require('../groups/groupMembership');

    const groupCount = await Group.countDocuments({ 
      communityId: req.params.id, 
      isActive: true 
    });

    const groups = await Group.find({ 
      communityId: req.params.id, 
      isActive: true 
    }).select('_id');

    const groupIds = groups.map(g => g._id);
    const memberCount = await GroupMembership.countDocuments({
      groupId: { $in: groupIds },
      status: 'active'
    });

    // Update community stats
    community.groupCount = groupCount;
    community.memberCount = memberCount;
    await community.save();

    res.json({
      groupCount,
      memberCount,
      moderatorCount: community.moderators.length,
      expertCount: community.experts.filter(e => e.status === 'approved').length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


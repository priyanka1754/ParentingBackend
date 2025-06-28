const Group = require('./group');
const GroupMembership = require('./groupMembership');
const Community = require('../communities/community');
const UserRole = require('../users/userRole');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Storage config for group media
const groupMediaStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/group_media/';
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

const groupMediaFileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, WEBP images are allowed.'), false);
  }
};

const uploadGroupMediaMulter = multer({
  storage: groupMediaStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: groupMediaFileFilter
}).single('media');

// Controller for group media upload
exports.uploadGroupMedia = (req, res) => {
  uploadGroupMediaMulter(req, res, function (err) {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }
    const fileUrl = `/uploads/group_media/${req.file.filename}`;
    res.json({ success: true, url: fileUrl });
  });
};

// Create Group (Any logged-in user)
exports.createGroup = async (req, res) => {
  try {
    const allowedFields = [
      'title', 'intro', 'image', 'category', 'type', 'communityId'
    ];
    const groupData = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) groupData[field] = req.body[field];
    });
    
    // Verify community exists
    const community = await Community.findById(groupData.communityId);
    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }
    
    groupData.createdBy = req.user._id;
    const group = new Group(groupData);
    await group.save();
    
    // Create membership for the creator
    const membership = new GroupMembership({
      groupId: group._id,
      userId: req.user._id,
      status: 'active',
      role: 'admin',
      approvedAt: new Date(),
      approvedBy: req.user._id
    });
    await membership.save();
    
    // Fetch the group again with creator populated
    const populatedGroup = await Group.findById(group._id)
      .populate('communityId', 'title category')
      .populate('createdBy', 'name avatar bio');
    
    const groupObj = populatedGroup.toObject();
    groupObj.id = groupObj._id;
    res.status(201).json(groupObj);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get Groups by Community (with filters, pagination)
exports.getGroupsByCommunity = async (req, res) => {
  try {
    const { page = 1, limit = 10, type, category, search } = req.query;
    const { communityId } = req.params;
    
    let filter = { 
      communityId, 
      isActive: true,
      status: 'active'
    };
    
    // For secret groups, only show if user is a member
    if (req.user) {
      const userMemberships = await GroupMembership.find({
        userId: req.user._id,
        status: 'active'
      }).select('groupId');
      const userGroupIds = userMemberships.map(m => m.groupId);
      
      filter.$or = [
        { type: { $in: ['Public', 'Private'] } },
        { _id: { $in: userGroupIds } }
      ];
    } else {
      filter.type = 'Public';
    }
    
    if (type && type !== 'all') filter.type = type;
    if (category) filter.category = category;
    if (search) {
      filter.$text = { $search: search };
    }

    const groups = await Group.find(filter)
      .populate('communityId', 'title category')
      .populate('createdBy', 'name avatar')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Add member count to each group
    const groupsWithStats = await Promise.all(groups.map(async (group) => {
      const memberCount = await GroupMembership.countDocuments({
        groupId: group._id,
        status: 'active'
      });
      
      const groupObj = group.toObject();
      groupObj.id = groupObj._id;
      groupObj.memberCount = memberCount;
      
      // Check if current user is a member
      if (req.user) {
        const membership = await GroupMembership.findOne({
          groupId: group._id,
          userId: req.user._id,
          status: { $in: ['active', 'pending'] }
        });
        groupObj.userMembership = membership ? {
          status: membership.status,
          role: membership.role
        } : null;
      }
      
      return groupObj;
    }));

    res.json(groupsWithStats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Group by ID
exports.getGroupById = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id)
      .populate('communityId', 'title category')
      .populate('createdBy', 'name avatar bio')
      .populate('admins.userId', 'name avatar')
      .populate('moderators.userId', 'name avatar');
    
    if (!group) return res.status(404).json({ error: 'Group not found' });
    
    // Check if user has access to this group
    if (group.type === 'Secret' && req.user) {
      const membership = await GroupMembership.findOne({
        groupId: group._id,
        userId: req.user._id,
        status: 'active'
      });
      if (!membership) {
        return res.status(403).json({ error: 'Access denied to secret group' });
      }
    } else if (group.type === 'Secret') {
      return res.status(403).json({ error: 'Access denied to secret group' });
    }
    
    // Get member count
    const memberCount = await GroupMembership.countDocuments({
      groupId: group._id,
      status: 'active'
    });
    
    const groupObj = group.toObject();
    groupObj.id = groupObj._id;
    groupObj.memberCount = memberCount;
    
    // Check current user's membership status
    if (req.user) {
      const membership = await GroupMembership.findOne({
        groupId: group._id,
        userId: req.user._id,
        status: { $in: ['active', 'pending'] }
      });
      groupObj.userMembership = membership ? {
        status: membership.status,
        role: membership.role,
        joinedAt: membership.joinedAt
      } : null;
    }
    
    res.json(groupObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Group (Group creator or Platform admin only)
exports.updateGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is the group creator
    const isCreator = group.createdBy.toString() === req.user._id.toString();
    
    // Check if user is platform admin
    const userRole = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      isActive: true
    });
    const isAdmin = !!userRole;

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Access denied. Only group creator or platform admin can edit this group.' });
    }

    const allowedFields = [
      'title', 'intro', 'image', 'type', 'status', 'rules'
    ];
    
    // Category should not be editable as it inherits from community
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) group[field] = req.body[field];
    });

    await group.save();
    
    const populatedGroup = await Group.findById(group._id)
      .populate('communityId', 'title category')
      .populate('createdBy', 'name avatar bio');
    
    res.json(populatedGroup);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Join Group
exports.joinGroup = async (req, res) => {
  try {
    const { requestMessage } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is already a member (active or pending)
    let existingMembership = await GroupMembership.findOne({
      groupId: group._id,
      userId: req.user._id,
    });

    if (existingMembership) {
      if (['active', 'pending'].includes(existingMembership.status)) {
        return res.status(400).json({ 
          error: existingMembership.status === 'active' ? 'Already a member' : 'Join request already pending'
        });
      } else if (existingMembership.status === 'left') {
        // Reactivate membership
        existingMembership.status = group.type === 'Public' ? 'active' : 'pending';
        existingMembership.requestMessage = requestMessage;
        existingMembership.joinedAt = new Date();
        existingMembership.leftAt = undefined;
        if (group.type === 'Public') {
          existingMembership.approvedAt = new Date();
          existingMembership.approvedBy = req.user._id;
        } else {
          existingMembership.approvedAt = undefined;
          existingMembership.approvedBy = undefined;
        }
        await existingMembership.save();
        if (existingMembership.status === 'active') {
          group.memberCount += 1;
          await group.save();
        }
        return res.json({ 
          success: true, 
          status: existingMembership.status,
          message: existingMembership.status === 'active' ? 'Successfully re-joined group' : 'Join request submitted'
        });
      }
    }

    let membershipData = {
      groupId: group._id,
      userId: req.user._id,
      requestMessage
    };

    // Auto-approve for public groups
    if (group.type === 'Public') {
      membershipData.status = 'active';
      membershipData.approvedAt = new Date();
      membershipData.approvedBy = req.user._id; // Self-approved
    } else {
      membershipData.status = 'pending';
    }

    const membership = new GroupMembership(membershipData);
    await membership.save();

    // Update group member count if approved
    if (membershipData.status === 'active') {
      group.memberCount += 1;
      await group.save();
    }

    res.json({ 
      success: true, 
      status: membershipData.status,
      message: membershipData.status === 'active' ? 'Successfully joined group' : 'Join request submitted'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Leave Group
exports.leaveGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const membership = await GroupMembership.findOne({
      groupId: group._id,
      userId: req.user._id,
      status: { $in: ['active', 'pending'] }
    });

    if (!membership) {
      return res.status(400).json({ error: 'Not a member of this group' });
    }

    // Don't allow group creator to leave
    if (group.createdBy.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: 'Group creator cannot leave the group' });
    }

    await membership.leave();

    // Update group member count
    if (membership.status === 'active') {
      group.memberCount = Math.max(0, group.memberCount - 1);
      await group.save();
    }

    res.json({ success: true, message: 'Successfully left the group' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get Group Members
exports.getGroupMembers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role } = req.query;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user has access to view members
    if (group.type === 'Secret' && req.user) {
      const membership = await GroupMembership.findOne({
        groupId: group._id,
        userId: req.user._id,
        status: 'active'
      });
      if (!membership) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    let filter = {
      groupId: group._id,
      status: 'active'
    };

    if (role) filter.role = role;

    const members = await GroupMembership.find(filter)
      .populate('userId', 'name avatar bio')
      .sort({ joinedAt: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Pending Join Requests (Admin/Moderator only)
exports.getPendingRequests = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is admin or moderator
    const membership = await GroupMembership.findOne({
      groupId: group._id,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Admin or moderator privileges required.' });
    }

    const pendingRequests = await GroupMembership.getPendingRequests(group._id);
    res.json(pendingRequests);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Approve Join Request (Admin/Moderator only)
exports.approveJoinRequest = async (req, res) => {
  try {
    const { userId } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is admin or moderator
    const adminMembership = await GroupMembership.findOne({
      groupId: group._id,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!adminMembership) {
      return res.status(403).json({ error: 'Access denied. Admin or moderator privileges required.' });
    }

    const membership = await GroupMembership.findOne({
      groupId: group._id,
      userId,
      status: 'pending'
    });

    if (!membership) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    await membership.approve(req.user._id);

    // Update group member count
    group.memberCount += 1;
    await group.save();

    res.json({ success: true, message: 'Join request approved' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Reject Join Request (Admin/Moderator only)
exports.rejectJoinRequest = async (req, res) => {
  try {
    const { userId } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is admin or moderator
    const adminMembership = await GroupMembership.findOne({
      groupId: group._id,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!adminMembership) {
      return res.status(403).json({ error: 'Access denied. Admin or moderator privileges required.' });
    }

    const membership = await GroupMembership.findOne({
      groupId: group._id,
      userId,
      status: 'pending'
    });

    if (!membership) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    await GroupMembership.findByIdAndDelete(membership._id);

    res.json({ success: true, message: 'Join request rejected' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Add Group Rule (Admin only)
exports.addGroupRule = async (req, res) => {
  try {
    const { title, description } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is admin
    const membership = await GroupMembership.findOne({
      groupId: group._id,
      userId: req.user._id,
      status: 'active',
      role: 'admin'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await group.addRule(title, description);
    res.json({ success: true, rules: group.rules });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Remove Group Rule (Admin only)
exports.removeGroupRule = async (req, res) => {
  try {
    const { ruleId } = req.params;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is admin
    const membership = await GroupMembership.findOne({
      groupId: group._id,
      userId: req.user._id,
      status: 'active',
      role: 'admin'
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    await group.removeRule(ruleId);
    res.json({ success: true, rules: group.rules });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};


// Delete Group (Group creator or Platform admin only)
exports.deleteGroup = async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is the group creator
    const isCreator = group.createdBy.toString() === req.user._id.toString();
    
    // Check if user is platform admin
    const userRole = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      isActive: true
    });
    const isAdmin = !!userRole;

    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Access denied. Only group creator or platform admin can delete this group.' });
    }

    // Soft delete the group
    group.status = 'deleted';
    group.deletedAt = new Date();
    group.deletedBy = req.user._id;
    await group.save();

    // Update community group count
    const Community = require('../communities/community');
    const community = await Community.findById(group.communityId);
    if (community) {
      community.groupCount = Math.max(0, community.groupCount - 1);
      await community.save();
    }

    res.json({ success: true, message: 'Group deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get Group Members (visible to all, detailed info for members)
exports.getGroupMembers = async (req, res) => {
  try {
    const { page = 1, limit = 20, role } = req.query;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if current user is a member for detailed info
    let isMember = false;
    let isAdmin = false;
    
    if (req.user) {
      const membership = await GroupMembership.findOne({
        groupId: group._id,
        userId: req.user._id,
        status: 'active'
      });
      isMember = !!membership;

      // Check if user is platform admin
      const userRole = await UserRole.findOne({
        userId: req.user._id,
        role: 'admin',
        isActive: true
      });
      isAdmin = !!userRole;
    }

    let filter = {
      groupId: group._id,
      status: 'active'
    };

    if (role) filter.role = role;

    const members = await GroupMembership.find(filter)
      .populate('userId', isMember || isAdmin ? 'name avatar bio' : 'name avatar')
      .sort({ role: 1, joinedAt: 1 }) // Admins first, then by join date
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const totalMembers = await GroupMembership.countDocuments(filter);

    const membersWithRoles = members.map(member => {
      const memberObj = member.toObject();
      
      // Add role labels
      if (member.userId._id.toString() === group.createdBy.toString()) {
        memberObj.roleLabel = 'Group Admin';
      } else if (member.role === 'admin') {
        memberObj.roleLabel = 'Admin';
      } else if (member.role === 'moderator') {
        memberObj.roleLabel = 'Moderator';
      } else {
        memberObj.roleLabel = 'Member';
      }

      return memberObj;
    });

    res.json({
      members: membersWithRoles,
      totalPages: Math.ceil(totalMembers / limit),
      currentPage: parseInt(page),
      totalMembers,
      hasNextPage: page < Math.ceil(totalMembers / limit),
      hasPrevPage: page > 1
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Group (Group creator or Platform admin only)
exports.updateGroup = async (req, res) => {
  try {
    const { title, intro, type, category, rules } = req.body;
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ error: 'Group not found' });

    // Check if user is the group creator
    const isCreator = group.createdBy.toString() === req.user._id.toString();
    
    // Check if user is platform admin
    const userRole = await UserRole.findOne({
      userId: req.user._id,
      role: 'admin',
      communityId: null,
      isActive: true
    });
    const isPlatformAdmin = !!userRole;

    if (!isCreator && !isPlatformAdmin) {
      return res.status(403).json({ 
        error: 'Access denied. Only group creator or platform admin can edit this group.' 
      });
    }

    // Update allowed fields
    if (title !== undefined) group.title = title;
    if (intro !== undefined) group.intro = intro;
    if (type !== undefined && ['Public', 'Private', 'Secret'].includes(type)) {
      group.type = type;
    }
    if (category !== undefined) group.category = category;
    if (rules !== undefined && Array.isArray(rules)) {
      group.rules = rules;
    }

    group.updatedAt = new Date();
    await group.save();

    // Populate for response
    await group.populate('communityId', 'title category');
    await group.populate('createdBy', 'name avatar');

    res.json({
      success: true,
      message: 'Group updated successfully',
      group
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};



const GroupPost = require('../groups/groupPost');
const GroupMembership = require('../groups/groupMembership');
const Group = require('../groups/group');
const Community = require('../communities/community');
const UserRole = require('../users/userRole');
const User = require('../users/parentUser');

// Get all reported content (Admin/Moderator only)
exports.getReportedContent = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = 'pending', type = 'all' } = req.query;

    let filter = {};
    if (status !== 'all') {
      filter['reports.status'] = status;
    }

    // Get reported posts
    const reportedPosts = await GroupPost.find({
      'reports.0': { $exists: true },
      ...filter
    })
      .populate('authorId', 'name email avatar')
      .populate('groupId', 'title type')
      .populate('reports.reportedBy', 'name email')
      .populate('reports.reviewedBy', 'name email')
      .sort({ 'reports.createdAt': -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    // Transform data to flatten reports
    const flattenedReports = [];
    reportedPosts.forEach(post => {
      post.reports.forEach(report => {
        if (status === 'all' || report.status === status) {
          flattenedReports.push({
            id: report._id,
            type: 'post',
            contentId: post._id,
            content: post.content,
            author: post.authorId,
            group: post.groupId,
            report: report,
            createdAt: report.createdAt || post.createdAt
          });
        }
      });
    });

    // Sort by report date
    flattenedReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      reports: flattenedReports.slice(0, limit),
      total: flattenedReports.length,
      page: Number(page),
      totalPages: Math.ceil(flattenedReports.length / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Review reported content (Admin/Moderator only)
exports.reviewReport = async (req, res) => {
  try {
    const { reportId, action, reason } = req.body; // action: 'dismiss', 'resolve', 'escalate'
    const { contentType, contentId } = req.params;

    let content;
    if (contentType === 'post') {
      content = await GroupPost.findById(contentId);
    }

    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const report = content.reports.id(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Update report status
    report.status = action === 'dismiss' ? 'dismissed' : 'reviewed';
    report.reviewedBy = req.user._id;
    report.reviewedAt = new Date();

    // Take action based on review
    if (action === 'resolve') {
      // Mark content for deletion or hide it
      if (reason === 'delete') {
        await content.softDelete(req.user._id);
      }
      report.status = 'resolved';
    }

    await content.save();

    res.json({ success: true, message: 'Report reviewed successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Ban user from group (Admin/Moderator only)
exports.banUserFromGroup = async (req, res) => {
  try {
    const { groupId, userId, reason, duration } = req.body; // duration in days, 0 for permanent

    // Check if user is group admin/moderator or has global moderation rights
    const hasGlobalPermission = await UserRole.userHasPermission(req.user._id, 'ban_users');
    const groupMembership = await GroupMembership.findOne({
      groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!hasGlobalPermission && !groupMembership) {
      return res.status(403).json({ error: 'Access denied. Moderation privileges required.' });
    }

    // Find user's membership
    const userMembership = await GroupMembership.findOne({
      groupId,
      userId,
      status: 'active'
    });

    if (!userMembership) {
      return res.status(404).json({ error: 'User is not a member of this group' });
    }

    // Don't allow banning group creator
    const group = await Group.findById(groupId);
    if (group.createdBy.toString() === userId) {
      return res.status(400).json({ error: 'Cannot ban group creator' });
    }

    // Ban the user
    await userMembership.ban(req.user._id, reason);

    // Update group member count
    group.memberCount = Math.max(0, group.memberCount - 1);
    await group.save();

    res.json({ success: true, message: 'User banned successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Unban user from group (Admin/Moderator only)
exports.unbanUserFromGroup = async (req, res) => {
  try {
    const { groupId, userId } = req.body;

    // Check permissions
    const hasGlobalPermission = await UserRole.userHasPermission(req.user._id, 'ban_users');
    const groupMembership = await GroupMembership.findOne({
      groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!hasGlobalPermission && !groupMembership) {
      return res.status(403).json({ error: 'Access denied. Moderation privileges required.' });
    }

    // Find banned user's membership
    const userMembership = await GroupMembership.findOne({
      groupId,
      userId,
      status: 'banned'
    });

    if (!userMembership) {
      return res.status(404).json({ error: 'User is not banned from this group' });
    }

    // Unban the user (restore to active status)
    userMembership.status = 'active';
    userMembership.bannedAt = null;
    userMembership.bannedBy = null;
    userMembership.banReason = null;
    await userMembership.save();

    // Update group member count
    const group = await Group.findById(groupId);
    group.memberCount += 1;
    await group.save();

    res.json({ success: true, message: 'User unbanned successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete post (Admin/Moderator only)
exports.deletePost = async (req, res) => {
  try {
    const { postId, reason } = req.body;

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check permissions
    const hasGlobalPermission = await UserRole.userHasPermission(req.user._id, 'moderate_posts');
    const groupMembership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!hasGlobalPermission && !groupMembership) {
      return res.status(403).json({ error: 'Access denied. Moderation privileges required.' });
    }

    // Soft delete the post
    await post.softDelete(req.user._id);

    // Add to edit history
    post.editHistory.push({
      editedBy: req.user._id,
      previousContent: post.content,
      reason: reason || 'Deleted by moderator'
    });
    await post.save();

    // Update group post count
    const group = await Group.findById(post.groupId);
    group.postCount = Math.max(0, group.postCount - 1);
    await group.save();

    res.json({ success: true, message: 'Post deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Edit post content (Admin/Moderator only)
exports.editPost = async (req, res) => {
  try {
    const { postId, content, reason } = req.body;

    const post = await GroupPost.findById(postId);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check permissions
    const hasGlobalPermission = await UserRole.userHasPermission(req.user._id, 'moderate_posts');
    const groupMembership = await GroupMembership.findOne({
      groupId: post.groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!hasGlobalPermission && !groupMembership) {
      return res.status(403).json({ error: 'Access denied. Moderation privileges required.' });
    }

    // Store edit history
    post.editHistory.push({
      editedBy: req.user._id,
      previousContent: post.content,
      reason: reason || 'Edited by moderator'
    });

    // Update content
    post.content = content;
    await post.save();

    const updatedPost = await GroupPost.findById(post._id)
      .populate('authorId', 'name avatar bio')
      .populate('editHistory.editedBy', 'name');

    res.json({ success: true, post: updatedPost });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get banned users for a group (Admin/Moderator only)
exports.getBannedUsers = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Check permissions
    const hasGlobalPermission = await UserRole.userHasPermission(req.user._id, 'view_reports');
    const groupMembership = await GroupMembership.findOne({
      groupId,
      userId: req.user._id,
      status: 'active',
      role: { $in: ['admin', 'moderator'] }
    });

    if (!hasGlobalPermission && !groupMembership) {
      return res.status(403).json({ error: 'Access denied. Moderation privileges required.' });
    }

    const bannedUsers = await GroupMembership.find({
      groupId,
      status: 'banned'
    })
      .populate('userId', 'name email avatar')
      .populate('bannedBy', 'name email')
      .sort({ bannedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json(bannedUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get moderation logs (Admin only)
exports.getModerationLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, type = 'all' } = req.query;

    // Get various moderation actions
    const logs = [];

    // Get post deletions
    if (type === 'all' || type === 'post_deletion') {
      const deletedPosts = await GroupPost.find({
        isDeleted: true,
        deletedBy: { $exists: true }
      })
        .populate('deletedBy', 'name email')
        .populate('authorId', 'name email')
        .populate('groupId', 'title')
        .sort({ deletedAt: -1 })
        .limit(Number(limit));

      deletedPosts.forEach(post => {
        logs.push({
          type: 'post_deletion',
          action: 'Post deleted',
          moderator: post.deletedBy,
          target: post.authorId,
          content: post.content?.substring(0, 100) + '...',
          group: post.groupId,
          timestamp: post.deletedAt
        });
      });
    }

    // Get user bans
    if (type === 'all' || type === 'user_ban') {
      const bannedUsers = await GroupMembership.find({
        status: 'banned',
        bannedBy: { $exists: true }
      })
        .populate('bannedBy', 'name email')
        .populate('userId', 'name email')
        .populate('groupId', 'title')
        .sort({ bannedAt: -1 })
        .limit(Number(limit));

      bannedUsers.forEach(membership => {
        logs.push({
          type: 'user_ban',
          action: 'User banned',
          moderator: membership.bannedBy,
          target: membership.userId,
          reason: membership.banReason,
          group: membership.groupId,
          timestamp: membership.bannedAt
        });
      });
    }

    // Sort all logs by timestamp
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Paginate
    const startIndex = (page - 1) * limit;
    const paginatedLogs = logs.slice(startIndex, startIndex + Number(limit));

    res.json({
      logs: paginatedLogs,
      total: logs.length,
      page: Number(page),
      totalPages: Math.ceil(logs.length / limit)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get moderation statistics (Admin only)
exports.getModerationStats = async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const stats = await Promise.all([
      // Total reports
      GroupPost.countDocuments({
        'reports.0': { $exists: true },
        'reports.createdAt': { $gte: startDate }
      }),
      
      // Pending reports
      GroupPost.countDocuments({
        'reports.status': 'pending',
        'reports.createdAt': { $gte: startDate }
      }),
      
      // Resolved reports
      GroupPost.countDocuments({
        'reports.status': 'resolved',
        'reports.reviewedAt': { $gte: startDate }
      }),
      
      // Deleted posts
      GroupPost.countDocuments({
        isDeleted: true,
        deletedAt: { $gte: startDate }
      }),
      
      // Banned users
      GroupMembership.countDocuments({
        status: 'banned',
        bannedAt: { $gte: startDate }
      })
    ]);

    res.json({
      timeframe,
      totalReports: stats[0],
      pendingReports: stats[1],
      resolvedReports: stats[2],
      deletedPosts: stats[3],
      bannedUsers: stats[4]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


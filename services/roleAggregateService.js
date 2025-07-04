const UserRole = require('../users/userRole');
const GroupMembership = require('../groups/groupMembership');
const Group = require('../groups/group');

/**
 * Role Aggregation Service
 * Handles the logic for determining all applicable user roles based on:
 * - Platform admin roles (from userroles)
 * - Group admin roles (from groupmemberships)
 * - Community moderator roles (from userroles)
 * - Community expert roles (from userroles)
 */
class RoleAggregationService {
  
  /**
   * Get all applicable roles for a user in a specific group context
   * @param {string} userId - The user's ID
   * @param {string} groupId - The group's ID
   * @returns {Promise<Array>} Array of role objects with type, icon, and priority
   */
  static async getUserRolesInGroup(userId, groupId) {
    try {
      const roles = [];
      
      // Get group information to determine community
      const group = await Group.findById(groupId).populate('communityId');
      if (!group) {
        throw new Error('Group not found');
      }
      
      const communityId = group.communityId._id;
      
      // 1. Check for Platform Admin (highest priority)
      const platformAdminRole = await UserRole.findOne({
        userId: userId,
        role: 'admin',
        communityId: null, // Platform-wide admin
        isActive: true
      });
      
      if (platformAdminRole) {
        roles.push({
          type: 'admin',
          icon: '👑',
          priority: 1,
          source: 'platform',
          verificationStatus: null
        });
        // If user is platform admin, they don't need other role tags
        return roles;
      }
      
      // 2. Check for Group Admin or Group Moderator
      const groupMembership = await GroupMembership.findOne({
        userId: userId,
        groupId: groupId,
        status: 'active'
      });

      if (groupMembership) {
        // Treat both 'groupAdmin' and legacy 'admin' as group admin for display
        if (groupMembership.role === 'groupAdmin' || groupMembership.role === 'admin') {
          roles.push({
            type: 'groupAdmin',
            icon: '⚡',
            priority: 2,
            source: 'group',
            verificationStatus: null
          });
        } else if (groupMembership.role === 'moderator') {
          roles.push({
            type: 'moderator',
            icon: '🛡️',
            priority: 3,
            source: 'group',
            verificationStatus: null
          });
        }
      }

      // 3. Check for Community Moderator
      const moderatorRole = await UserRole.findOne({
        userId: userId,
        role: 'moderator',
        communityId: communityId,
        isActive: true
      });

      if (moderatorRole) {
        roles.push({
          type: 'moderator',
          icon: '🛡️',
          priority: 3,
          source: 'community',
          verificationStatus: null
        });
      }
      
      // 4. Check for Community Expert
      const expertRole = await UserRole.findOne({
        userId: userId,
        role: 'expert',
        communityId: communityId,
        isActive: true
      });
      
      if (expertRole) {
        const icon = expertRole.verificationStatus === 'verified' ? '🎓' : '⏳';
        roles.push({
          type: 'expert',
          icon: icon,
          priority: 4,
          source: 'community',
          verificationStatus: expertRole.verificationStatus
        });
      }
      
      // Sort by priority (lower number = higher priority)
      roles.sort((a, b) => a.priority - b.priority);
      
      return roles;
      
    } catch (error) {
      console.error('Error in getUserRolesInGroup:', error);
      throw error;
    }
  }
  
  /**
   * Get role icon based on role type and verification status
   * @param {string} roleType - The role type
   * @param {string} verificationStatus - The verification status (for experts)
   * @returns {string} The role icon
   */
  static getRoleIcon(roleType, verificationStatus = null) {
    switch (roleType) {
      case 'admin':
        return '👑';
      case 'groupAdmin':
        return '⚡';
      case 'moderator':
        return '🛡️';
      case 'expert':
        return verificationStatus === 'verified' ? '🎓' : '⏳';
      default:
        return '';
    }
  }
  
  /**
   * Check if user can post in a specific group
   * @param {string} userId - The user's ID
   * @param {string} groupId - The group's ID
   * @returns {Promise<boolean>} Whether user can post
   */
  static async canUserPostInGroup(userId, groupId) {
    try {
      // Check if user is platform admin
      const platformAdminRole = await UserRole.findOne({
        userId: userId,
        role: 'admin',
        isActive: true
      });
      if (platformAdminRole) {
        return true; // Platform admins can post anywhere
      }
      
      // Check if user is active member of the group
      const membership = await GroupMembership.findOne({
        userId: userId,
        groupId: groupId,
        status: 'active'
      });
      
      if (membership) {
        return true; // Active group members can post
      }
      
      // Check if user is community moderator or expert
      const group = await Group.findById(groupId).populate('communityId');
      if (!group) {
        return false;
      }
      
      const communityRole = await UserRole.findOne({
        userId: userId,
        role: { $in: ['moderator', 'expert'] },
        communityId: group.communityId._id,
        isActive: true
      });
      
      return !!communityRole; // Community moderators and experts can post in all groups under their community
      
    } catch (error) {
      console.error('Error in canUserPostInGroup:', error);
      return false;
    }
  }
  
  /**
   * Get formatted role display string for UI
   * @param {Array} roles - Array of role objects
   * @returns {string} Formatted role icons string
   */
  static formatRoleDisplay(roles) {
    if (!roles || roles.length === 0) {
      return '';
    }
    
    // Sort by priority and return icons
    const sortedRoles = roles.sort((a, b) => a.priority - b.priority);
    return sortedRoles.map(role => role.icon).join('');
  }
}

module.exports = RoleAggregationService;


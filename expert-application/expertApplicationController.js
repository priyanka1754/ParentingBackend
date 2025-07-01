const ExpertApplication = require('./expertApplication');
const UserRole = require('../users/userRole');
const Community = require('../communities/community');

// Submit Expert Application
exports.submitApplication = async (req, res) => {
  try {
    const { communityId } = req.params;
    const {
      name,
      location,
      occupation,
      degree,
      phone,
      socialMediaLinks,
      experienceYears,
      bio
    } = req.body;

    // Check if community exists
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: 'Community not found' });
    }

    // Check if user already has an application for this community
    const existingApplication = await ExpertApplication.getUserApplication(req.user._id, communityId);
    if (existingApplication) {
      return res.status(400).json({ 
        error: 'You already have an application for this community',
        status: existingApplication.status
      });
    }

    // Check if user is already an expert in this community
    const existingExpertRole = await UserRole.getUserCommunityRole(req.user._id, communityId);
    if (existingExpertRole && existingExpertRole.role === 'expert') {
      return res.status(400).json({ error: 'You are already an expert in this community' });
    }

    // Create new application
    const application = new ExpertApplication({
      userId: req.user._id,
      communityId,
      name,
      location,
      occupation,
      degree,
      phone,
      socialMediaLinks: socialMediaLinks || [],
      experienceYears,
      bio
    });

    await application.save();

    // Populate user data for response
    await application.populate('userId', 'name email avatar');
    await application.populate('communityId', 'title category');

    res.status(201).json({
      success: true,
      message: 'Expert application submitted successfully',
      application
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get User's Application Status
exports.getUserApplication = async (req, res) => {
  try {
    const { communityId } = req.params;

    const application = await ExpertApplication.getUserApplication(req.user._id, communityId);
    
    if (!application) {
      return res.status(404).json({ error: 'No application found' });
    }

    await application.populate('reviewedBy', 'name email');
    await application.populate('communityId', 'title category');

    res.json(application);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get Pending Applications (Admin only)
exports.getPendingApplications = async (req, res) => {
  try {
    const { communityId } = req.params;

    // Check if user has permission to view applications
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'approve_experts', communityId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const applications = await ExpertApplication.getPendingApplications(communityId);
    
    res.json({
      success: true,
      applications,
      count: applications.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get All Applications (Admin only)
exports.getAllApplications = async (req, res) => {
  try {
    const { communityId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Check if user has permission to view applications
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'approve_experts', communityId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const query = { communityId, isActive: true };
    if (status) query.status = status;

    const applications = await ExpertApplication.find(query)
      .populate('userId', 'name email avatar')
      .populate('reviewedBy', 'name email')
      .sort({ submittedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalApplications = await ExpertApplication.countDocuments(query);

    res.json({
      success: true,
      applications,
      totalPages: Math.ceil(totalApplications / limit),
      currentPage: parseInt(page),
      totalApplications
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Approve Application (Admin only)
exports.approveApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { expertiseAreas } = req.body;

    const application = await ExpertApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check if user has permission to approve applications
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'approve_experts', application.communityId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application has already been reviewed' });
    }

    // Approve the application
    await application.approve(req.user._id);

    // Create expert role for the user in this community
    const expertRole = new UserRole({
      userId: application.userId,
      role: 'expert',
      communityId: application.communityId,
      assignedBy: req.user._id,
      expertiseAreas: expertiseAreas || [],
      credentials: `${application.degree} - ${application.occupation}`,
      verificationStatus: 'verified',
      verifiedAt: new Date(),
      verifiedBy: req.user._id
    });

    await expertRole.save();

    // Update community expert count
    const community = await Community.findById(application.communityId);
    if (community) {
      // Add to experts array if not already present
      const existingExpert = community.experts.find(expert => 
        expert.userId.toString() === application.userId.toString()
      );
      
      if (!existingExpert) {
        community.experts.push({
          userId: application.userId,
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: req.user._id
        });
        await community.save();
      }
    }

    // Populate application for response
    await application.populate('userId', 'name email avatar');
    await application.populate('reviewedBy', 'name email');

    res.json({
      success: true,
      message: 'Application approved successfully',
      application,
      expertRole
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Reject Application (Admin only)
exports.rejectApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { rejectionReason } = req.body;

    const application = await ExpertApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check if user has permission to reject applications
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'approve_experts', application.communityId);
    if (!hasPermission) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Application has already been reviewed' });
    }

    // Reject the application
    await application.reject(req.user._id, rejectionReason);

    // Populate application for response
    await application.populate('userId', 'name email avatar');
    await application.populate('reviewedBy', 'name email');

    res.json({
      success: true,
      message: 'Application rejected',
      application
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get Application by ID (Admin or applicant only)
exports.getApplicationById = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await ExpertApplication.findById(applicationId)
      .populate('userId', 'name email avatar')
      .populate('communityId', 'title category')
      .populate('reviewedBy', 'name email');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check if user is the applicant or has admin permissions
    const isApplicant = application.userId._id.toString() === req.user._id.toString();
    const hasPermission = await UserRole.userHasPermission(req.user._id, 'approve_experts', application.communityId);

    if (!isApplicant && !hasPermission) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(application);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update Application (Only if pending and by applicant)
exports.updateApplication = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const updateData = req.body;

    const application = await ExpertApplication.findById(applicationId);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Check if user is the applicant
    if (application.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied. You can only update your own application.' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot update application that has been reviewed' });
    }

    // Update allowed fields
    const allowedFields = [
      'name', 'location', 'occupation', 'degree', 'phone', 
      'socialMediaLinks', 'experienceYears', 'bio'
    ];
    
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        application[field] = updateData[field];
      }
    });

    await application.save();

    // Populate for response
    await application.populate('userId', 'name email avatar');
    await application.populate('communityId', 'title category');

    res.json({
      success: true,
      message: 'Application updated successfully',
      application
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};




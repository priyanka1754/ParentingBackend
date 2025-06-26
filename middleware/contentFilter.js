// Keyword filtering middleware for content moderation
const profanityWords = [
  // Basic profanity
  'damn', 'hell', 'crap', 'stupid', 'idiot', 'moron', 'dumb',
  
  // Spam indicators
  'buy now', 'click here', 'free money', 'get rich quick', 'make money fast',
  'limited time', 'act now', 'urgent', 'congratulations you won',
  
  // Inappropriate content
  'hate', 'kill', 'die', 'murder', 'violence', 'hurt',
  
  // Medical advice warnings (flagged for review)
  'cure', 'treatment', 'medicine', 'drug', 'prescription', 'diagnosis',
  'medical advice', 'doctor says', 'take this pill',
  
  // Child safety concerns
  'personal information', 'home address', 'phone number', 'school name',
  'real name', 'where do you live', 'meet in person',
  
  // Scam indicators
  'send money', 'wire transfer', 'bitcoin', 'cryptocurrency', 'investment opportunity',
  'guaranteed return', 'risk free', 'no questions asked'
];

const suspiciousPatterns = [
  // URLs and links
  /https?:\/\/[^\s]+/gi,
  
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  
  // Phone numbers
  /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/gi,
  
  // Excessive caps (more than 50% uppercase)
  /^[A-Z\s!?.,]{10,}$/,
  
  // Repeated characters
  /(.)\1{4,}/gi,
  
  // Multiple exclamation marks
  /!{3,}/gi
];

const medicalTerms = [
  'adhd', 'autism', 'depression', 'anxiety', 'medication', 'therapy',
  'psychiatrist', 'psychologist', 'mental health', 'behavioral issues',
  'developmental delay', 'special needs', 'iep', '504 plan'
];

const filterContent = (content) => {
  if (!content || typeof content !== 'string') {
    return {
      filteredContent: content,
      flags: [],
      severity: 'none'
    };
  }

  const flags = [];
  let filteredContent = content;
  let severity = 'none';

  // Check for profanity
  const lowerContent = content.toLowerCase();
  const foundProfanity = profanityWords.filter(word => 
    lowerContent.includes(word.toLowerCase())
  );

  if (foundProfanity.length > 0) {
    flags.push({
      type: 'profanity',
      words: foundProfanity,
      action: 'filter'
    });
    
    // Replace profanity with asterisks
    foundProfanity.forEach(word => {
      const regex = new RegExp(word, 'gi');
      filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
    });
    
    severity = 'medium';
  }

  // Check for suspicious patterns
  suspiciousPatterns.forEach((pattern, index) => {
    const matches = content.match(pattern);
    if (matches) {
      flags.push({
        type: 'suspicious_pattern',
        pattern: pattern.toString(),
        matches: matches,
        action: 'review'
      });
      
      if (severity === 'none') severity = 'low';
    }
  });

  // Check for medical terms (flag for disclaimer)
  const foundMedicalTerms = medicalTerms.filter(term => 
    lowerContent.includes(term.toLowerCase())
  );

  if (foundMedicalTerms.length > 0) {
    flags.push({
      type: 'medical_content',
      terms: foundMedicalTerms,
      action: 'disclaimer'
    });
    
    if (severity === 'none') severity = 'low';
  }

  // Check for excessive caps
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.5 && content.length > 20) {
    flags.push({
      type: 'excessive_caps',
      ratio: capsRatio,
      action: 'review'
    });
    
    if (severity === 'none') severity = 'low';
  }

  // Check for spam indicators
  const spamWords = ['buy now', 'click here', 'free money', 'limited time'];
  const foundSpamWords = spamWords.filter(word => 
    lowerContent.includes(word.toLowerCase())
  );

  if (foundSpamWords.length > 0) {
    flags.push({
      type: 'spam',
      words: foundSpamWords,
      action: 'block'
    });
    
    severity = 'high';
  }

  return {
    filteredContent,
    flags,
    severity,
    requiresReview: flags.some(flag => flag.action === 'review' || flag.action === 'block'),
    requiresDisclaimer: flags.some(flag => flag.action === 'disclaimer')
  };
};

// Middleware for filtering post content
const filterPostContent = (req, res, next) => {
  try {
    if (req.body.content) {
      const result = filterContent(req.body.content);
      
      // Block content with high severity
      if (result.severity === 'high') {
        return res.status(400).json({
          success: false,
          message: 'Content violates community guidelines and cannot be posted.',
          flags: result.flags
        });
      }
      
      // Update content with filtered version
      req.body.content = result.filteredContent;
      
      // Attach filtering results to request
      req.contentFilter = result;
    }
    
    next();
  } catch (error) {
    console.error('Content filtering error:', error);
    next(); // Continue without filtering if error occurs
  }
};

// Middleware for filtering comment content
const filterCommentContent = (req, res, next) => {
  try {
    if (req.body.comment || req.body.content) {
      const content = req.body.comment || req.body.content;
      const result = filterContent(content);
      
      // Block content with high severity
      if (result.severity === 'high') {
        return res.status(400).json({
          success: false,
          message: 'Comment violates community guidelines and cannot be posted.',
          flags: result.flags
        });
      }
      
      // Update content with filtered version
      if (req.body.comment) {
        req.body.comment = result.filteredContent;
      } else {
        req.body.content = result.filteredContent;
      }
      
      // Attach filtering results to request
      req.contentFilter = result;
    }
    
    next();
  } catch (error) {
    console.error('Comment filtering error:', error);
    next(); // Continue without filtering if error occurs
  }
};

// Function to check if content needs medical disclaimer
const needsMedicalDisclaimer = (content) => {
  const result = filterContent(content);
  return result.requiresDisclaimer;
};

// Function to get content safety score (0-100, higher is safer)
const getContentSafetyScore = (content) => {
  const result = filterContent(content);
  
  let score = 100;
  
  result.flags.forEach(flag => {
    switch (flag.type) {
      case 'profanity':
        score -= flag.words.length * 10;
        break;
      case 'spam':
        score -= 30;
        break;
      case 'suspicious_pattern':
        score -= 5;
        break;
      case 'excessive_caps':
        score -= 10;
        break;
      case 'medical_content':
        score -= 2; // Minor deduction for medical content
        break;
    }
  });
  
  return Math.max(0, score);
};

module.exports = {
  filterContent,
  filterPostContent,
  filterCommentContent,
  needsMedicalDisclaimer,
  getContentSafetyScore,
  profanityWords,
  medicalTerms
};


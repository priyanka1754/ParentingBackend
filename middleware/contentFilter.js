// Keyword filtering middleware for content moderation
const profanityWords = [
  // Only actual profanity - removed common words that were being over-filtered
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'whore', 'slut',
  
  // Spam indicators - kept as phrases to avoid false positives
  'buy now', 'click here', 'free money', 'get rich quick', 'make money fast',
  'limited time offer', 'act now', 'congratulations you won',
  
  // Serious inappropriate content
  'kill yourself', 'go die', 'murder', 'violence against',
  
  // Scam indicators - kept as phrases
  'send money now', 'wire transfer urgent', 'bitcoin investment', 
  'guaranteed return', 'risk free investment', 'no questions asked'
];

const suspiciousPatterns = [
  // URLs and links
  /https?:\/\/[^\s]+/gi,
  
  // Email addresses
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
  
  // Phone numbers
  /(\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/gi,
  
  // Excessive caps (more than 70% uppercase and longer than 20 chars)
  /^[A-Z\s!?.,]{20,}$/,
  
  // Repeated characters (5 or more)
  /(.)\1{5,}/gi,
  
  // Multiple exclamation marks (4 or more)
  /!{4,}/gi
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

  // Check for profanity - use word boundaries to avoid partial matches
  const lowerContent = content.toLowerCase();
  const foundProfanity = profanityWords.filter(word => {
    // For phrases, check if they exist as-is
    if (word.includes(' ')) {
      return lowerContent.includes(word.toLowerCase());
    }
    // For single words, use word boundaries to avoid partial matches
    const wordRegex = new RegExp(`\\b${word.toLowerCase()}\\b`, 'i');
    return wordRegex.test(lowerContent);
  });

  if (foundProfanity.length > 0) {
    flags.push({
      type: 'profanity',
      words: foundProfanity,
      action: 'filter'
    });
    
    // Replace profanity with asterisks
    foundProfanity.forEach(word => {
      if (word.includes(' ')) {
        // For phrases, replace directly
        const regex = new RegExp(word, 'gi');
        filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
      } else {
        // For single words, use word boundaries
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
      }
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

  // Check for medical terms (flag for disclaimer) - use word boundaries
  const foundMedicalTerms = medicalTerms.filter(term => {
    const termRegex = new RegExp(`\\b${term.toLowerCase()}\\b`, 'i');
    return termRegex.test(lowerContent);
  });

  if (foundMedicalTerms.length > 0) {
    flags.push({
      type: 'medical_content',
      terms: foundMedicalTerms,
      action: 'disclaimer'
    });
    
    if (severity === 'none') severity = 'low';
  }

  // Check for excessive caps - increased threshold
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.7 && content.length > 20) {
    flags.push({
      type: 'excessive_caps',
      ratio: capsRatio,
      action: 'review'
    });
    
    if (severity === 'none') severity = 'low';
  }

  // Check for spam indicators - only check for complete phrases
  const spamPhrases = ['buy now', 'click here', 'free money', 'limited time offer'];
  const foundSpamPhrases = spamPhrases.filter(phrase => 
    lowerContent.includes(phrase.toLowerCase())
  );

  if (foundSpamPhrases.length > 0) {
    flags.push({
      type: 'spam',
      words: foundSpamPhrases,
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


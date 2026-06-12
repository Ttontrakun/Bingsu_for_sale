/**
 * Input Validation & Sanitization Utilities
 * สำหรับป้องกัน XSS และ validate input
 */

/**
 * Sanitize string input - ลบ HTML tags และ special characters
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // ลบ < และ >
    .replace(/javascript:/gi, '') // ลบ javascript: protocol
    .replace(/on\w+=/gi, '') // ลบ event handlers เช่น onclick=
    .substring(0, 1000); // จำกัดความยาว
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid
 */
export const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {object} - Validation result with details
 */
export const validatePassword = (password) => {
  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      hasLength: false,
      hasUpperCase: false,
      hasLowerCase: false,
      hasNumber: false,
    };
  }

  return {
    isValid: password.length > 6 && 
             /[A-Z]/.test(password) && 
             /[a-z]/.test(password) && 
             /[0-9]/.test(password),
    hasLength: password.length > 6,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
  };
};

/**
 * Sanitize object - sanitize all string values in object
 * @param {object} obj - Object to sanitize
 * @returns {object} - Sanitized object
 */
export const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return {};
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Validate and sanitize input
 * @param {string} input - Input to validate
 * @param {string} type - Type of input (email, text, etc.)
 * @returns {object} - { isValid, sanitized }
 */
export const validateAndSanitize = (input, type = 'text') => {
  const sanitized = sanitizeString(input);
  
  let isValid = true;
  
  switch (type) {
    case 'email':
      isValid = validateEmail(sanitized);
      break;
    case 'password':
      isValid = validatePassword(sanitized).isValid;
      break;
    case 'text':
      isValid = sanitized.length > 0;
      break;
    default:
      isValid = true;
  }
  
  return { isValid, sanitized };
};

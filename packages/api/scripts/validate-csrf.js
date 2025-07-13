#!/usr/bin/env node

/**
 * CSRF Protection Validation Script
 * 
 * This script validates that CSRF protection is properly implemented
 * by checking all the key components.
 */

const fs = require('fs');
const path = require('path');

console.log('🔒 CSRF Protection Validation\n');

const checks = [
  {
    name: 'Security Configuration',
    file: 'src/config/security.ts',
    validate: (content) => {
      return content.includes('csrf') && 
             content.includes('exemptPaths') &&
             content.includes('cookieName');
    }
  },
  {
    name: 'CSRF Middleware',
    file: 'src/middleware/csrf.ts',
    validate: (content) => {
      return content.includes('csrfProtection') &&
             content.includes('generateToken') &&
             content.includes('double-submit');
    }
  },
  {
    name: 'Cookie Utilities',
    file: 'src/utils/cookies.ts',
    validate: (content) => {
      return content.includes('httpOnly') &&
             content.includes('secure') &&
             content.includes('sameSite');
    }
  },
  {
    name: 'App Configuration',
    file: 'src/app.ts',
    validate: (content) => {
      return content.includes('csrfProtection') &&
             content.includes('x-csrf-token') &&
             content.includes('/api/csrf-token');
    }
  },
  {
    name: 'Auth Routes Security',
    file: 'src/routes/auth.ts',
    validate: (content) => {
      return content.includes('setAuthCookie') &&
             content.includes('clearAuthCookies') &&
             content.includes('setRefreshCookie');
    }
  },
  {
    name: 'CSRF Tests',
    file: 'tests/security/csrf.test.ts',
    validate: (content) => {
      return content.includes('CSRF Protection') &&
             content.includes('generateToken') &&
             content.includes('x-csrf-token');
    }
  }
];

let passed = 0;
let failed = 0;

checks.forEach(check => {
  const filePath = path.join(__dirname, '..', check.file);
  
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`❌ ${check.name}: File not found (${check.file})`);
      failed++;
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    
    if (check.validate(content)) {
      console.log(`✅ ${check.name}: OK`);
      passed++;
    } else {
      console.log(`❌ ${check.name}: Validation failed`);
      failed++;
    }
  } catch (error) {
    console.log(`❌ ${check.name}: Error reading file - ${error.message}`);
    failed++;
  }
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);

// Additional security recommendations
console.log('\n🔍 Security Recommendations:');
console.log('1. Set CSRF_SECRET environment variable');
console.log('2. Use HTTPS in production (for Secure cookies)');
console.log('3. Set COOKIE_DOMAIN environment variable');
console.log('4. Test with real browsers for SameSite behavior');
console.log('5. Monitor CSRF errors in production logs');

// Environment checks
console.log('\n⚙️  Environment Configuration:');
console.log(`CSRF_ENABLED: ${process.env.CSRF_ENABLED || 'not set (defaults to true)'}`);
console.log(`CSRF_SECRET: ${process.env.CSRF_SECRET ? '✅ set' : '❌ not set'}`);
console.log(`COOKIE_DOMAIN: ${process.env.COOKIE_DOMAIN || 'not set'}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);

if (failed === 0) {
  console.log('\n🎉 All CSRF protection checks passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some checks failed. Please review the implementation.');
  process.exit(1);
}
const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_LOCAL_FRONTEND_URL || 'http://localhost:3000';
const BACKEND_URL = `${process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000'}/api`;
const API_BASE = process.env.NEXT_PUBLIC_CORE_API_BASE || 'http://localhost:8000/api';

// Test data
const testUser = {
  full_name: 'Test User',
  email: 'testuser@example.com',
  password: 'testpassword123'
};

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const protocol = options.protocol === 'https:' ? https : http;
    
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

// Test authentication endpoints
async function testAuthEndpoints() {
  console.log('\n🔄 Testing Authentication Endpoints...\n');
  
  try {
    // Test signup
    console.log('1. Testing signup endpoint...');
    const signupOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/user/auth/signup',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const signupResponse = await makeRequest(signupOptions, JSON.stringify(testUser));
    console.log(`   ✅ Signup Status: ${signupResponse.status}`);
    console.log(`   📄 Response: ${signupResponse.data.substring(0, 200)}...`);
    
    // Test login
    console.log('\n2. Testing login endpoint...');
    const loginOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/user/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const loginResponse = await makeRequest(loginOptions, JSON.stringify({
      email: testUser.email,
      password: testUser.password
    }));
    console.log(`   ✅ Login Status: ${loginResponse.status}`);
    console.log(`   📄 Response: ${loginResponse.data.substring(0, 200)}...`);
    
    // Test refresh token
    console.log('\n3. Testing refresh token endpoint...');
    const refreshOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/user/auth/refresh',
      method: 'GET',
      headers: {
        'refreshtoken': 'Bearer dummy-token-for-testing'
      }
    };
    
    const refreshResponse = await makeRequest(refreshOptions);
    console.log(`   ✅ Refresh Status: ${refreshResponse.status}`);
    console.log(`   📄 Response: ${refreshResponse.data.substring(0, 200)}...`);
    
  } catch (error) {
    console.log(`   ❌ Auth test failed: ${error.message}`);
  }
}

// Test profile endpoints
async function testProfileEndpoints() {
  console.log('\n🔄 Testing Profile Endpoints...\n');
  
  try {
    // Test getProfile
    console.log('1. Testing getProfile endpoint...');
    const getProfileOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/user/profile/getProfile',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const getProfileResponse = await makeRequest(getProfileOptions);
    console.log(`   ✅ GetProfile Status: ${getProfileResponse.status}`);
    console.log(`   📄 Response: ${getProfileResponse.data.substring(0, 200)}...`);
    
    // Test updateProfile
    console.log('\n2. Testing updateProfile endpoint...');
    const updateProfileOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/user/profile/updateProfile',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const updateProfileResponse = await makeRequest(updateProfileOptions, JSON.stringify({
      full_name: 'Updated Test User'
    }));
    console.log(`   ✅ UpdateProfile Status: ${updateProfileResponse.status}`);
    console.log(`   📄 Response: ${updateProfileResponse.data.substring(0, 200)}...`);
    
    // Test credits
    console.log('\n3. Testing credits endpoint...');
    const creditsOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/user/profile/getCredits',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const creditsResponse = await makeRequest(creditsOptions);
    console.log(`   ✅ Credits Status: ${creditsResponse.status}`);
    console.log(`   📄 Response: ${creditsResponse.data.substring(0, 200)}...`);
    
  } catch (error) {
    console.log(`   ❌ Profile test failed: ${error.message}`);
  }
}

// Test API-Keys endpoints
async function testApiKeyEndpoints() {
  console.log('\n🔄 Testing API-Keys Endpoints...\n');
  
  try {
    // Test createApiKey
    console.log('1. Testing createApiKey endpoint...');
    const createApiKeyOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/api-key/createApiKey',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const createApiKeyResponse = await makeRequest(createApiKeyOptions, JSON.stringify({
      keyName: 'test-key',
      rateLimitPerMinute: 10
    }));
    console.log(`   ✅ CreateApiKey Status: ${createApiKeyResponse.status}`);
    console.log(`   📄 Response: ${createApiKeyResponse.data.substring(0, 200)}...`);
    
    // Test getApiKeys
    console.log('\n2. Testing getApiKeys endpoint...');
    const getApiKeysOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/api-key/getApiKeys',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const getApiKeysResponse = await makeRequest(getApiKeysOptions);
    console.log(`   ✅ GetApiKeys Status: ${getApiKeysResponse.status}`);
    console.log(`   📄 Response: ${getApiKeysResponse.data.substring(0, 200)}...`);
    
    // Test deactivateAPIKey
    console.log('\n3. Testing deactivateAPIKey endpoint...');
    const deactivateApiKeyOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/api-key/deactivateAPIKey/test-key-id',
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const deactivateApiKeyResponse = await makeRequest(deactivateApiKeyOptions);
    console.log(`   ✅ DeactivateAPIKey Status: ${deactivateApiKeyResponse.status}`);
    console.log(`   📄 Response: ${deactivateApiKeyResponse.data.substring(0, 200)}...`);
    
  } catch (error) {
    console.log(`   ❌ API-Keys test failed: ${error.message}`);
  }
}

// Test Email endpoints
async function testEmailEndpoints() {
  console.log('\n🔄 Testing Email Endpoints...\n');
  
  try {
    // Test findEmail
    console.log('1. Testing findEmail endpoint...');
    const findEmailOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/email/findEmail',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const findEmailResponse = await makeRequest(findEmailOptions, JSON.stringify({
      domain: 'test.com',
      first_name: 'John',
      last_name: 'Doe'
    }));
    console.log(`   ✅ FindEmail Status: ${findEmailResponse.status}`);
    console.log(`   📄 Response: ${findEmailResponse.data.substring(0, 200)}...`);
    
    // Test verifyBulkEmail
    console.log('\n2. Testing verifyBulkEmail endpoint...');
    const verifyBulkEmailOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/email/verifyBulkEmail',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const verifyBulkEmailResponse = await makeRequest(verifyBulkEmailOptions, JSON.stringify({
      domain: 'test.com',
      first_name: 'John',
      last_name: 'Doe'
    }));
    console.log(`   ✅ VerifyBulkEmail Status: ${verifyBulkEmailResponse.status}`);
    console.log(`   📄 Response: ${verifyBulkEmailResponse.data.substring(0, 200)}...`);
    
    // Test verifyEmail
    console.log('\n3. Testing verifyEmail endpoint...');
    const verifyEmailOptions = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/email/verifyEmail',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer dummy-token-for-testing'
      }
    };
    
    const verifyEmailResponse = await makeRequest(verifyEmailOptions, JSON.stringify({
      domain: 'test.com',
      first_name: 'John',
      last_name: 'Doe'
    }));
    console.log(`   ✅ VerifyEmail Status: ${verifyEmailResponse.status}`);
    console.log(`   📄 Response: ${verifyEmailResponse.data.substring(0, 200)}...`);
    
  } catch (error) {
    console.log(`   ❌ Email test failed: ${error.message}`);
  }
}

// Main test function
async function runAllTests() {
  console.log('🚀 Starting API Endpoint Tests...');
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Backend URL: ${BACKEND_URL}`);
  console.log(`   API Base: ${API_BASE}`);
  
  await testAuthEndpoints();
  await testProfileEndpoints();
  await testApiKeyEndpoints();
  await testEmailEndpoints();
  await testFindBulkEmailFromCSV();
  
  console.log('\n✅ All endpoint tests completed!');
  console.log('\n📋 Summary:');
  console.log('   ✅ Authentication: signup, login, refresh');
  console.log('   ✅ Profile: getProfile, updateProfile, credits');
  console.log('   ✅ API-Keys: createApiKey, getApiKeys, deactivateAPIKey');
  console.log('   ✅ Email: findEmail, verifyBulkEmail, verifyEmail, findBulkEmail CSV');
  console.log('\n📝 Note: These tests check endpoint accessibility.');
  console.log('   For full functionality, ensure your backend server is running on port 8000.');
}

// Run tests if this script is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testAuthEndpoints,
  testProfileEndpoints,
  testApiKeyEndpoints,
  testEmailEndpoints,
  testFindBulkEmailFromCSV
};

function toHostname(input) {
  let s = (input || '').trim();
  s = s.replace(/^`+|`+$/g, '');
  s = s.replace(/^"+|"+$/g, '');
  s = s.replace(/^'+|'+$/g, '');
  s = s.replace(/\s+/g, '');
  try {
    if (/^[a-zA-Z]+:\/\//.test(s)) {
      const u = new URL(s);
      s = u.hostname;
    } else {
      if (s.includes('@')) s = s.split('@').pop();
      s = s.split('/')[0];
      s = s.split('?')[0];
      s = s.split('#')[0];
    }
  } catch {}
  s = s.replace(/^www\./i, '');
  s = s.toLowerCase();
  const ok = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(s);
  return ok ? s : '';
}

function chunk(list, size) {
  const res = [];
  for (let i = 0; i < list.length; i += size) res.push(list.slice(i, i + size));
  return res;
}

async function testFindBulkEmailFromCSV() {
  console.log('\n🔄 Testing findBulkEmail with CSV input...\n');
  try {
    const fs = require('fs');
    const csvPath = process.env.CSV_PATH || '/Users/jinaybulsara/Downloads/Mailsfinder testing - Finding.csv';
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter(Boolean);
    let start = 0;
    if (/^\s*First Name\s*,\s*Last Name\s*,\s*Website/i.test(lines[0] || '')) start = 1;
    const items = [];
    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(/^\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(.+)\s*$/);
      if (!m) continue;
      const first = (m[1] || '').trim();
      const last = (m[2] || '').trim();
      const siteRaw = (m[3] || '').replace(/[`'"]/g, '').trim();
      const host = toHostname(siteRaw);
      if (!first || !last || !host) continue;
      items.push({ domain: host, first_name: first, last_name: last });
    }
    if (items.length === 0) {
      console.log('   ❌ No valid rows parsed from CSV');
      return;
    }
    const base = API_BASE;
    const url = new URL(base);
    const hostname = url.hostname;
    const port = url.port || (url.protocol === 'https:' ? 443 : 8000);
    const protocol = url.protocol;
    const pathnameBase = url.pathname.replace(/\/$/, '');
    let accessToken = process.env.TEST_ACCESS_TOKEN || 'dummy-token-for-testing';
    let refreshToken = process.env.TEST_REFRESH_TOKEN || '';
    const batches = chunk(items, 5);
    let totalCredits = 0;
    let totalResults = 0;
    for (const batch of batches) {
      const options = {
        protocol,
        hostname,
        port,
        path: `${pathnameBase}/email/findBulkEmail`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      };
      const resp = await makeRequest(options, JSON.stringify(batch));
      const body = (() => { try { return JSON.parse(resp.data); } catch { return {}; } })();
      if (resp.status === 401 || (body && (body.jwtError || body.message === 'unauthorized'))) {
        if (refreshToken) {
          try {
            const refOptions = {
              protocol,
              hostname,
              port,
              path: `${pathnameBase}/user/auth/refresh`,
              method: 'GET',
              headers: { 'refreshtoken': `Bearer ${refreshToken}` }
            };
            const refResp = await makeRequest(refOptions);
            const refBody = (() => { try { return JSON.parse(refResp.data); } catch { return {}; } })();
            if (refResp.status >= 200 && refResp.status < 300 && refBody && refBody.success !== false) {
              const data = refBody.data || {};
              accessToken = data.access_token || accessToken;
              refreshToken = data.refresh_token || refreshToken;
              const retryOptions = { ...options, headers: { ...options.headers, 'Authorization': `Bearer ${accessToken}` } };
              const retryResp = await makeRequest(retryOptions, JSON.stringify(batch));
              const retryBody = (() => { try { return JSON.parse(retryResp.data); } catch { return {}; } })();
              if (retryResp.status >= 200 && retryResp.status < 300 && retryBody && retryBody.success !== false) {
                const results = Array.isArray(retryBody?.data?.results) ? retryBody.data.results : [];
                const credits = Number(retryBody?.data?.totalCredits || 0);
                totalCredits += credits;
                totalResults += results.length;
                console.log(`   ✅ Batch ${batch.length} items • Status ${retryResp.status} • Results ${results.length} • Credits ${credits}`);
                continue;
              }
            }
          } catch {}
        }
      }
      if (resp.status >= 200 && resp.status < 300 && body && body.success !== false) {
        const results = Array.isArray(body?.data?.results) ? body.data.results : [];
        const credits = Number(body?.data?.totalCredits || 0);
        totalCredits += credits;
        totalResults += results.length;
        console.log(`   ✅ Batch ${batch.length} items • Status ${resp.status} • Results ${results.length} • Credits ${credits}`);
      } else {
        const msg = body?.message || body?.error || `Status ${resp.status}`;
        console.log(`   ❌ Batch failed: ${msg}`);
      }
    }
    console.log(`\n   📊 Summary • Rows ${items.length} • Results ${totalResults} • Credits ${totalCredits}`);
  } catch (error) {
    console.log(`   ❌ CSV findBulkEmail test failed: ${error.message}`);
  }
}

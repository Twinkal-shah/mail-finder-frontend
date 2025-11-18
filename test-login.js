// Test script to check what your backend returns during login
async function testLogin() {
  const backendUrl = process.env.NEXT_PUBLIC_LOCAL_URL || 'http://localhost:8000';
  
  const testCredentials = {
    email: 'test@example.com',
    password: 'password123'
  };
  
  try {
    console.log('Testing login to backend:', `${backendUrl}/api/user/auth/login`);
    console.log('Sending credentials:', testCredentials);
    
    const response = await fetch(`${backendUrl}/api/user/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testCredentials)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    try {
      const responseJson = JSON.parse(responseText);
      console.log('Parsed JSON:', JSON.stringify(responseJson, null, 2));
      
      // Check what fields are available
      console.log('\nAvailable fields:');
      console.log('- Has accessToken?', !!responseJson.accessToken);
      console.log('- Has user?', !!responseJson.user);
      console.log('- Has token?', !!responseJson.token);
      console.log('- Has data?', !!responseJson.data);
      
      if (responseJson.user) {
        console.log('\nUser object fields:', Object.keys(responseJson.user));
      }
      
    } catch (e) {
      console.log('Response is not JSON');
    }
    
  } catch (error) {
    console.error('Error testing login:', error);
  }
}
console.log("test login")
testLogin();
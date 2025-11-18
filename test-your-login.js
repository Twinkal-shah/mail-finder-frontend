// Test your actual login to see what the backend returns
async function testYourLogin() {
  console.log('=== LOGIN RESPONSE TEST ===\n');
  
  // Ask user for their actual credentials
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('Enter your email (or press Enter to skip): ', (email) => {
      if (!email.trim()) {
        console.log('Skipping login test - no credentials provided');
        rl.close();
        resolve();
        return;
      }
      
      rl.question('Enter your password: ', async (password) => {
        rl.close();
        
        try {
          console.log('\n--- Testing your login ---');
          console.log('Backend URL: http://localhost:8000/api/user/auth/login');
          
          const response = await fetch('http://localhost:8000/api/user/auth/login', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email: email.trim(), password: password.trim() })
          });
          
          console.log('Response Status:', response.status);
          
          const responseText = await response.text();
          console.log('Raw Response:', responseText);
          
          if (response.ok) {
            try {
              const data = JSON.parse(responseText);
              console.log('\n--- SUCCESSFUL LOGIN RESPONSE ---');
              console.log('Full response object:', JSON.stringify(data, null, 2));
              
              console.log('\n--- KEY FIELDS ---');
              console.log('Has accessToken?', !!data.accessToken);
              console.log('Has user?', !!data.user);
              console.log('Has token?', !!data.token);
              console.log('Has data?', !!data.data);
              
              if (data.user) {
                console.log('\n--- USER OBJECT ---');
                console.log('User fields:', Object.keys(data.user));
                console.log('User data:', JSON.stringify(data.user, null, 2));
              }
              
              if (data.accessToken) {
                console.log('\n--- TOKEN INFO ---');
                console.log('Token length:', data.accessToken.length);
                console.log('Token preview:', data.accessToken.substring(0, 50) + '...');
              }
              
            } catch (e) {
              console.log('Failed to parse JSON response');
            }
          } else {
            console.log('\n--- LOGIN FAILED ---');
            console.log('Error response:', responseText);
          }
          
        } catch (error) {
          console.error('Network error:', error.message);
        }
        
        resolve();
      });
    });
  });
}

testYourLogin().then(() => {
  console.log('\n=== TEST COMPLETE ===');
});
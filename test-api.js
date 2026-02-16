const http = require('http');

// First login to get a token
const loginData = JSON.stringify({ email: 'admin@tiktokmanager.com', password: 'Admin123!' });

const loginOpts = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': loginData.length }
};

const loginReq = http.request(loginOpts, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('Login status:', res.statusCode);
    const parsed = JSON.parse(data);
    const token = parsed.data?.accessToken || parsed.data?.access_token || parsed.accessToken;
    console.log('Token:', token ? token.substring(0, 30) + '...' : 'NO TOKEN');
    console.log('Login response:', JSON.stringify(parsed).substring(0, 300));
    
    if (token) {
      // Now test google drive
      const driveOpts = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/v1/google-drive/files?folderId=1i5LQZZCseI58XIGAtl3BSsCzC-0hIJ47',
        headers: { Authorization: `Bearer ${token}` }
      };
      
      http.get(driveOpts, (r) => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          console.log('\nDrive status:', r.statusCode);
          try {
            const result = JSON.parse(d);
            console.log('Response:', JSON.stringify(result, null, 2).substring(0, 2000));
          } catch {
            console.log('Raw:', d.substring(0, 2000));
          }
        });
      });
    }
  });
});

loginReq.write(loginData);
loginReq.end();

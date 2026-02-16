// Test what the regex extracts
const url = 'https://drive.google.com/drive/folders/1i5LQZZCseI58XIGAtl3BSsCzC-0hIJ47?usp=sharing';

const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
const extracted = match ? match[1] : 'NO MATCH';

console.log('Input URL:', url);
console.log('Extracted folder ID:', extracted);
console.log('Folder ID length:', extracted.length);

// Check each character
console.log('\nCharacter analysis of extracted ID:');
for (let i = 0; i < extracted.length; i++) {
  const c = extracted[i];
  console.log(`  [${i}] '${c}' charCode=${c.charCodeAt(0)}`);
}

// Compare with working ID
const working = '1i5LQZZCseI58XIGAtl3BSsCzC-0hIJ47';
console.log('\nWorking ID:', working);
console.log('Extracted ID:', extracted);
console.log('Are they identical?', working === extracted);

// Also test: what does the frontend actually send?
console.log('\nURL that frontend would call:');
console.log(`/google-drive/files?folderId=${extracted}`);

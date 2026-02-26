const { execSync } = require('child_process');
try {
  console.log('Starting npm install...');
  execSync('npm.cmd install', {
    stdio: 'inherit',
    timeout: 120000
  });
  console.log('Finished npm install');
} catch (e) {
  console.error('Failed:', e.message);
}

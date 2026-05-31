require('dotenv').config();
const { Daytona } = require('@daytona/sdk');

const REPO_URL = 'https://github.com/aryanmotgi/Pr-Guardian.git';
const CLONE_PATH = '/tmp/pr-guardian';
const DEMO_REPO_PATH = `${CLONE_PATH}/demo-repo`;

async function main() {
  if (!process.env.DAYTONA_API_KEY || process.env.DAYTONA_API_KEY === 'your_api_key_here') {
    console.error('ERROR: Set DAYTONA_API_KEY in .env before running.');
    process.exit(1);
  }

  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });
  let sandbox;

  try {
    console.log('Creating sandbox...');
    sandbox = await daytona.create();
    console.log(`Sandbox created: ${sandbox.id}`);

    console.log(`Cloning ${REPO_URL}...`);
    const clone = await sandbox.process.executeCommand(`git clone ${REPO_URL} ${CLONE_PATH}`);
    if (clone.exitCode !== 0) {
      console.error('git clone failed:', clone.result);
      process.exit(1);
    }
    console.log('Clone complete.');

    console.log('Running npm install...');
    const install = await sandbox.process.executeCommand(`npm install`, DEMO_REPO_PATH);
    if (install.exitCode !== 0) {
      console.error('npm install failed:', install.result);
      process.exit(1);
    }
    console.log('Install complete.');

    console.log('Running npm test...');
    const test = await sandbox.process.executeCommand(`npm test`, DEMO_REPO_PATH);

    console.log('\n--- TEST OUTPUT ---');
    console.log(test.result);
    console.log('--- END OUTPUT ---');
    console.log(`Exit code: ${test.exitCode}`);

    if (test.exitCode !== 0) {
      console.error('Tests FAILED.');
      process.exit(1);
    }

    console.log('Tests PASSED.');
  } finally {
    if (sandbox) {
      console.log('Deleting sandbox...');
      await sandbox.delete();
      console.log('Sandbox deleted.');
    }
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});

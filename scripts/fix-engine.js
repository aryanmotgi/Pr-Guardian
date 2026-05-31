require('dotenv').config();
const { Daytona } = require('@daytona/sdk');
const Anthropic = require('@anthropic-ai/sdk');

const REPO_URL = 'https://github.com/aryanmotgi/Pr-Guardian.git';
const CLONE_PATH = '/tmp/pr-guardian';
const DEMO_REPO_PATH = `${CLONE_PATH}/demo-repo`;

// The fake violation fed to the fix engine
const VIOLATION = {
  file: 'demo-repo/src/payment.js',
  line: 21,
  rule: 'never log full card numbers',
  bad_code: "  logger.debug('Payment card data', { cardNumber: pan, amount, currency })",
};

async function getFixFromClaude(badCode, rule, previousAttempt = null, testFailureOutput = null) {
  // ASSUMPTION: ANTHROPIC_API_KEY is set in .env
  const client = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });

  let content;
  if (previousAttempt && testFailureOutput) {
    content = `You are a security-focused code fixer. A rule was violated: "${rule}".

The original bad line of code is:
${badCode}

Your previous fix attempt was:
${previousAttempt}

That fix failed tests with this output:
${testFailureOutput}

Return ONLY a corrected single line of code that fixes the rule violation AND passes the tests. No explanation, no markdown, no backticks. Preserve the original indentation.`;
  } else {
    content = `You are a security-focused code fixer. A rule was violated: "${rule}".

The bad line of code is:
${badCode}

Return ONLY the corrected single line of code, with no explanation, no markdown, no backticks. Preserve the original indentation. The fix must mask the card number (show only last 4 digits) rather than log it raw.`;
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{ role: 'user', content }],
  });

  return response.content[0].text.trim();
}

async function runFixEngine(violation) {
  if (!process.env.DAYTONA_API_KEY || process.env.DAYTONA_API_KEY === 'your_api_key_here') {
    throw new Error('DAYTONA_API_KEY not set in .env');
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set in .env');
  }

  const t0 = Date.now();
  const daytona = new Daytona({ apiKey: process.env.DAYTONA_API_KEY });
  let sandbox;

  try {
    console.log('\nCreating sandbox...');
    sandbox = await daytona.create();
    console.log(`Sandbox created: ${sandbox.id}`);

    console.log(`Cloning ${REPO_URL}...`);
    const clone = await sandbox.process.executeCommand(`git clone ${REPO_URL} ${CLONE_PATH}`);
    if (clone.exitCode !== 0) throw new Error(`git clone failed: ${clone.result}`);
    console.log('Clone complete.');

    console.log('Running npm install...');
    const install = await sandbox.process.executeCommand('npm install', DEMO_REPO_PATH);
    if (install.exitCode !== 0) throw new Error(`npm install failed: ${install.result}`);
    console.log('Install complete.');

    // ASSUMPTION: violation.file is relative to CLONE_PATH
    const targetFile = `${CLONE_PATH}/${violation.file}`;

    // Inject the bad code once — stays in file across all retry attempts
    const readResult = await sandbox.process.executeCommand(`cat "${targetFile}"`);
    if (readResult.exitCode !== 0) throw new Error(`Could not read ${targetFile}: ${readResult.result}`);

    const lines = readResult.result.split('\n');
    // ASSUMPTION: violation.line is 1-based
    const insertIdx = Math.min(violation.line - 1, lines.length);
    lines.splice(insertIdx, 0, violation.bad_code);
    const injectedContent = lines.join('\n');

    const writeInject = await sandbox.process.executeCommand(
      `python3 -c "import sys; open('${targetFile}', 'w').write(sys.stdin.read())" << 'PYEOF'\n${injectedContent}\nPYEOF`
    );
    if (writeInject.exitCode !== 0) {
      const b64 = Buffer.from(injectedContent).toString('base64');
      const writeB64 = await sandbox.process.executeCommand(
        `echo '${b64}' | base64 -d > "${targetFile}"`
      );
      if (writeB64.exitCode !== 0) throw new Error(`Could not inject bad code: ${writeB64.result}`);
    }
    console.log(`Injected bad code at line ${violation.line} of ${violation.file}`);

    // Retry loop — up to 3 attempts
    const MAX_ATTEMPTS = 3;
    const attemptLog = [];
    let lastFixedCode = null;
    let lastTestOutput = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`\n=== Attempt ${attempt}/${MAX_ATTEMPTS} ===`);

      // Ask Claude — pass previous failure context on retry
      const fixedCode = await getFixFromClaude(
        violation.bad_code,
        violation.rule,
        attempt > 1 ? lastFixedCode : null,
        attempt > 1 ? lastTestOutput : null
      );
      console.log(`Fix (attempt ${attempt}): ${fixedCode}`);

      // Read current file state, swap current fix line with new fix
      const readCurrent = await sandbox.process.executeCommand(`cat "${targetFile}"`);
      if (readCurrent.exitCode !== 0) throw new Error(`Could not re-read ${targetFile}`);

      const currentLines = readCurrent.result.split('\n');
      // Find the bad line (first attempt) or previous fix line (subsequent attempts)
      const searchLine = attempt === 1 ? violation.bad_code : lastFixedCode;
      const targetLineIdx = currentLines.findIndex((l) => l.trim() === searchLine.trim());
      if (targetLineIdx === -1) throw new Error(`Could not locate target line in file (attempt ${attempt})`);

      currentLines[targetLineIdx] = fixedCode;
      const fixedContent = currentLines.join('\n');

      const b64Fixed = Buffer.from(fixedContent).toString('base64');
      const writeFixed = await sandbox.process.executeCommand(
        `echo '${b64Fixed}' | base64 -d > "${targetFile}"`
      );
      if (writeFixed.exitCode !== 0) throw new Error(`Could not write fixed file: ${writeFixed.result}`);

      // Run tests
      console.log('Running npm test...');
      const test = await sandbox.process.executeCommand('npm test', DEMO_REPO_PATH);

      console.log('\n--- TEST OUTPUT ---');
      console.log(test.result);
      console.log('--- END OUTPUT ---');

      const passMatch = test.result.match(/(\d+) passed/);
      const testsPassed = passMatch ? parseInt(passMatch[1], 10) : null;

      const passed = test.exitCode === 0;
      attemptLog.push({ attempt, fixed_code: fixedCode, passed, test_output: test.result });
      lastFixedCode = fixedCode;
      lastTestOutput = test.result;

      console.log(`[SSE] ${JSON.stringify({ event: 'attempt', attempt, status: passed ? 'passed' : 'failed', fix_applied: fixedCode })}`);

      if (passed) {
        const time_ms = Date.now() - t0;
        const result = {
          success: true,
          attempts: attempt,
          fixed_code: fixedCode,
          diff: { before: violation.bad_code, after: fixedCode },
          tests_passed: testsPassed,
          time_ms,
          attempt_log: attemptLog,
        };
        console.log(`[SSE] ${JSON.stringify({ event: 'done', status: 'passed', attempts: attempt, time_ms })}`);
        return result;
      }

      console.log(`Attempt ${attempt} failed — ${attempt < MAX_ATTEMPTS ? 'retrying with failure context...' : 'max attempts reached.'}`);
    }

    const time_ms = Date.now() - t0;
    const reason = 'Tests still failing after max attempts';
    const result = {
      escalate: true,
      reason,
      attempts: MAX_ATTEMPTS,
      diff: { before: violation.bad_code, after: lastFixedCode },
      time_ms,
      attempt_log: attemptLog,
    };
    console.log(`[SSE] ${JSON.stringify({ event: 'done', status: 'escalated', attempts: MAX_ATTEMPTS, time_ms, reason })}`);
    return result;
  } finally {
    if (sandbox) {
      console.log('\nDeleting sandbox...');
      await sandbox.delete();
      console.log('Sandbox deleted.');
    }
  }
}

// Run
runFixEngine(VIOLATION)
  .then((result) => {
    console.log('\n=== FIX ENGINE RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.success ? 0 : 1);
  })
  .catch((err) => {
    console.error('Fix engine error:', err.message);
    process.exit(1);
  });

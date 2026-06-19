/**
 * HeartShop Setup Verification Script
 *
 * Checks if all required files and configurations are in place
 * Run with: node verify-setup.js
 */

const fs = require('fs');
const path = require('path');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function checkFile(filePath, description) {
  const exists = fs.existsSync(filePath);
  const status = exists ? colorize('✅', 'green') : colorize('❌', 'red');
  console.log(`  ${status} ${description}`);

  if (!exists) {
    console.log(`     ${colorize('Missing:', 'yellow')} ${filePath}`);
  }

  return exists;
}

function checkDirectory(dirPath, description) {
  const exists = fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  const status = exists ? colorize('✅', 'green') : colorize('❌', 'red');
  console.log(`  ${status} ${description}`);

  if (!exists) {
    console.log(`     ${colorize('Missing:', 'yellow')} ${dirPath}`);
  }

  return exists;
}

function checkEnvVariable(filePath, varName) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const hasVar = content.includes(`${varName}=`);
    const hasValue = hasVar && !content.match(new RegExp(`${varName}=\\s*$`, 'm'));

    if (!hasVar) {
      console.log(`     ${colorize('⚠️', 'yellow')} ${varName} not found`);
      return false;
    }

    if (!hasValue) {
      console.log(`     ${colorize('⚠️', 'yellow')} ${varName} is empty`);
      return false;
    }

    return true;
  } catch (e) {
    return false;
  }
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    return `${sizeKB} KB`;
  } catch (e) {
    return 'unknown';
  }
}

console.log(colorize('\n🔍 HeartShop Setup Verification\n', 'cyan'));
console.log(colorize('=' .repeat(60), 'blue'));

// Backend Checks
console.log(colorize('\n📦 Backend Components\n', 'cyan'));

const backendChecks = [
  ['backend/package.json', 'Package.json'],
  ['backend/.env', 'Environment configuration'],
  ['backend/prisma/schema.prisma', 'Database schema'],
  ['backend/src/index.ts', 'Main server file'],
  ['backend/src/routes/plugin.routes.ts', 'Plugin API routes'],
  ['backend/src/middlewares/auth.ts', 'Authentication middleware'],
];

let backendOk = true;
backendChecks.forEach(([file, desc]) => {
  if (!checkFile(file, desc)) backendOk = false;
});

// Check Backend .env variables
if (fs.existsSync('backend/.env')) {
  console.log(colorize('\n  🔐 Environment Variables:\n', 'cyan'));

  const envVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'PLUGIN_MASTER_KEY',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'STEAM_API_KEY',
  ];

  envVars.forEach(varName => {
    const hasVar = checkEnvVariable('backend/.env', varName);
    const status = hasVar ? colorize('  ✅', 'green') : colorize('  ❌', 'red');
    console.log(`${status} ${varName}`);
  });
}

// Server Management Scripts
console.log(colorize('\n🛠️  Server Management Scripts\n', 'cyan'));

const scriptChecks = [
  ['backend/scripts/create-server.ts', 'Create server script'],
  ['backend/scripts/list-servers.ts', 'List servers script'],
  ['backend/scripts/regenerate-apikey.ts', 'Regenerate API key script'],
];

let scriptsOk = true;
scriptChecks.forEach(([file, desc]) => {
  if (!checkFile(file, desc)) scriptsOk = false;
});

// Plugin Checks
console.log(colorize('\n🎮 ARK Plugin Components\n', 'cyan'));

const pluginChecks = [
  ['ark-plugin/CMakeLists.txt', 'CMake configuration'],
  ['ark-plugin/config.json', 'Plugin configuration'],
  ['ark-plugin/src/HeartShop.h', 'Main plugin header'],
  ['ark-plugin/src/HeartShop.cpp', 'Main plugin source'],
  ['ark-plugin/src/Commands.cpp', 'Commands source'],
  ['ark-plugin/src/HttpClient.cpp', 'HTTP client source'],
  ['ark-plugin/src/Config.cpp', 'Config loader source'],
];

let pluginOk = true;
pluginChecks.forEach(([file, desc]) => {
  if (!checkFile(file, desc)) pluginOk = false;
});

// Check compiled DLL
if (fs.existsSync('ark-plugin/build/bin/Release/HeartShop.dll')) {
  const size = getFileSize('ark-plugin/build/bin/Release/HeartShop.dll');
  console.log(`  ${colorize('✅', 'green')} Compiled DLL (${size})`);
} else {
  console.log(`  ${colorize('❌', 'red')} Compiled DLL`);
  console.log(`     ${colorize('Info:', 'yellow')} Run CMake build to compile plugin`);
  pluginOk = false;
}

// Check plugin config
if (fs.existsSync('ark-plugin/config.json')) {
  console.log(colorize('\n  ⚙️  Plugin Configuration:\n', 'cyan'));

  try {
    const config = JSON.parse(fs.readFileSync('ark-plugin/config.json', 'utf8'));
    const heartshop = config.HeartShop || {};

    const apiUrl = heartshop.ApiUrl || '';
    const apiKey = heartshop.ApiKey || '';
    const serverId = heartshop.ServerId || 0;

    const urlStatus = apiUrl ? colorize('✅', 'green') : colorize('❌', 'red');
    console.log(`  ${urlStatus} ApiUrl: ${apiUrl || '(not set)'}`);

    const keyStatus = (apiKey && apiKey !== 'your-server-api-key-here')
      ? colorize('✅', 'green')
      : colorize('⚠️', 'yellow');
    const keyDisplay = (apiKey && apiKey !== 'your-server-api-key-here')
      ? `${apiKey.substring(0, 20)}...`
      : '(placeholder - need to run create-server.ts)';
    console.log(`  ${keyStatus} ApiKey: ${keyDisplay}`);

    const idStatus = serverId > 0 ? colorize('✅', 'green') : colorize('⚠️', 'yellow');
    console.log(`  ${idStatus} ServerId: ${serverId}`);
  } catch (e) {
    console.log(`  ${colorize('❌', 'red')} Failed to parse config.json`);
  }
}

// Dependencies Check
console.log(colorize('\n📚 Dependencies\n', 'cyan'));

const depChecks = [
  ['ark-plugin/deps/ArkServerApi', 'ARK Server API'],
  ['ark-plugin/deps/json-3.12.0', 'nlohmann/json library'],
];

let depsOk = true;
depChecks.forEach(([dir, desc]) => {
  if (!checkDirectory(dir, desc)) depsOk = false;
});

// Documentation Check
console.log(colorize('\n📖 Documentation\n', 'cyan'));

const docChecks = [
  ['README.md', 'Main README'],
  ['DEPLOYMENT.md', 'Deployment guide'],
  ['PROJECT_STATUS.md', 'Project status'],
  ['backend/README.md', 'Backend documentation'],
  ['ark-plugin/README.md', 'Plugin documentation'],
];

let docsOk = true;
docChecks.forEach(([file, desc]) => {
  if (!checkFile(file, desc)) docsOk = false;
});

// Summary
console.log(colorize('\n' + '=' .repeat(60), 'blue'));
console.log(colorize('\n📊 Summary\n', 'cyan'));

const components = [
  ['Backend', backendOk],
  ['Server Scripts', scriptsOk],
  ['ARK Plugin', pluginOk],
  ['Dependencies', depsOk],
  ['Documentation', docsOk],
];

components.forEach(([name, ok]) => {
  const status = ok ? colorize('✅ READY', 'green') : colorize('❌ ISSUES', 'red');
  console.log(`  ${name.padEnd(20)} ${status}`);
});

const allOk = backendOk && scriptsOk && pluginOk && depsOk && docsOk;

console.log(colorize('\n' + '=' .repeat(60), 'blue'));

if (allOk) {
  console.log(colorize('\n✅ All checks passed! System is ready.\n', 'green'));
  console.log('Next steps:');
  console.log('  1. cd backend && npm install');
  console.log('  2. npx prisma generate');
  console.log('  3. npx prisma migrate dev');
  console.log('  4. npm run dev');
  console.log('  5. npx tsx scripts/create-server.ts "My Server" "TheIsland"');
  console.log('  6. Update ark-plugin/config.json with API Key');
  console.log('  7. Deploy HeartShop.dll to ARK server');
  console.log(colorize('\n📖 See DEPLOYMENT.md for detailed instructions.\n', 'cyan'));
} else {
  console.log(colorize('\n⚠️  Some issues found. Please review above.\n', 'yellow'));
  console.log('Common solutions:');
  console.log('  - Missing files: Check if you have the complete repository');
  console.log('  - Missing DLL: Run CMake build (see ark-plugin/README.md)');
  console.log('  - Missing API Key: Run backend/scripts/create-server.ts');
  console.log('  - Missing dependencies: Run setup scripts in DEPLOYMENT.md');
  console.log();
}

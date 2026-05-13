#!/usr/bin/env node
/**
 * SignedByMe SDK Post-Install Script
 * 
 * Automatically downloads the correct native binaries for the current platform.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CDN_BASE = 'https://signedby-assets.atl1.cdn.digitaloceanspaces.com';
const GROTH16_PATH = '/groth16';
const LIB_DIR = path.join(__dirname, '..', 'lib');

// Platform detection
function getPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'macos-x64';
  
  return null;
}

// Download file
function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  const platform = getPlatform();
  
  if (!platform) {
    console.log(`Unsupported platform: ${process.platform}-${process.arch}`);
    console.log('Native binaries must be installed manually.');
    process.exit(0);
  }
  
  console.log(`Detected platform: ${platform}`);
  
  // Create lib directory
  if (!fs.existsSync(LIB_DIR)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
  }
  
  // Files to download
  const files = [
    {
      url: `${CDN_BASE}${GROTH16_PATH}/membership_final.zkey`,
      dest: path.join(LIB_DIR, 'membership_final.zkey')
    },
    {
      url: `${CDN_BASE}${GROTH16_PATH}/verification_key_final.json`,
      dest: path.join(LIB_DIR, 'verification_key_final.json')
    }
  ];
  
  // Add platform-specific binary (from GitHub Releases)
  // Note: Native libs are included in GitHub Release ZIPs
  // The SDK loads them from the lib directory
  
  try {
    for (const file of files) {
      // Skip if already exists
      if (fs.existsSync(file.dest)) {
        console.log(`Already exists: ${path.basename(file.dest)}`);
        continue;
      }
      
      await download(file.url, file.dest);
      console.log(`Downloaded: ${path.basename(file.dest)}`);
    }
    
    console.log('SignedByMe SDK binaries installed successfully.');
  } catch (err) {
    console.error(`Error downloading binaries: ${err.message}`);
    console.log('You may need to download binaries manually from:');
    console.log('https://github.com/SIGNEDBYME-APP/SIGNEDBYME/releases');
    process.exit(1);
  }
}

main();

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
const zlib = require('zlib');

const CDN_BASE = 'https://signedby-assets.atl1.cdn.digitaloceanspaces.com';
const GROTH16_PATH = '/groth16';
const GITHUB_RELEASE_BASE = 'https://github.com/SIGNEDBYME-APP/SIGNEDBYME/releases/download';
const LIB_DIR = path.join(__dirname, '..', 'lib');

// Get SDK version from package.json
function getVersion() {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return pkg.version;
}

// Platform detection
function getPlatform() {
  const platform = process.platform;
  const arch = process.arch;
  
  if (platform === 'linux' && arch === 'x64') return 'linux-x64';
  if (platform === 'linux' && arch === 'arm64') return 'linux-arm64';
  if (platform === 'darwin' && arch === 'arm64') return 'macos-arm64';
  if (platform === 'darwin' && arch === 'x64') return 'macos-x64';
  if (platform === 'win32' && arch === 'x64') return 'windows-x64';
  
  return null;
}

// Get native library filename for platform
function getNativeLibName(platform) {
  if (platform.startsWith('linux')) return 'libsignedby_sdk.so';
  if (platform.startsWith('macos')) return 'libsignedby_sdk.dylib';
  if (platform.startsWith('windows')) return 'signedby_sdk.dll';
  return null;
}

// Download file with redirect support
function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading: ${url}`);
    
    const protocol = url.startsWith('https') ? https : require('http');
    
    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }
      
      const file = fs.createWriteStream(dest);
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

// Extract a specific file from a ZIP
async function extractFromZip(zipPath, filename, destPath) {
  // Use Node.js built-in to read ZIP (simple implementation)
  // For a full implementation, we'd use a library like 'adm-zip'
  // For now, try using system unzip command
  try {
    execSync(`unzip -o -j "${zipPath}" "${filename}" -d "${path.dirname(destPath)}"`, { stdio: 'pipe' });
    // Rename if needed
    const extractedPath = path.join(path.dirname(destPath), filename);
    if (extractedPath !== destPath && fs.existsSync(extractedPath)) {
      fs.renameSync(extractedPath, destPath);
    }
    return true;
  } catch (e) {
    // Try Python's zipfile as fallback
    try {
      const pythonCmd = `python3 -c "import zipfile; z=zipfile.ZipFile('${zipPath}'); z.extract('${filename}', '${path.dirname(destPath)}')"`;
      execSync(pythonCmd, { stdio: 'pipe' });
      const extractedPath = path.join(path.dirname(destPath), filename);
      if (extractedPath !== destPath && fs.existsSync(extractedPath)) {
        fs.renameSync(extractedPath, destPath);
      }
      return true;
    } catch (e2) {
      console.error('Failed to extract ZIP. Please install unzip or Python 3.');
      return false;
    }
  }
}

async function main() {
  const platform = getPlatform();
  const version = getVersion();
  
  if (!platform) {
    console.log(`Unsupported platform: ${process.platform}-${process.arch}`);
    console.log('Native binaries must be installed manually.');
    process.exit(0);
  }
  
  console.log(`Detected platform: ${platform}`);
  console.log(`SDK version: ${version}`);
  
  // Create lib directory
  if (!fs.existsSync(LIB_DIR)) {
    fs.mkdirSync(LIB_DIR, { recursive: true });
  }
  
  // Files to download from CDN (proving files)
  const cdnFiles = [
    {
      url: `${CDN_BASE}${GROTH16_PATH}/membership_final.zkey`,
      dest: path.join(LIB_DIR, 'membership_final.zkey')
    },
    {
      url: `${CDN_BASE}${GROTH16_PATH}/verification_key_final.json`,
      dest: path.join(LIB_DIR, 'verification_key_final.json')
    }
  ];
  
  try {
    // Download proving files from CDN
    for (const file of cdnFiles) {
      if (fs.existsSync(file.dest)) {
        console.log(`Already exists: ${path.basename(file.dest)}`);
        continue;
      }
      
      await download(file.url, file.dest);
      console.log(`Downloaded: ${path.basename(file.dest)}`);
    }
    
    // Download native library from GitHub Releases
    const nativeLibName = getNativeLibName(platform);
    const nativeLibDest = path.join(LIB_DIR, nativeLibName);
    
    if (fs.existsSync(nativeLibDest)) {
      console.log(`Already exists: ${nativeLibName}`);
    } else {
      // Download the platform-specific ZIP from GitHub Releases
      const zipUrl = `${GITHUB_RELEASE_BASE}/v${version}/signedby-sdk-${platform}-v${version}.zip`;
      const zipDest = path.join(LIB_DIR, `sdk-${platform}.zip`);
      
      console.log(`Downloading native libraries from GitHub Releases...`);
      await download(zipUrl, zipDest);
      
      // Extract the native library
      console.log(`Extracting ${nativeLibName}...`);
      const extracted = await extractFromZip(zipDest, nativeLibName, nativeLibDest);
      
      if (extracted && fs.existsSync(nativeLibDest)) {
        console.log(`Extracted: ${nativeLibName}`);
        // Make executable on Unix
        if (process.platform !== 'win32') {
          fs.chmodSync(nativeLibDest, 0o755);
        }
      } else {
        throw new Error(`Failed to extract ${nativeLibName} from ZIP`);
      }
      
      // Clean up ZIP
      fs.unlinkSync(zipDest);
    }
    
    console.log('SignedByMe SDK binaries installed successfully.');
  } catch (err) {
    console.error(`Error downloading binaries: ${err.message}`);
    console.log('You may need to download binaries manually from:');
    console.log('https://github.com/SIGNEDBYME-APP/SIGNEDBYME/releases');
    // Don't exit with error - allow SDK to be used without native libs for dev
    process.exit(0);
  }
}

main();

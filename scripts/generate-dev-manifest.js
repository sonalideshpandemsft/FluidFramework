const fetch = require('node-fetch');
const fs = require('fs');

// Constants
const PACKAGE_NAME = '@fluidframework/container-runtime';
const REGISTRY_URL = 'https://pkgs.dev.azure.com/fluidframework/internal/_packaging/build/npm/registry/';
const ADO_PAT = '<YOUR-ADO-PAT>';
const organization = 'fluidframework';
const project = 'internal';
const ADO_BASE_URL = `https://dev.azure.com/${organization}/${project}/_apis/build/builds?api-version=7.0`;
const GITHUB_RELEASE_URL = "https://api.github.com/repos/microsoft/FluidFramework/releases";

// Authorization header for Azure DevOps
const authHeader = `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`;

/**
 * Fetches the first successful build number in the last 24 hours.
 * @returns {string} The build number if successful, otherwise undefined.
 */
async function getFirstSuccessfulBuild() {
  try {
    const response = await fetch(ADO_BASE_URL, { headers: { Authorization: authHeader } });
    const data = await response.json();

    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

    const successfulBuilds = data.value.filter(build =>
      build.definition.name === 'Build - client packages' &&
      build.status === 'completed' &&
      build.result === 'succeeded' &&
      build.sourceBranch === 'refs/heads/main' &&
      new Date(build.finishTime) >= twentyFourHoursAgo
    );

    if (successfulBuilds.length > 0) {
      return successfulBuilds[0].buildNumber;
    } else {
      return undefined;
    }
  } catch (error) {
    console.error('Error fetching successful builds:', error.message);
    return undefined;
  }
}

/**
 * Fetches the dev version number released in the specified build.
 * @param {string} buildNumber - The build number.
 * @returns {string} The dev version number if found, otherwise undefined.
 */
async function fetchDevVersionNumber(buildNumber) {
  try {
    const response = await fetch(`${REGISTRY_URL}/${PACKAGE_NAME}`, { headers: { Authorization: authHeader } });
    const data = await response.json();
    const time = data.time;

    for (const key in time) {
      if (key.includes(buildNumber)) {
        return key;
      }
    }

    console.log(`No version with build number ${buildNumber} found.`);
    return undefined;
  } catch (error) {
    console.error('Error fetching dev version number:', error.message);
    return undefined;
  }
}

/**
 * Generates a modified manifest file with the specified version number.
 * @param {string} VERSION - The version number.
 */
async function generateManifestFile(VERSION) {
  try {
    const releasesResponse = await fetch(GITHUB_RELEASE_URL);
    const releases = await releasesResponse.json();

    // Find the latest caret.json internal manifest file URL
    const manifestAsset = releases[0].assets.find(asset => asset.name.includes('.caret.json'));
    if (manifestAsset) {
      const manifest_url_caret = manifestAsset.browser_download_url;
      console.log(`Downloading latest internal manifest: ${manifest_url_caret}`);

      const manifestResponse = await fetch(manifest_url_caret);
      const manifestData = await manifestResponse.buffer();
      const manifest_filename = manifest_url_caret.substring(manifest_url_caret.lastIndexOf('/') + 1);
      const new_manifest_filename = `fluid-framework-release-manifest.client.${VERSION}.caret.json`;

      fs.writeFileSync(manifest_filename, manifestData);
      fs.renameSync(manifest_filename, new_manifest_filename);

      const modifiedManifest = JSON.parse(fs.readFileSync(new_manifest_filename, 'utf-8'));
      for (const key in modifiedManifest) {
        if (modifiedManifest[key].includes('internal')) {
          modifiedManifest[key] = VERSION;
        }
      }

      fs.writeFileSync(new_manifest_filename, JSON.stringify(modifiedManifest, null, 2));
      console.log('Manifest modified successfully.');
    } else {
      console.log('No matching internal manifest file found.');
    }
  } catch (error) {
    console.error('Error generating manifest file:', error.message);
  }
}

/**
 * Main function to fetch build details, dev version, and generate manifest.
 */
async function main() {
  try {
    const buildNumber = await getFirstSuccessfulBuild();
    if (buildNumber) {
      console.log(`Most successful build number for the last 24 hours: ${buildNumber}`);
      const devVersion = await fetchDevVersionNumber(buildNumber);
      if (devVersion) {
        console.log(`Fetched dev version: ${devVersion}`);
        await generateManifestFile(devVersion);
      }
    }
  } catch (error) {
    console.error('An error occurred:', error.message);
  }
}

main();

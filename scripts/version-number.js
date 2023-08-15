const axios = require('axios');
const fs = require('fs');

const PACKAGE_NAME = '@fluidframework/container-runtime';
const REGISTRY_URL = 'https://pkgs.dev.azure.com/fluidframework/internal/_packaging/build/npm/registry/';

const ADO_PAT = '<YOUR-ADO-PAT>'; 
const organization = 'fluidframework';
const project = 'internal';
const ADO_BASE_URL = `https://dev.azure.com/${organization}/${project}/_apis/build/builds?api-version=7.0`;

const GITHUB_RELEASE_URL = "https://api.github.com/repos/microsoft/FluidFramework/releases";

const authHeader = `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`;
const config = {
  headers: {
    Authorization: `Basic ${Buffer.from(`:${ADO_PAT}`).toString('base64')}`,
  },
};
``
async function getFirstSuccessfulBuild() {
  try {
	const response = await axios.get(ADO_BASE_URL, config);
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const successfulBuilds = response.data.value.filter(build =>
    build.definition.name === 'Build - client packages' &&
    build.status === 'completed' &&
    build.result === 'succeeded' &&
    build.sourceBranch === 'refs/heads/main' &&
    new Date(build.finishTime) >= twentyFourHoursAgo
  );

  if (successfulBuilds.length > 0) {
    const successfulBuildNumbers = successfulBuilds.map(build => build.buildNumber);
    return successfulBuildNumbers[0];
  } else {
    return undefined;
  }
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}

/**
 * Fetch the dev version number released in the last 24 hours.
 */
async function fetchDevVersionNumber(buildNumber) {
  try {
    const response = await axios.get(`${REGISTRY_URL}/${PACKAGE_NAME}`, { headers: { Authorization: authHeader } });
    const time = response.data.time;

    for (const key in time) {
      if (key.includes(buildNumber)) {
        return key; // Return the matching version immediately
      }
    }

    console.log(`No version with build number ${buildNumber} found.`);
    return undefined; // Return undefined if no matching version is found
  } catch (error) {
    console.error('Error:', error.message);
    return undefined; // Return undefined in case of an error
  }
}

/**
 * Fetch the most recent caret manifest file published to GitHub.
 * Replace the ranges with the dev version number in this manifest file.
 */
async function generateManifestFile(VERSION) {
  try {
    const releasesResponse = await axios.get(GITHUB_RELEASE_URL);
    const releases = releasesResponse.data;

    // Find the latest caret.json internal manifest file URL
    const manifestAsset = releases[0].assets.find(asset => asset.name.includes('.caret.json'));
    if (manifestAsset) {
      const manifest_url_caret = manifestAsset.browser_download_url;
      console.log(`Downloading latest internal manifest: ${manifest_url_caret}`);

      const manifestResponse = await axios.get(manifest_url_caret, { responseType: 'arraybuffer' });
      const manifestData = manifestResponse.data;
      const manifest_filename = manifest_url_caret.substring(manifest_url_caret.lastIndexOf('/') + 1);
      const new_manifest_filename = `fluid-framework-release-manifest.client.${VERSION}.caret.json`;

      fs.writeFileSync(manifest_filename, Buffer.from(manifestData));
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
    console.error('Error:', error.message);
  }
}


async function main() {
  const buildId = await getFirstSuccessfulBuild();
  console.log(`Most successful build number for the last 24 hours: ${buildId}`);

  const devVersion = await fetchDevVersionNumber(buildId);
  console.log(`Fetch the dev version published to build feed for ${buildId}: ${devVersion}`);

  await generateManifestFile(devVersion);
}

main().catch(() => console.error(`Check FF script`));
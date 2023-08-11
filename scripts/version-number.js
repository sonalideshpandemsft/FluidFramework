/**
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const axios = require('axios');
const fs = require('fs');

const DAYS = 1;
const PACKAGE_NAME = '@fluidframework/container-runtime';
const REGISTRY_URL = 'https://registry.npmjs.org';
const DAYS_AGO = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
var VERSION;


/**
 * Fetch the dev version number released in the last 24 hours.
 */
axios.get(`${REGISTRY_URL}/${PACKAGE_NAME}`).then(response => {
  const time = response.data.time;
  
  for (const key in time) {
    if (key.includes('dev')) {
      const publishDate = new Date(time[key]).toISOString();
      if (publishDate > DAYS_AGO) {
        console.log(`Version ${key} was published on ${publishDate}`);
        VERSION = key;
      }
    }
  }
}).catch(error => {
  console.error('Error:', error.message);
});

/**
 * Fetch the most recent caret manifest file published to GitHub.
 * Replace the ranges with the dev version number in this manifest file.
 */
axios.get('https://api.github.com/repos/microsoft/FluidFramework/releases')
  .then(response => {
    const releases = response.data;

    // Find the latest caret.json internal manifest file URL
    const manifestAsset = releases[0].assets.find(asset => asset.name.includes('.caret.json'));
    if (manifestAsset) {
      const manifest_url_caret = manifestAsset.browser_download_url;
      console.log(`Downloading latest internal manifest: ${manifest_url_caret}`);

      axios.get(manifest_url_caret, { responseType: 'arraybuffer' })
        .then(response => {
          const manifestData = response.data;
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
        })
        .catch(error => {
          console.error('Error downloading manifest:', error);
        });
    } else {
      console.log('No matching internal manifest file found.');
    }
  })
  .catch(error => {
    console.error('Error fetching releases:', error);
  });



/**
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const axios = require('axios');

/**
 * Fetch the most recent minor/patch.
 * TODO: Modify this function to filter the most recent minor/patch version by date
 */
async function fetchReleases() {
  try {
    const response = await axios.get(
      'https://api.github.com/repos/microsoft/FluidFramework/releases'
    );

    const releases = response.data; // This will be an array of release objects

    if (releases.length > 0) {
      const firstRelease = releases[0];
      const filteredAssets = firstRelease.assets.filter(asset => 
        asset.name.includes('simple.json') || asset.name.includes('caret.json')
      );

      const browserUrls = filteredAssets.map(asset => asset.browser_download_url);

      const inputString = releases[0].name;

      const containsMinor = /minor/i.test(inputString);
      const containsPatch = /patch/i.test(inputString);
      let type;

      if (containsMinor) {
        type = "minor";
      }

      if (containsPatch) {
        type = "patch";
      }

      const result = {
        releaseType: type,
        name: releases[0].name,
        urls: browserUrls,
        date: releases[0].published_at
      }

      console.log(`Result: ${JSON.stringify(result)}`)

      return result;
    } else {
      console.log('No releases found.');
    }
  } catch (error) {
    console.error('Error fetching releases:', error);
  }
}
 
fetchReleases();

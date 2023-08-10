#!/bin/bash

echo SETVERSION_VERSION=$SETVERSION_VERSION

# Set the version environment variable
export SETVERSION_VERSION=$SETVERSION_VERSION

# Fetch releases using GitHub API
releases=$(curl -s "https://api.github.com/repos/microsoft/FluidFramework/releases")

# Find the latest caret.json internal manifest file URL
manifest_url_caret=$(echo "$releases" | jq -r '.[0] | .assets[] | select(.name | contains(".caret.json")) | .browser_download_url')

if [ -n "$manifest_url_caret" ]; then
  echo "Downloading latest internal manifest: $manifest_url_caret"
  curl -LOJ "$manifest_url_caret"

  # Extract the filename from the URL
  manifest_filename=$(basename "$manifest_url_caret")

  # New file name with version variable
  new_manifest_filename="fluid-framework-release-manifest.client.${SETVERSION_VERSION}.caret.json"

  # Rename the downloaded manifest file
  mv "$manifest_filename" "$new_manifest_filename"

  # Modify the downloaded manifest file using jq with version variable
  jq --arg version "$SETVERSION_VERSION" 'to_entries | map(if .value | contains("internal") then . + {value: $version} else . end) | from_entries' "$new_manifest_filename" > temp.json && mv temp.json "$new_manifest_filename"

  echo "Manifest modified successfully."

  # Upload simple.json and caret.json manifest files to azure blob

else
  echo "No matching internal manifest file found."
fi

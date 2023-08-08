#!/bin/bash

# echo SETVERSION_VERSION=$SETVERSION_VERSION 

# Fetch releases using GitHub API
releases=$(curl -s "https://api.github.com/repos/microsoft/FluidFramework/releases")

# Find the latest caret.json internal manifest file URL
manifest_url_caret=$(echo "$releases" | jq -r '.[0] | .assets[] | select(.name | contains(".caret.json")) | .browser_download_url')

if [ -n "$manifest_url_caret" ]; then
  echo "Downloading latest internal manifest: $manifest_url_caret"
  curl -LOJ "$manifest_url_caret"
fi

# Find the latest simple.json internal manifest file URL
manifest_url_simple=$(echo "$releases" | jq -r '.[0] | .assets[] | select(.name | contains(".simple.json")) | .browser_download_url')

if [ -n "$manifest_url_simple" ]; then
  echo "Downloading latest internal manifest: $manifest_url_simple"
  curl -LOJ "$manifest_url_simple"

  # Extract the filename from the URL
  manifest_filename=$(basename "$manifest_url_simple")

  # Modify the downloaded manifest file using jq
  jq 'to_entries | map(if .value | contains("internal") then . + {value: "2.0.0-dev.5.3.2.178189"} else . end) | from_entries' "$manifest_filename" > temp.json && mv temp.json "$manifest_filename"
  
  echo "Manifest modified successfully."

  # Upload simple.json and caret.json manifest files to azure blob

else
  echo "No matching internal manifest file found."
fi

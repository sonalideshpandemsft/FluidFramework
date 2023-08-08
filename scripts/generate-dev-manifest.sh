#!/bin/bash

# Fetch releases using GitHub API
releases=$(curl -s "https://api.github.com/repos/microsoft/FluidFramework/releases")

# Find the latest internal manifest file URL
manifest_url=$(echo "$releases" | jq -r '.[0] | .assets[] | select(.name | contains(".simple.json")) | .browser_download_url')

if [ -n "$manifest_url" ]; then
  echo "Downloading latest internal manifest: $manifest_url"
  curl -LOJ "$manifest_url"
else
  echo "No matching internal manifest file found."
fi

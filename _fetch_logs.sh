#!/bin/bash

# Get the current date in YYYY/MM/DD format
date_part=$(date +"%Y/%m/%d")

# Define remote and local paths
REMOTE_USER="ubuntu"
REMOTE_HOST="141.144.244.28"
REMOTE_PATH="/var/www/app.tuberbrie.com/logs/$date_part.log"
LOCAL_PATH="$HOME/Downloads/"

# Print the command that will be executed
echo "Copying from: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
echo "Copying to: $LOCAL_PATH"

# Run SCP command
scp "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH" "$LOCAL_PATH"


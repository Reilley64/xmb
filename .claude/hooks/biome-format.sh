#!/bin/bash
FILE_PATH=$(python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('file_path',''))" 2>/dev/null)
if [ -n "$FILE_PATH" ]; then
  cd /Users/reilley/Repositories/my-expo-app && bunx biome check --write "$FILE_PATH"
fi

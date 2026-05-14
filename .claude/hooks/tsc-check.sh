#!/bin/bash
FILE_PATH=$(python3 -c "import sys,json; data=json.load(sys.stdin); print(data.get('file_path',''))" 2>/dev/null)
if [[ "$FILE_PATH" == *.ts || "$FILE_PATH" == *.tsx ]]; then
  cd /Users/reilley/Repositories/my-expo-app && bunx tsc --noEmit --pretty false 2>&1 | grep -E 'error TS' | head -20
fi

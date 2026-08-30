#!/bin/bash
# Telemetry-First Vercel Deployment Gate

echo "[KEL-Governance] Evaluating deployment signature for commit: $VERCEL_GIT_COMMIT_SHA"

if git describe --exact-match --tags HEAD >/dev/null 2>&1; then
  echo "[KEL-Governance] ✅ Tagged release detected. Proceeding with build."
  exit 1
else
  echo "[KEL-Governance] 🚫 No release tag detected on HEAD. Enforcing 'No Junk' policy."
  exit 0
fi
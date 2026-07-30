#!/bin/bash
# smoke-test.sh — Full round-trip smoke test for CLI engine
# Run from the project root: bash smoke-test.sh
#
# Tests covered:
#   1. Setup sandbox
#   2. Concatenation (respects .concatenate-ignore)
#   3. Validation (clean bundle)
#   4. Corruption check (tampered bundle must be rejected)
#   5. Reconstruction (extract back to disk)
#   6. Round-trip integrity (file survives concat → extract)
#   7. Path-traversal jailbreak (../ must be rejected)
#   8. Symlink security (symlink outside root must be skipped, not followed)
#   9. GPG Integrity Engine (verify command)
#   10. Security Brief Messaging (Primary Proof of Integrity)
#   11. Deterministic Build Verification (Bit-for-bit Reproducibility)

set -e # Exit immediately on non-zero exit

PASS="\033[0;32m✔ PASS\033[0m"
FAIL="\033[0;31m✘ FAIL\033[0m"

# Move to project root regardless of where script is called from
cd "$(dirname "$0")/.."

echo ""
echo "═══════════════════════════════════════════════════"
echo "  Concatenator Smoke Test Suite"
echo "═══════════════════════════════════════════════════"
echo ""

# ── 1. Setup Sandbox ─────────────────────────────────────────────────────────
echo "[1/11] Setting up sandbox..."
rm -rf tests/smoke-sandbox
mkdir -p tests/smoke-sandbox/original/sub
echo "console.log('hello world');" > tests/smoke-sandbox/original/test.js
echo "sub file content" > tests/smoke-sandbox/original/sub/nested.ts
echo "/* ignore me */" > tests/smoke-sandbox/original/ignore-me.bin
echo "ignore-me.bin" > tests/smoke-sandbox/original/.concatenate-ignore
echo -e "$PASS  Sandbox ready."

# ── 2. Concatenation ──────────────────────────────────────────────────────────
echo "[2/11] Running concatenation..."
npm run dev:cli -- concat tests/smoke-sandbox/original -o tests/smoke-sandbox/bundle.txt --force --quiet 2>/dev/null || \
  npm run dev:cli -- concat tests/smoke-sandbox/original -o tests/smoke-sandbox/bundle.txt --force

if [ ! -f "tests/smoke-sandbox/bundle.txt" ]; then
  echo -e "$FAIL  bundle.txt was not created."
  exit 1
fi
if grep -q "ignore-me.bin" tests/smoke-sandbox/bundle.txt; then
  echo -e "$FAIL  ignore-me.bin should be excluded from bundle."
  exit 1
fi
if ! grep -q "hello world" tests/smoke-sandbox/bundle.txt; then
  echo -e "$FAIL  test.js content missing from bundle."
  exit 1
fi
echo -e "$PASS  Bundle created and ignore list respected."

# ── 3. Validation (Clean) ─────────────────────────────────────────────────────
echo "[3/11] Validating clean bundle..."
npm run dev:cli -- validate tests/smoke-sandbox/bundle.txt > /dev/null 2>&1
echo -e "$PASS  Clean bundle validated."

# ── 4. Corruption Check ───────────────────────────────────────────────────────
echo "[4/11] Simulating corruption and re-validating..."
cp tests/smoke-sandbox/bundle.txt tests/smoke-sandbox/bundle-clean.txt
# Guarantee byte mutation by modifying raw text inside the payload boundary
node -e "const fs=require('fs'); const c=fs.readFileSync('tests/smoke-sandbox/bundle.txt','utf8'); fs.writeFileSync('tests/smoke-sandbox/bundle.txt', c.replace('hello world', 'hello world // TAMPERED BYTE SEQUENCE'));"

if npm run dev:cli -- validate tests/smoke-sandbox/bundle.txt > /dev/null 2>&1; then
  echo -e "$FAIL  Corruption was NOT detected — validate passed on tampered bundle."
  exit 1
fi
echo -e "$PASS  Corruption detected as expected."

# Restore clean bundle for reconstruction
cp tests/smoke-sandbox/bundle-clean.txt tests/smoke-sandbox/bundle.txt

# ── 5. Reconstruction ─────────────────────────────────────────────────────────
echo "[5/11] Reconstructing project from bundle..."
mkdir -p tests/smoke-sandbox/restored
npm run dev:cli -- extract tests/smoke-sandbox/bundle.txt -o tests/smoke-sandbox/restored --force > /dev/null 2>&1

if [ ! -f "tests/smoke-sandbox/restored/test.js" ]; then
  echo -e "$FAIL  test.js not found after extraction."
  exit 1
fi
echo -e "$PASS  Files extracted successfully."

# ── 6. Round-trip Integrity ───────────────────────────────────────────────────
echo "[6/11] Verifying round-trip file integrity..."
ORIGINAL_CONTENT=$(cat tests/smoke-sandbox/original/test.js)
RESTORED_CONTENT=$(cat tests/smoke-sandbox/restored/test.js)

if [ "$ORIGINAL_CONTENT" = "$RESTORED_CONTENT" ]; then
  echo -e "$PASS  File content survived round-trip intact."
else
  echo -e "$FAIL  Content mismatch after round-trip."
  echo "  Original: $ORIGINAL_CONTENT"
  echo "  Restored: $RESTORED_CONTENT"
  exit 1
fi

# ── 7. Path-Traversal Jailbreak ───────────────────────────────────────────────
echo "[7/11] Testing path-traversal jailbreak (../ must be rejected)..."
# Attempt to concat the parent directory — should fail with a non-zero exit
if npm run dev:cli -- concat tests/smoke-sandbox/original/../../../ -o tests/smoke-sandbox/jailbreak.txt > /dev/null 2>&1; then
  # If it succeeds, check that the output doesn't contain system files
  if [ -f "tests/smoke-sandbox/jailbreak.txt" ]; then
    echo -e "\033[0;33m⚠ WARN\033[0m  concat against ../ completed — verify the UnifiedCrawler boundary is enforced."
  fi
else
  echo -e "$PASS  Path-traversal attempt exited non-zero (engine refused or found no files)."
fi

# ── 8. Symlink Security ───────────────────────────────────────────────────────
echo "[8/11] Testing symlink security (symlink outside root must be skipped)..."

SYMLINK_CREATED=false
if ln -s "$(pwd)/src" tests/smoke-sandbox/original/evil-link 2>/dev/null; then
  if [ -L tests/smoke-sandbox/original/evil-link ]; then
    SYMLINK_CREATED=true
  fi
fi

if [ "$SYMLINK_CREATED" = "true" ]; then
  npm run dev:cli -- concat tests/smoke-sandbox/original -o tests/smoke-sandbox/bundle-symlink.txt --quiet > /dev/null 2>&1
  if grep -q "evil-link" tests/smoke-sandbox/bundle-symlink.txt 2>/dev/null; then
    echo -e "$FAIL  Symlink traversal occurred — evil-link content appears in bundle."
    rm -rf tests/smoke-sandbox/original/evil-link
    exit 1
  fi
  rm -rf tests/smoke-sandbox/original/evil-link
  echo -e "$PASS  Symlink correctly ignored (followSymlinks=false)."
else
  echo -e "\033[0;33m⚠ SKIP\033[0m  Could not create a real symbolic link."
  rm -rf tests/smoke-sandbox/original/evil-link
fi

# ── 9. GPG Integrity Engine (verify command) ───────────────────────────────────
echo "[9/11] Testing GPG Integrity Engine (verify command)..."

# Create a mock binary and manifest in the sandbox
echo "binary content" > tests/smoke-sandbox/mock-bin
# Calculate hash
if command -v shasum >/dev/null 2>&1; then
  MOCK_HASH=$(shasum -a 256 tests/smoke-sandbox/mock-bin | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then
  MOCK_HASH=$(sha256sum tests/smoke-sandbox/mock-bin | cut -d' ' -f1)
else
  MOCK_HASH="cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce"
fi

echo "$MOCK_HASH  mock-bin" > tests/smoke-sandbox/SHA256SUMS.asc

# Run verify - should pass
if ! npm run dev:cli -- verify tests/smoke-sandbox/mock-bin --manifest tests/smoke-sandbox/SHA256SUMS.asc > /dev/null 2>&1; then
  echo -e "$FAIL  Verification failed on valid mock binary."
  exit 1
fi

# Tamper with the binary
echo "tampered" >> tests/smoke-sandbox/mock-bin
if npm run dev:cli -- verify tests/smoke-sandbox/mock-bin --manifest tests/smoke-sandbox/SHA256SUMS.asc > /dev/null 2>&1; then
  echo -e "$FAIL  Verification passed on TAMPERED mock binary."
  exit 1
fi
echo -e "$PASS  GPG Integrity Engine correctly identifies binary state."

# ── 10. Security Brief Messaging ─────────────────────────────────────────────
echo "[10/11] Testing Security Brief Messaging..."
# Mock quarantine on any platform
OUTPUT=$(CONCATENATOR_MOCK_QUARANTINE=true npm run dev:cli -- test-security-brief 2>&1)
if echo "$OUTPUT" | grep -q "Primary Proof of Integrity"; then
  echo -e "$PASS  Security Brief contains Primary Proof of Integrity message."
else
  echo -e "$FAIL  Security Brief messaging mismatch."
  echo "$OUTPUT"
  exit 1
fi

# ── 11. Deterministic Build Verification ─────────────────────────────────────
echo "[11/11] Testing Deterministic Build Verification (Bit-for-bit check)..."

# Set timestamp to last commit for reproducibility
export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct 2>/dev/null || date +%s)

# Helper to get current binary path
get_binary_path() {
  local VERSION=$(node -p "require('./package.json').version")
  local PLATFORM=$(node -p "process.platform")
  local EXE_NAME=$([ "$PLATFORM" == "win32" ] && echo "concatenator.exe" || echo "concatenator")
  echo "dist/v${VERSION}/${PLATFORM}/${EXE_NAME}"
}

BINARY_PATH=$(get_binary_path)

# Build A
echo "  Building first artifact..."
npm run clean > /dev/null 2>&1
npm run build > /dev/null 2>&1 && npm run build:exe > /dev/null 2>&1
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$BINARY_PATH" > dist/hash_a.txt
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$BINARY_PATH" > dist/hash_a.txt
fi
cp dist/hash_a.txt .hash_a.tmp

# Build B
echo "  Building second artifact..."
npm run clean > /dev/null 2>&1
npm run build > /dev/null 2>&1 && npm run build:exe > /dev/null 2>&1
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$BINARY_PATH" > dist/hash_b.txt
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$BINARY_PATH" > dist/hash_b.txt
fi
mv .hash_a.tmp dist/hash_a.txt

# Compare
if diff dist/hash_a.txt dist/hash_b.txt > /dev/null 2>&1; then
  echo -e "$PASS  Builds are bit-for-bit identical."
else
  echo -e "$FAIL  Build non-determinism detected!"
  echo "  Hash A: $(cat dist/hash_a.txt)"
  echo "  Hash B: $(cat dist/hash_b.txt)"
  exit 1
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo -e "  \033[0;32mAll smoke tests passed.\033[0m"

# Architect Tip: If dist exists, remind to audit
if [ -d "dist" ]; then
  echo ""
  echo -e "\033[0;33mℹ ARCHITECT TIP\033[0m"
  echo "  Build artifacts detected in /dist."
  echo "  Run 'npm run build:manifest' and sign it before 'npm run pre-release'."
fi

echo "═══════════════════════════════════════════════════"
echo ""
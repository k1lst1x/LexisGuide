#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
backend_dir=$(cd -- "$script_dir/.." && pwd)
repo_dir=$(cd -- "$backend_dir/.." && pwd)
artifact_path=${1:-"$repo_dir/.build/lexisguide-api.zip"}
build_dir=$(mktemp -d)

cleanup() {
  rm -rf -- "$build_dir"
}
trap cleanup EXIT

mkdir -p "$(dirname -- "$artifact_path")"
python3.12 -m pip install \
  --disable-pip-version-check \
  --no-compile \
  --target "$build_dir" \
  "$repo_dir/packages/review_contract" \
  "$repo_dir/packages/assistant_agent" \
  "$backend_dir"

# uvicorn[standard] brings speed-ups for the local development server. The
# Lambda serves through Mangum and never loads them, and uvloop alone is 16 MB.
rm -rf "$build_dir"/uvloop* "$build_dir"/httptools* "$build_dir"/watchfiles*

(
  cd "$build_dir"
  zip -q -r "$artifact_path" .
)

# Terraform uploads the ZIP directly, which Lambda caps at 50 MB. Fail here with
# a clear reason rather than partway through a production apply.
size=$(wc -c < "$artifact_path")
limit=$((50 * 1024 * 1024))
if [ "$size" -gt "$limit" ]; then
  printf 'Lambda package is %s bytes, over the 50 MB direct-upload limit.\n' "$size" >&2
  exit 1
fi

printf 'Created Lambda package: %s (%s bytes)\n' "$artifact_path" "$size"

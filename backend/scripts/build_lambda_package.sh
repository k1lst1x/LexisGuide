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

(
  cd "$build_dir"
  zip -q -r "$artifact_path" .
)

printf 'Created Lambda package: %s\n' "$artifact_path"

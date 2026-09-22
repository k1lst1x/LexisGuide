#!/usr/bin/env bash
# The AgentCore CLI installs dependencies from prebuilt wheels only, and an
# editable path install would only record a path on this machine. Build each
# shared package into its runtime's vendor/ folder and refresh the lock file.
# Run this after changing packages/ and before `agentcore deploy`.
set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)

build() {
  local package_dir=$1 runtime_dir=$2
  rm -rf "$runtime_dir/vendor"
  uv build --wheel --quiet --out-dir "$runtime_dir/vendor" "$package_dir"
  (cd "$runtime_dir" && uv lock --quiet)
  echo "Built $(ls "$runtime_dir/vendor") for $(basename "$runtime_dir")"
}

build "$root/packages/review_contract" "$root/agentcore/runtime"
build "$root/packages/assistant_agent" "$root/agentcore/assistant"

#!/bin/bash

#######################################
# Image generator for Chrome Web Store / archive icons.
#
# Extension:
#   Gazou Mimamori | X Sensitive Image Filter
#
# Notes:
#   - Generated files are development assets under tools/.
#   - This script does not overwrite icons/ files referenced by manifest.json.
#   - Do not include tools/ in the Chrome Web Store submission ZIP.
#######################################
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/webstore_icons_sources"
OUTPUT_DIR="${SCRIPT_DIR}/webstore_screenshot_outputs"

SOURCE_IMAGE="${SOURCE_DIR}/gazo-mimamori-icon.png"
if [ ! -f "${SOURCE_IMAGE}" ]; then
  SOURCE_IMAGE="${SOURCE_DIR}/gazo-mimamori-icon.jpeg"
fi

if [ ! -f "${SOURCE_IMAGE}" ]; then
  echo "Icon source image not found." >&2
  echo "Expected one of:" >&2
  echo "  ${SOURCE_DIR}/gazo-mimamori-icon.png" >&2
  echo "  ${SOURCE_DIR}/gazo-mimamori-icon.jpeg" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

generated_files=()
icon_sizes=(
  16
  32
  48
  128
  256
  512
  1024
)

for size in "${icon_sizes[@]}"; do
  output_file="${OUTPUT_DIR}/icon_${size}.png"
  sips -z "${size}" "${size}" "${SOURCE_IMAGE}" --setProperty format png --out "${output_file}" >/dev/null
  generated_files+=("${output_file}")
done

echo ""
echo "Generated icon files:"
for f in "${generated_files[@]}"; do
  file "${f}"
done

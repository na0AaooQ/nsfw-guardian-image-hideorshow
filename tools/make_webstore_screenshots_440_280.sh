#!/bin/bash

#######################################
# Screenshot generator for Chrome Web Store listing images.
#
# Extension:
#   Gazou Mimamori | X Sensitive Image Filter
#
# Size:
#   440x280
#
# Notes:
#   - Source screenshots are resized to fit inside the target size.
#   - White padding is added so important UI and red frames are not cropped.
#   - Do not include tools/ in the Chrome Web Store submission ZIP.
#######################################
set -euo pipefail

IMAGE_SIZE_WIDTH="440"
IMAGE_SIZE_HEIGHT="280"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/webstore_screenshot_sources"
OUTPUT_DIR="${SCRIPT_DIR}/webstore_screenshot_outputs"

tmp_files=()
cleanup() {
  for f in "${tmp_files[@]}"; do
    if [ -f "${f}" ]; then
      rm -f "${f}"
    fi
  done
}
trap cleanup EXIT

get_image_size() {
  sips -g pixelWidth -g pixelHeight "$1" 2>/dev/null | awk '
    /pixelWidth/ { width = $2 }
    /pixelHeight/ { height = $2 }
    END {
      if (!width || !height) {
        exit 1
      }
      print width, height
    }
  '
}

make_contained_png() {
  source_file="$1"
  output_file="$2"
  read -r source_width source_height <<EOF
$(get_image_size "${source_file}")
EOF

  read -r resized_width resized_height <<EOF
$(awk \
  -v source_width="${source_width}" \
  -v source_height="${source_height}" \
  -v target_width="${IMAGE_SIZE_WIDTH}" \
  -v target_height="${IMAGE_SIZE_HEIGHT}" \
  'BEGIN {
    scale_width = target_width / source_width
    scale_height = target_height / source_height
    scale = scale_width < scale_height ? scale_width : scale_height
    resized_width = int(source_width * scale + 0.5)
    resized_height = int(source_height * scale + 0.5)
    if (resized_width < 1) {
      resized_width = 1
    }
    if (resized_height < 1) {
      resized_height = 1
    }
    if (resized_width > target_width) {
      resized_width = target_width
    }
    if (resized_height > target_height) {
      resized_height = target_height
    }
    print resized_width, resized_height
  }')
EOF

  tmp_file="$(mktemp "${TMPDIR:-/tmp}/webstore_440_280_XXXXXX")"
  tmp_files+=("${tmp_file}")

  sips -z "${resized_height}" "${resized_width}" "${source_file}" --setProperty format png --out "${tmp_file}" >/dev/null
  sips --padToHeightWidth "${IMAGE_SIZE_HEIGHT}" "${IMAGE_SIZE_WIDTH}" --padColor FFFFFF "${tmp_file}" --out "${output_file}" >/dev/null 2>/dev/null
}

shopt -s nullglob
source_files=("${SOURCE_DIR}"/*.png)

if [ "${#source_files[@]}" -eq 0 ]; then
  echo "No source screenshots found: ${SOURCE_DIR}/*.png" >&2
  exit 1
fi

mkdir -p "${OUTPUT_DIR}"

generated_files=()

for source_file in "${source_files[@]}"; do
  base_name="$(basename "${source_file}" .png)"
  output_file="${OUTPUT_DIR}/${IMAGE_SIZE_WIDTH}x${IMAGE_SIZE_HEIGHT}_${base_name}.png"
  make_contained_png "${source_file}" "${output_file}"
  generated_files+=("${output_file}")
done

echo ""
echo "Generated screenshot files:"
for f in "${generated_files[@]}"; do
  file "${f}"
done

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NGSPICE_VERSION="${NGSPICE_VERSION:-46}"
NGSPICE_TARBALL="ngspice-${NGSPICE_VERSION}.tar.gz"
NGSPICE_URL="${NGSPICE_URL:-https://downloads.sourceforge.net/project/ngspice/ng-spice-rework/${NGSPICE_VERSION}/${NGSPICE_TARBALL}}"
NGSPICE_SHA256="${NGSPICE_SHA256:-a0d1699af1940b06649276dcd6ff5a566c8c0cad01b2f7b5e99dedbb4d64c19b}"

BUILD_ROOT="${SPICESIM_WASM_BUILD_DIR:-${ROOT_DIR}/.wasm-build/ngspice-${NGSPICE_VERSION}}"
SRC_DIR="${BUILD_ROOT}/ngspice-${NGSPICE_VERSION}"
OBJ_DIR="${BUILD_ROOT}/build-core"
OUT_DIR="${SPICESIM_WASM_OUT_DIR:-${ROOT_DIR}/public/vendor/ngspice}"
EMSCRIPTEN_ROOT="${EMSCRIPTEN_ROOT:-${EMSDK:-${HOME}/emsdk}/upstream/emscripten}"
EMCONFIGURE="${EMCONFIGURE:-${EMSCRIPTEN_ROOT}/emconfigure}"
EMMAKE="${EMMAKE:-${EMSCRIPTEN_ROOT}/emmake}"
EM_CACHE_DIR="${EM_CACHE:-${ROOT_DIR}/.wasm-build/emscripten-cache}"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc 2>/dev/null || echo 4)}"

if [ ! -x "${EMCONFIGURE}" ] || [ ! -x "${EMMAKE}" ]; then
  echo "Emscripten not found. Set EMSCRIPTEN_ROOT or EMSDK before running this script." >&2
  echo "Expected: ${EMCONFIGURE}" >&2
  exit 1
fi

mkdir -p "${BUILD_ROOT}" "${OBJ_DIR}" "${OUT_DIR}" "${EM_CACHE_DIR}"

if [ ! -f "${BUILD_ROOT}/${NGSPICE_TARBALL}" ]; then
  echo "Downloading ngspice ${NGSPICE_VERSION}..."
  curl -L "${NGSPICE_URL}" -o "${BUILD_ROOT}/${NGSPICE_TARBALL}.tmp"
  mv "${BUILD_ROOT}/${NGSPICE_TARBALL}.tmp" "${BUILD_ROOT}/${NGSPICE_TARBALL}"
fi

echo "${NGSPICE_SHA256}  ${BUILD_ROOT}/${NGSPICE_TARBALL}" | shasum -a 256 -c -

if [ ! -d "${SRC_DIR}" ]; then
  tar -xzf "${BUILD_ROOT}/${NGSPICE_TARBALL}" -C "${BUILD_ROOT}"
fi

if [ ! -f "${OBJ_DIR}/Makefile" ]; then
  echo "Configuring ngspice for Emscripten..."
  (
    cd "${OBJ_DIR}"
    EM_CACHE="${EM_CACHE_DIR}" "${EMCONFIGURE}" "${SRC_DIR}/configure" \
      --host=wasm32-unknown-emscripten \
      --prefix="${BUILD_ROOT}/install" \
      --disable-dependency-tracking \
      --disable-shared \
      --enable-static \
      --without-x \
      --with-readline=no \
      --with-fftw3=no \
      --disable-openmp \
      --disable-klu \
      --disable-osdi \
      --disable-xspice \
      CFLAGS="-O3" \
      LDFLAGS="-sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1"
  )
fi

echo "Building ngspice WASM..."
(
  cd "${OBJ_DIR}"
  EM_CACHE="${EM_CACHE_DIR}" "${EMMAKE}" make "-j${JOBS}"
)

cp "${OBJ_DIR}/src/ngspice" "${OUT_DIR}/ngspice.js"
cp "${OBJ_DIR}/src/ngspice.wasm" "${OUT_DIR}/ngspice.wasm"
cp "${SRC_DIR}/COPYING" "${OUT_DIR}/COPYING.ngspice"

cat > "${OUT_DIR}/manifest.json" <<JSON
{
  "name": "ngspice",
  "version": "${NGSPICE_VERSION}",
  "source": "${NGSPICE_URL}",
  "sha256": "${NGSPICE_SHA256}",
  "features": {
    "xspice": false,
    "osdi": false,
    "klu": false,
    "openmp": false
  }
}
JSON

echo "Wrote ${OUT_DIR}/ngspice.js and ${OUT_DIR}/ngspice.wasm"

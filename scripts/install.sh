#!/bin/sh
# Installs the latest (or a pinned) pharos release binary for this machine.
#
#   curl -fsSL https://raw.githubusercontent.com/ahokinson/pharos/develop/scripts/install.sh | sh
#
# Env overrides:
#   PHAROS_VERSION       release tag to install, e.g. v0.2.0 (default: latest)
#   PHAROS_INSTALL_DIR   where to place the binary (default: $HOME/.local/bin)
set -eu

REPO="ahokinson/pharos"
INSTALL_DIR="${PHAROS_INSTALL_DIR:-$HOME/.local/bin}"

say() { printf '%s\n' "$*"; }
die() {
  printf 'pharos install: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || die "missing required command: $1"
}

need curl
need uname
need chmod
need mktemp

os=""
case "$(uname -s)" in
  Darwin) os="darwin" ;;
  Linux) os="linux" ;;
  *) die "unsupported OS: $(uname -s) (pharos ships darwin/linux binaries only)" ;;
esac

arch=""
case "$(uname -m)" in
  x86_64 | amd64) arch="x64" ;;
  arm64 | aarch64) arch="arm64" ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac

target="${os}-${arch}"
asset="pharos-${target}"

version="${PHAROS_VERSION:-}"
if [ -z "$version" ]; then
  say "Resolving latest pharos release..."
  version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" |
    grep '"tag_name"' | head -n1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
  [ -n "$version" ] || die "could not resolve latest release tag from GitHub API"
fi

base_url="https://github.com/${REPO}/releases/download/${version}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

say "Downloading pharos ${version} (${target})..."
curl -fsSL -o "${tmp}/${asset}" "${base_url}/${asset}" ||
  die "failed to download ${asset} for release ${version} — does that release have a ${target} build?"

if curl -fsSL -o "${tmp}/checksums.txt" "${base_url}/checksums.txt" 2>/dev/null; then
  expected=$(grep "  ${asset}\$" "${tmp}/checksums.txt" | awk '{print $1}')
  if [ -n "$expected" ]; then
    if command -v sha256sum >/dev/null 2>&1; then
      actual=$(sha256sum "${tmp}/${asset}" | awk '{print $1}')
    elif command -v shasum >/dev/null 2>&1; then
      actual=$(shasum -a 256 "${tmp}/${asset}" | awk '{print $1}')
    else
      actual=""
    fi
    if [ -n "$actual" ]; then
      [ "$actual" = "$expected" ] || die "checksum mismatch for ${asset} (expected ${expected}, got ${actual})"
      say "Checksum verified."
    else
      say "Warning: no sha256sum/shasum found, skipping checksum verification."
    fi
  fi
fi

mkdir -p "$INSTALL_DIR"
chmod +x "${tmp}/${asset}"
mv "${tmp}/${asset}" "${INSTALL_DIR}/pharos"

say "Installed pharos ${version} to ${INSTALL_DIR}/pharos"

case ":$PATH:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    say ""
    say "${INSTALL_DIR} is not on your PATH. Add it, e.g.:"
    say "  export PATH=\"${INSTALL_DIR}:\$PATH\""
    ;;
esac

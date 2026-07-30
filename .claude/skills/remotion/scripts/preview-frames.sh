#!/usr/bin/env bash
#
# preview-frames.sh — render a handful of stills from a Remotion composition so you can
# look at the animation before paying for a full video render.
#
# A composition that typechecks can still be blank, mistimed, or positioned off-screen, and
# no log will tell you. Stills are cheap and readable as images, so they are the practical
# way to verify visual work.
#
#   ./preview-frames.sh --list
#   ./preview-frames.sh -c MyVideo -f 0,15,45,89
#   ./preview-frames.sh -c MyVideo -n 5 -o /tmp/preview
#   ./preview-frames.sh -c MyVideo -f 0,30 -p ./props.json -- --scale=0.5
#
# Then read the PNGs it prints. Sample the first frame, something mid-animation, and the
# last frame (durationInFrames - 1) — the endpoints are where clamping and off-by-one
# duration bugs surface.

set -euo pipefail

COMPOSITION=""
FRAMES=""
COUNT=""
OUT_DIR="out/preview"
ENTRY=""
PROPS=""
LIST_ONLY=0
PASSTHROUGH=()

usage() {
  cat <<'EOF'
Usage: preview-frames.sh [options] [-- <extra remotion flags>]

  -c, --composition ID   Composition ID (see --list)
  -f, --frames LIST      Comma-separated frame numbers, e.g. 0,15,45
  -n, --count N          Render N evenly-spaced frames across the composition's duration
  -o, --out DIR          Output directory (default: out/preview)
  -e, --entry PATH       Entry point, if it is not auto-detected
  -p, --props PATH       Input props JSON file
  -l, --list             Print the composition table (IDs, fps, durations) and exit
  -h, --help             Show this help

Anything after `--` is forwarded to `npx remotion still`, e.g. `-- --scale=0.5 --gl=angle`.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -c|--composition) COMPOSITION="$2"; shift 2 ;;
    -f|--frames)      FRAMES="$2";      shift 2 ;;
    -n|--count)       COUNT="$2";       shift 2 ;;
    -o|--out)         OUT_DIR="$2";     shift 2 ;;
    -e|--entry)       ENTRY="$2";       shift 2 ;;
    -p|--props)       PROPS="$2";       shift 2 ;;
    -l|--list)        LIST_ONLY=1;      shift ;;
    -h|--help)        usage; exit 0 ;;
    --)               shift; PASSTHROUGH=("$@"); break ;;
    *) echo "preview-frames.sh: unknown argument '$1'" >&2; usage >&2; exit 2 ;;
  esac
done

if ! command -v npx >/dev/null 2>&1; then
  echo "preview-frames.sh: npx not found — install Node.js first." >&2
  exit 1
fi

# Build the shared argument list. The entry point is optional because Remotion
# auto-detects it; passing it explicitly wins when detection picks the wrong file.
common_args=()
[[ -n "$PROPS" ]] && common_args+=("--props=$PROPS")

list_compositions() {
  local args=()
  [[ -n "$ENTRY" ]] && args+=("$ENTRY")
  args+=("${common_args[@]}")
  # Forward passthrough flags here too: `compositions` also needs a browser, so options like
  # --browser-executable and --timeout have to reach it, not just the `still` calls.
  [[ ${#PASSTHROUGH[@]} -gt 0 ]] && args+=("${PASSTHROUGH[@]}")
  npx remotion compositions "${args[@]}"
}

if [[ "$LIST_ONLY" -eq 1 ]]; then
  list_compositions
  exit 0
fi

if [[ -z "$COMPOSITION" ]]; then
  echo "preview-frames.sh: --composition is required (run with --list to see the options)." >&2
  exit 2
fi

# -n needs the composition's duration. `npx remotion compositions` prints one row per
# composition as `<id> <fps> <width>x<height> <durationInFrames> (<n> sec)`, so anchor on the
# dimensions field and take the number after it. That row shape is not a stable contract, so
# fail loudly and point at -f rather than guessing a duration and rendering misleading frames.
if [[ -n "$COUNT" && -z "$FRAMES" ]]; then
  if ! [[ "$COUNT" =~ ^[0-9]+$ ]] || [[ "$COUNT" -lt 1 ]]; then
    echo "preview-frames.sh: --count must be a positive integer." >&2
    exit 2
  fi

  echo "Looking up the duration of '$COMPOSITION'..." >&2
  table="$(list_compositions 2>/dev/null || true)"
  duration="$(
    printf '%s\n' "$table" \
      | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g' \
      | awk -v id="$COMPOSITION" '
          $1 == id {
            for (i = 2; i < NF; i++) {
              if ($i ~ /^[0-9]+x[0-9]+$/ && $(i + 1) ~ /^[0-9]+$/) {
                print $(i + 1)
                exit
              }
            }
          }'
  )"

  if [[ -z "$duration" || "$duration" -lt 1 ]]; then
    echo "preview-frames.sh: could not determine the duration of '$COMPOSITION'." >&2
    echo "Pass explicit frames instead, e.g. -f 0,15,45. Run --list to see durations." >&2
    exit 1
  fi

  last=$((duration - 1))
  if [[ "$COUNT" -eq 1 ]]; then
    FRAMES="0"
  else
    FRAMES="$(
      awk -v n="$COUNT" -v last="$last" 'BEGIN {
        for (i = 0; i < n; i++) {
          printf "%d%s", int(i * last / (n - 1) + 0.5), (i == n - 1 ? "\n" : ",")
        }
      }'
    )"
  fi
  echo "Duration ${duration} frames; sampling: ${FRAMES}" >&2
fi

if [[ -z "$FRAMES" ]]; then
  echo "preview-frames.sh: pass -f <frames> or -n <count>." >&2
  exit 2
fi

mkdir -p "$OUT_DIR"

IFS=',' read -r -a raw_frames <<< "$FRAMES"

# Normalise and drop duplicates, which -n produces on very short compositions and which are
# easy to introduce by hand. Rendering the same frame twice only wastes time and clutters the
# list of images to look at.
frame_list=()
for raw in "${raw_frames[@]}"; do
  raw="$(echo "$raw" | tr -d '[:space:]')"
  [[ -z "$raw" ]] && continue
  if ! [[ "$raw" =~ ^-?[0-9]+$ ]]; then
    echo "preview-frames.sh: '$raw' is not a frame number." >&2
    exit 2
  fi
  seen=0
  for existing in ${frame_list[@]+"${frame_list[@]}"}; do
    [[ "$existing" == "$raw" ]] && seen=1 && break
  done
  [[ "$seen" -eq 0 ]] && frame_list+=("$raw")
done

if [[ ${#frame_list[@]} -eq 0 ]]; then
  echo "preview-frames.sh: no valid frames given." >&2
  exit 2
fi

rendered=()

for frame in "${frame_list[@]}"; do

  # Zero-pad so the files sort in timeline order when listed or globbed.
  out_file="$OUT_DIR/${COMPOSITION}-$(printf '%05d' "$frame").png"

  still_args=()
  [[ -n "$ENTRY" ]] && still_args+=("$ENTRY")
  still_args+=("$COMPOSITION" "$out_file" "--frame=$frame")
  still_args+=("${common_args[@]}")
  [[ ${#PASSTHROUGH[@]} -gt 0 ]] && still_args+=("${PASSTHROUGH[@]}")

  echo "Rendering frame $frame -> $out_file" >&2
  npx remotion still "${still_args[@]}"
  rendered+=("$out_file")
done

if [[ ${#rendered[@]} -eq 0 ]]; then
  echo "preview-frames.sh: no frames were rendered." >&2
  exit 1
fi

echo >&2
echo "Rendered ${#rendered[@]} frame(s). Read these images to check the result:" >&2
printf '%s\n' "${rendered[@]}"

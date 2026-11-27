import argparse
import json
import subprocess
import sys

from pipeline import crop_filter


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--settings-json", required=True)
    args = parser.parse_args()

    try:
        settings = json.loads(args.settings_json)
    except json.JSONDecodeError as exc:
        print(f"Invalid edit settings: {exc}", file=sys.stderr)
        return 2

    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", args.input, "-vf", crop_filter(settings),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        args.output,
    ]
    try:
        subprocess.run(command, check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip().splitlines()
        print(detail[-1] if detail else "FFmpeg returned an error.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

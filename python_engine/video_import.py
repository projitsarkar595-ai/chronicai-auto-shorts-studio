import argparse
import os
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    if shutil.which("yt-dlp") is None:
        print("yt-dlp is required for authorized source imports", file=sys.stderr)
        sys.exit(2)

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    command = [
        "yt-dlp",
        "--no-playlist",
        "--no-warnings",
        "--newline",
        "--progress-template",
        "download:CHRONICAI_PROGRESS:%(progress.downloaded_bytes)s:%(progress.total_bytes)s:%(progress.total_bytes_estimate)s:%(progress.speed)s",
        "--user-agent", "Mozilla/5.0",
        "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
        "--merge-output-format", "mp4",
        "-o", args.output,
        args.url,
    ]
    completed = subprocess.run(command)
    sys.exit(completed.returncode)


if __name__ == "__main__":
    main()

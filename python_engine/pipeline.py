import argparse
import hashlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

WHISPER_MODEL_URL = (
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/"
    "5359861c739e955e79d9a303bcbc70fb988958b1/ggml-base.bin"
)
WHISPER_MODEL_SIZE = 147951465
WHISPER_MODEL_SHA256 = "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe"


def ffmpeg_available():
    return shutil.which("ffmpeg") is not None


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as model_file:
        for chunk in iter(lambda: model_file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_whisper_model(model_dir, model_name):
    if model_name != "base":
        raise RuntimeError("Only the multilingual Whisper base model is currently supported.")
    os.makedirs(model_dir, exist_ok=True)
    model_path = Path(model_dir) / "ggml-base.bin"
    if model_path.exists():
        if model_path.stat().st_size == WHISPER_MODEL_SIZE and sha256_file(model_path) == WHISPER_MODEL_SHA256:
            return str(model_path)
        model_path.unlink()

    temporary_path = model_path.with_suffix(".bin.part")
    print("Downloading the multilingual Whisper base model (about 141 MiB).", file=sys.stderr)
    digest = hashlib.sha256()
    downloaded = 0
    try:
        request = urllib.request.Request(WHISPER_MODEL_URL, headers={"User-Agent": "ChronicAI-Auto-Shorts-Studio"})
        with urllib.request.urlopen(request, timeout=120) as response, open(temporary_path, "wb") as target:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                target.write(chunk)
                digest.update(chunk)
                downloaded += len(chunk)
        if downloaded != WHISPER_MODEL_SIZE or digest.hexdigest() != WHISPER_MODEL_SHA256:
            raise RuntimeError("Downloaded Whisper model failed its size or SHA-256 integrity check.")
        os.replace(temporary_path, model_path)
        return str(model_path)
    except Exception as exc:
        if temporary_path.exists():
            temporary_path.unlink()
        raise RuntimeError(f"Could not download the Whisper model: {exc}") from exc


def duration_seconds(path):
    command = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", path
    ]
    try:
        return max(1.0, float(subprocess.check_output(command, text=True).strip()))
    except Exception:
        return 30.0


def crop_filter(settings):
    dimensions = {
        "9:16": (1080, 1920),
        "1:1": (1080, 1080),
        "16:9": (1920, 1080),
    }
    aspect = settings.get("aspectRatio", "9:16")
    width, height = dimensions.get(aspect, dimensions["9:16"])
    try:
        zoom = min(1.3, max(1.0, float(settings.get("zoom", 1.12))))
    except (TypeError, ValueError):
        zoom = 1.12
    scaled_width = round(width * zoom / 2) * 2
    scaled_height = round(height * zoom / 2) * 2
    return (
        f"scale={scaled_width}:{scaled_height}:force_original_aspect_ratio=increase,"
        f"crop={width}:{height},setsar=1"
    )


def parse_srt_time(value):
    hours, minutes, seconds = value.replace(",", ".").split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def parse_srt(path):
    if not os.path.exists(path):
        return []
    content = Path(path).read_text(encoding="utf-8-sig")
    segments = []
    for block in re.split(r"\r?\n\s*\r?\n", content.strip()):
        lines = block.splitlines()
        if len(lines) < 3 or "-->" not in lines[1]:
            continue
        start, end = [part.strip().split()[0] for part in lines[1].split("-->", 1)]
        text = html.unescape(re.sub(r"<[^>]+>", "", " ".join(lines[2:]))).strip()
        if text:
            segments.append({"start": parse_srt_time(start), "end": parse_srt_time(end), "text": text})
    return segments


def transcribe_with_whisper(input_path, output_dir, job_id, model_dir, model_name):
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", input_path],
        capture_output=True, text=True, check=True
    )
    if not probe.stdout.strip():
        return []

    filters = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True, check=True)
    if not re.search(r"\bwhisper\b", filters.stdout):
        raise RuntimeError("Installed FFmpeg does not include the whisper.cpp filter.")

    model_path = ensure_whisper_model(model_dir, model_name)
    transcript_path = Path(output_dir) / f"{job_id}_transcript.srt"
    relative_model = os.path.relpath(model_path, os.getcwd()).replace("\\", "/").replace(":", r"\:")
    relative_transcript = os.path.relpath(transcript_path, os.getcwd()).replace("\\", "/").replace(":", r"\:")
    audio_filter = (
        f"whisper=model='{relative_model}':language=auto:format=srt:"
        f"destination='{relative_transcript}':use_gpu=false"
    )
    try:
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", input_path, "-vn",
             "-af", audio_filter, "-f", "null", "-"],
            capture_output=True, text=True, check=True
        )
        return parse_srt(str(transcript_path))
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip().splitlines()
        raise RuntimeError(f"Whisper transcription failed: {detail[-1] if detail else 'FFmpeg returned an error.'}") from exc
    finally:
        if transcript_path.exists():
            transcript_path.unlink()


def format_srt_time(seconds):
    milliseconds = max(0, round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    whole_seconds, milliseconds = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{whole_seconds:02},{milliseconds:03}"


def ass_color(hex_color):
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(hex_color)):
        hex_color = "#FFFFFF"
    red, green, blue = hex_color[1:3], hex_color[3:5], hex_color[5:7]
    return f"&H00{blue}{green}{red}".upper()


def write_clip_srt(segments, clip_start, clip_length, output_path):
    rows = []
    for segment in segments:
        start = max(clip_start, float(segment["start"]))
        end = min(clip_start + clip_length, float(segment["end"]))
        if end <= start:
            continue
        text = str(segment["text"]).replace("-->", "—>").strip()
        if text:
            rows.append((start - clip_start, end - clip_start, text))
    if not rows:
        return False
    contents = []
    for index, (start, end, text) in enumerate(rows, 1):
        contents.extend([str(index), f"{format_srt_time(start)} --> {format_srt_time(end)}", text, ""])
    Path(output_path).write_text("\n".join(contents), encoding="utf-8")
    return True


def subtitle_filter(srt_path, settings):
    subtitle_path = os.path.relpath(srt_path, os.getcwd()).replace("\\", "/").replace(":", r"\:")
    font_size = min(80, max(24, int(settings.get("captionFontSize", 48))))
    position = settings.get("captionPosition", "bottom")
    alignment = {"top": 8, "middle": 5, "bottom": 2}.get(position, 2)
    color = ass_color(settings.get("captionColor", "#FFFFFF"))
    style = (
        f"FontName=Arial,FontSize={font_size},PrimaryColour={color},"
        f"OutlineColour=&H00000000,BackColour=&H80000000,Bold=1,"
        f"BorderStyle=1,Outline=3,Shadow=1,Alignment={alignment},MarginV=70"
    )
    return f",subtitles=filename='{subtitle_path}':force_style='{style}'"


def make_clip(input_path, output_path, start, length, settings, transcript_segments):
    vf = crop_filter(settings)
    subtitle_path = str(Path(output_path).with_suffix(".srt"))
    captions_enabled = settings.get("captionsEnabled", True)
    has_captions = captions_enabled and write_clip_srt(transcript_segments, start, length, subtitle_path)
    if has_captions:
        vf += subtitle_filter(subtitle_path, settings)
    command = [
        "ffmpeg", "-y", "-ss", str(start), "-i", input_path,
        "-t", str(length), "-vf", vf,
        "-af", "loudnorm=I=-16:LRA=11:TP=-1.5",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
        output_path,
    ]
    try:
        subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True, check=True)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or "").strip().splitlines()
        raise RuntimeError(f"Could not render clip: {detail[-1] if detail else 'FFmpeg returned an error.'}") from exc
    finally:
        if os.path.exists(subtitle_path):
            os.unlink(subtitle_path)


def gemini_captions(text, key):
    if not key or not text:
        return None
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + key
    prompt = (
        "Create a concise YouTube Shorts title, description, caption, and 5 hashtags "
        "from this transcript. Return JSON with title, description, caption, hashtags. "
        "Transcript: " + text[:4000]
    )
    body = json.dumps({"contents":[{"parts":[{"text":prompt}]}]}).encode()
    request = urllib.request.Request(endpoint, data=body, headers={"Content-Type":"application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            data = json.loads(response.read().decode())
            raw = data["candidates"][0]["content"]["parts"][0]["text"]
            start, end = raw.find("{"), raw.rfind("}")
            return json.loads(raw[start:end+1]) if start >= 0 and end > start else None
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--gemini-key", default="")
    parser.add_argument("--template-json", default="{}")
    parser.add_argument("--whisper-model", default="base")
    parser.add_argument("--model-dir", default="storage/models")
    args = parser.parse_args()

    try:
        template_settings = json.loads(args.template_json)
    except json.JSONDecodeError:
        template_settings = {}
    os.makedirs(args.output, exist_ok=True)
    clips = []
    total = duration_seconds(args.input)
    length = 30.0
    starts = []
    cursor = 0.0
    while cursor + 5 < total and len(starts) < 12:
        starts.append(cursor)
        cursor += length
    if not starts:
        starts = [0.0]

    if not ffmpeg_available():
        raise RuntimeError("FFmpeg is required to generate video clips.")
    transcript_segments = []
    if template_settings.get("captionsEnabled", True):
        transcript_segments = transcribe_with_whisper(
            args.input, args.output, args.job_id, args.model_dir, args.whisper_model
        )

    for index, start in enumerate(starts):
        actual = min(length, max(1.0, total - start))
        output = str(Path(args.output) / f"{args.job_id}_{index+1}.mp4")
        make_clip(args.input, output, start, actual, template_settings, transcript_segments)
        if os.path.exists(output) and os.path.getsize(output) > 0:
            transcript = " ".join(
                item["text"] for item in transcript_segments
                if item["end"] > start and item["start"] < start + actual
            )
            ai = gemini_captions(transcript, args.gemini_key)
            clips.append({
                "title": (ai or {}).get("title", f"AI Short {index+1}"),
                "description": (ai or {}).get("description", ""),
                "caption": (ai or {}).get("caption", ""),
                "hashtags": (ai or {}).get("hashtags", ["#shorts"]),
                "transcript": transcript,
                "duration": actual,
                "path": os.path.relpath(output, os.getcwd()).replace("\\", "/"),
                "templateSettings": template_settings,
            })
    print(json.dumps({"clips": clips}))


if __name__ == "__main__":
    main()

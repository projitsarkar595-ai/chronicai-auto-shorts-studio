import argparse
import json

if __package__:
    from .pipeline import transcribe_with_whisper
else:
    from pipeline import transcribe_with_whisper


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--model", default="base")
    parser.add_argument("--model-dir", default="storage/models")
    args = parser.parse_args()

    segments = transcribe_with_whisper(args.input, "storage/clips", "speech-to-text", args.model_dir, args.model)
    print(json.dumps({"text": " ".join(segment["text"] for segment in segments), "segments": segments}, ensure_ascii=False))


if __name__ == "__main__":
    main()

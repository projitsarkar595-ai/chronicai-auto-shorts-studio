# ChronicAI Auto Shorts Studio

A production-oriented AI Shorts workflow for authorized videos.

## Requirements
- Node.js 24+
- Python 3.11+ recommended
- FFmpeg and ffprobe on `PATH`
- A Google Gemini API key (optional but recommended)
- A YouTube Data API OAuth 2.0 client (optional until publishing)

## Install
```powershell
npm install
npm --prefix frontend install
python -m pip install -r requirements.txt
winget install -e --id Gyan.FFmpeg
```

Restart the terminal after installing FFmpeg so `ffmpeg` and `ffprobe` are available.

## Configure
Copy `.env.example` to `.env` and set `GEMINI_API_KEY` and YouTube OAuth values. Never commit `.env`.

## Run
```powershell
npm run dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`.

## Demo
Upload a locally owned MP4 or a licensed MP4 through **Import**. Processing is asynchronous and clips appear in **Clips**.

Templates can be edited and saved under **Templates**. Aspect ratio (9:16, 1:1, or 16:9), zoom (1.00–1.30x), and burned-in speech captions (color, size, and position) are applied to clips rendered from future imports. Choose a saved template on the **Import** page or set one as the default. These settings do not retroactively change clips that have already been rendered.

The first captioned render downloads the multilingual Whisper.cpp base model (about 141 MiB) from the MIT-licensed `ggerganov/whisper.cpp` model repository into `storage/models`; its SHA-256 is checked before use. Captions are transcribed locally by FFmpeg and are not invented when speech is unavailable. The installed FFmpeg build must include its `whisper` and `subtitles` filters.

For YouTube publishing, add a Google OAuth client ID and secret to `.env` and set its authorized redirect URI to `http://localhost:4000/api/youtube/callback`. In the app, connect your account from **YouTube**, approve a clip in **Clips**, choose its privacy (private by default), then select **Upload to YouTube**. The app does not publish clips automatically. OAuth tokens are held in memory, so reconnect after restarting the API.

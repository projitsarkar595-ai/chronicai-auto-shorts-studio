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

## Deploy with Vercel and Render

The Vercel frontend and Render API are separate services. In Vercel, set the frontend Root Directory to `frontend`, use the Vite preset, build command `npm run build`, and output directory `dist`. Set `VITE_API_URL` to the Render API's public origin, for example `https://your-service.onrender.com` (no trailing slash), then redeploy. This value is embedded at build time; a production site must not fall back to `localhost`.

The Render API must run as a persistent Node service with Python 3, `yt-dlp`, and FFmpeg available. Install Python dependencies with `python -m pip install -r requirements.txt` and start the service with `npm start`. The installed FFmpeg must include its `whisper` and `subtitles` filters for captioned renders. Set `FRONTEND_URL` to the exact Vercel site origin and set `YOUTUBE_REDIRECT_URI` to `https://<render-service>.onrender.com/api/youtube/callback`; add that exact URI to the Google OAuth client's authorized redirect URIs.

Attach persistent storage on Render and mount it at `<service working directory>/storage`. SQLite, source videos, downloaded models, and rendered clips are stored there; an ephemeral filesystem can lose them when the service restarts. The API starts Python and FFmpeg processes and therefore cannot run as a Vercel serverless function.

For phone access, open the Vercel HTTPS URL. URL imports and generated clips are downloaded by the Render API, so `VITE_API_URL` must point to that service and Render's `FRONTEND_URL` must match the Vercel origin. Local video uploads from a phone use the same API.

## Demo
Upload a locally owned MP4 or a licensed MP4 through **Import**. Processing is asynchronous and clips appear in **Clips**.

Templates can be edited and saved under **Templates**. Aspect ratio (9:16, 1:1, or 16:9), zoom (1.00–1.30x), and burned-in speech captions (color, size, and position) are applied to clips rendered from future imports. Choose a saved template on the **Import** page or set one as the default. In **Clips**, use **Edit** to re-render an existing clip with a new aspect ratio and zoom; captions already burned into that clip remain unchanged. The Import page and Clips page also provide direct download links for the source video and rendered clips.

The first captioned render downloads the multilingual Whisper.cpp base model (about 141 MiB) from the MIT-licensed `ggerganov/whisper.cpp` model repository into `storage/models`; its SHA-256 is checked before use. Captions are transcribed locally by FFmpeg and are not invented when speech is unavailable. The installed FFmpeg build must include its `whisper` and `subtitles` filters.

For YouTube publishing, add a Google OAuth client ID and secret to `.env` and set its authorized redirect URI to `http://localhost:4000/api/youtube/callback`. In the app, connect your account from **YouTube**, approve a clip in **Clips**, choose its privacy (private by default), then select **Upload to YouTube**. The app does not publish clips automatically. OAuth tokens are held in memory, so reconnect after restarting the API.

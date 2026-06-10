#!/usr/bin/env python3
"""
===============================================================
 YTMP3 Converter — Backend API (Flask)
===============================================================

Endpoints:
  GET  /api/info?url=<youtube_url>     → video metadata
  POST /api/convert                    → start conversion {url}
  GET  /api/status/<job_id>            → conversion progress
  GET  /api/download/<job_id>          → download MP3 file
  GET  /api/health                     → health check

Dependencies:
  pip install flask flask-cors yt-dlp
  apt install ffmpeg

Run:
  python api/index.py
  # or: gunicorn api.index:app -b 0.0.0.0:8000
===============================================================
"""

import os
import re
import json
import uuid
import shutil
import subprocess
import threading
from pathlib import Path
from datetime import datetime, timedelta

from flask import Flask, request, jsonify, send_file, abort
from flask_cors import CORS

# ===================== CONFIG =====================
DOWNLOAD_DIR = Path("/tmp/ytmp3_downloads")
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Max file age before auto-cleanup (minutes)
FILE_MAX_AGE = 30
# Max concurrent conversions
MAX_CONCURRENT = 3

# In-memory job store (use Redis in production)
jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()

# ===================== APP =====================
app = Flask(__name__)
CORS(app, origins="*", methods=["GET", "POST", "OPTIONS"])

# ===================== HELPERS =====================

def extract_video_id(url: str) -> str | None:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r"[?&]v=([\w-]{11})",
        r"youtu\.be/([\w-]{11})",
        r"/shorts/([\w-]{11})",
        r"/embed/([\w-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


def cleanup_old_files():
    """Remove MP3 files older than FILE_MAX_AGE minutes."""
    cutoff = datetime.now() - timedelta(minutes=FILE_MAX_AGE)
    for f in DOWNLOAD_DIR.glob("*.mp3"):
        try:
            if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
                f.unlink(missing_ok=True)
        except OSError:
            pass


def run_conversion(job_id: str, url: str):
    """Background thread: download audio and convert to MP3."""
    with jobs_lock:
        jobs[job_id]["status"] = "downloading"
        jobs[job_id]["progress"] = 10
        jobs[job_id]["message"] = "Mengunduh audio..."

    video_id = extract_video_id(url) or "unknown"
    output_path = DOWNLOAD_DIR / f"{job_id}.mp3"

    try:
        # Step 1: Download best audio with yt-dlp
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "-f", "bestaudio/best",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",       # best quality
            "-o", str(DOWNLOAD_DIR / f"{job_id}.%(ext)s"),
            "--no-warnings",
            "--quiet",
            url,
        ]

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 min max
        )

        if proc.returncode != 0:
            raise RuntimeError(f"yt-dlp failed: {proc.stderr[:500]}")

        # Find the actual output file (yt-dlp may rename)
        mp3_files = list(DOWNLOAD_DIR.glob(f"{job_id}*.mp3"))
        if not mp3_files:
            raise RuntimeError("MP3 file not found after conversion")

        actual_file = mp3_files[0]
        if actual_file.name != output_path.name:
            actual_file.rename(output_path)

        # Success
        file_size = output_path.stat().st_size
        with jobs_lock:
            jobs[job_id]["status"] = "completed"
            jobs[job_id]["progress"] = 100
            jobs[job_id]["message"] = "Selesai!"
            jobs[job_id]["file_path"] = str(output_path)
            jobs[job_id]["file_size"] = file_size

    except subprocess.TimeoutExpired:
        with jobs_lock:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["message"] = "Timeout — video terlalu lama atau koneksi lambat"
    except Exception as e:
        with jobs_lock:
            jobs[job_id]["status"] = "failed"
            jobs[job_id]["message"] = str(e)[:200]


# ===================== ROUTES =====================

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "service": "ytmp3-api", "version": "1.0.0"})


@app.route("/api/info")
def video_info():
    """Get video metadata from YouTube URL."""
    url = request.args.get("url", "").strip()
    if not url:
        return jsonify({"error": "URL parameter is required"}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    try:
        # Use yt-dlp to get metadata (fast, no download)
        cmd = [
            "yt-dlp",
            "--no-playlist",
            "--dump-json",
            "--no-download",
            "--no-warnings",
            "--quiet",
            url,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

        if proc.returncode != 0:
            return jsonify({"error": f"Failed to fetch info: {proc.stderr[:300]}"}), 500

        data = json.loads(proc.stdout.strip().split("\n")[0])

        # Format duration
        duration_sec = data.get("duration", 0)
        mins, secs = divmod(int(duration_sec), 60)
        hours, mins = divmod(mins, 60)
        if hours > 0:
            duration_str = f"{hours}:{mins:02d}:{secs:02d}"
        else:
            duration_str = f"{mins}:{secs:02d}"

        return jsonify({
            "title": data.get("title", "Unknown"),
            "thumbnail": f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg",
            "duration": duration_str,
            "videoId": video_id,
            "uploader": data.get("uploader", ""),
        })

    except subprocess.TimeoutExpired:
        return jsonify({"error": "Timeout fetching video info"}), 504
    except Exception as e:
        return jsonify({"error": str(e)[:200]}), 500


@app.route("/api/convert", methods=["POST"])
def convert():
    """Start a new conversion job."""
    body = request.get_json(silent=True) or {}
    url = body.get("url", "").strip()

    if not url:
        return jsonify({"error": "URL is required"}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    # Check concurrent limit
    with jobs_lock:
        active = sum(1 for j in jobs.values() if j["status"] in ("downloading", "converting"))
        if active >= MAX_CONCURRENT:
            return jsonify({"error": "Server busy, please try again in a moment"}), 429

    # Create job
    job_id = str(uuid.uuid4())[:12]
    with jobs_lock:
        jobs[job_id] = {
            "id": job_id,
            "status": "queued",
            "progress": 0,
            "message": "Menunggu antrian...",
            "url": url,
            "created_at": datetime.now().isoformat(),
        }

    # Start background conversion
    thread = threading.Thread(target=run_conversion, args=(job_id, url), daemon=True)
    thread.start()

    return jsonify({"jobId": job_id})


@app.route("/api/status/<job_id>")
def job_status(job_id):
    """Get conversion job status."""
    with jobs_lock:
        job = jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404

    return jsonify({
        "status": job["status"],
        "progress": job["progress"],
        "message": job["message"],
    })


@app.route("/api/download/<job_id>")
def download(job_id):
    """Download the converted MP3 file."""
    with jobs_lock:
        job = jobs.get(job_id)

    if not job:
        abort(404, "Job not found")

    if job["status"] != "completed":
        abort(400, f"Conversion not complete (status: {job['status']})")

    file_path = Path(job.get("file_path", ""))
    if not file_path.exists():
        abort(404, "File not found or expired")

    # Clean up file after sending (one-time download)
    def cleanup():
        try:
            file_path.unlink(missing_ok=True)
            with jobs_lock:
                jobs.pop(job_id, None)
        except OSError:
            pass

    response = send_file(
        file_path,
        mimetype="audio/mpeg",
        as_attachment=True,
        download_name=f"{job.get('title', 'audio')}.mp3",
    )
    # Schedule cleanup after response
    @response.call_on_close
    def _cleanup():
        cleanup()

    return response


# ===================== MAIN =====================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    app.run(host="0.0.0.0", port=port, debug=debug)

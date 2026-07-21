"""
Local speech-to-text with faster-whisper, exposing the same contract as
OpenAI's /v1/audio/transcriptions so the agent code needs no special case.
"""

import os
import tempfile

from fastapi import FastAPI, File, Form, UploadFile
from faster_whisper import WhisperModel

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE", "int8")
DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "pt")

app = FastAPI(title="clever-agents whisper")

# Loaded once at startup; the weights are cached in a volume.
whisper = WhisperModel(
    MODEL_SIZE,
    device=DEVICE,
    compute_type=COMPUTE_TYPE,
    download_root="/models",
)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_SIZE, "compute": COMPUTE_TYPE}


@app.post("/v1/audio/transcriptions")
async def transcriptions(
    file: UploadFile = File(...),
    model: str = Form(default=""),
    language: str = Form(default=""),
    response_format: str = Form(default="json"),
):
    """Accepts the OpenAI multipart shape and returns {"text": ...}."""
    suffix = os.path.splitext(file.filename or "audio.ogg")[1] or ".ogg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        path = tmp.name

    try:
        segments, _info = whisper.transcribe(
            path,
            language=language or DEFAULT_LANGUAGE,
            vad_filter=True,
            beam_size=1,
        )
        text = "".join(segment.text for segment in segments).strip()
    finally:
        os.unlink(path)

    if response_format == "text":
        return text
    return {"text": text}

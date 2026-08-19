from fastapi import FastAPI, File, HTTPException, UploadFile
from faster_whisper import WhisperModel
import os
import tempfile

# Small CPU ASR sidecar for note voice messages. The model downloads on
# first request and is cached in a named volume.
app = FastAPI()
model = WhisperModel(os.environ.get("WHISPER_MODEL", "small"), device="cpu", compute_type="int8")


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename or "audio.wav")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        path = tmp.name
    try:
        segments, info = model.transcribe(path, beam_size=1)
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return {"text": text, "language": info.language}
    except Exception as error:  # noqa: BLE001 — surface as 422, never crash the sidecar
        raise HTTPException(status_code=422, detail=str(error)) from error
    finally:
        os.unlink(path)


@app.get("/health")
async def health():
    return {"status": "ok"}

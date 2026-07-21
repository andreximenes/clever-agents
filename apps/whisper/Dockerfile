FROM python:3.11-slim

WORKDIR /srv

# faster-whisper decodes audio through PyAV, so no system ffmpeg is needed.
# requests/huggingface_hub are pulled in explicitly: faster-whisper imports
# them to fetch the weights, but doesn't always resolve them on its own.
RUN pip install --no-cache-dir \
      faster-whisper==1.1.0 \
      requests \
      huggingface_hub \
      "fastapi==0.115.6" \
      "uvicorn[standard]==0.34.0" \
      python-multipart==0.0.20

COPY app.py .

# Model weights live in a volume so restarts don't re-download them.
ENV WHISPER_MODEL=small \
    WHISPER_COMPUTE=int8 \
    OMP_NUM_THREADS=4

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]

# Server image for Zeabur (transcribe proxy + Stripe/RevenueCat webhooks + subtitle render)
# Includes FFmpeg (built with libass) and Noto CJK fonts so Chinese subtitles
# burn correctly instead of showing as tofu boxes.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      fonts-noto-cjk \
      fonts-noto-color-emoji \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .

ENV PORT=3001
EXPOSE 3001
CMD ["node", "index.js"]

# --- For animated subtitles (HyperFrames / Karaoke) additionally install Chromium ---
# Uncomment and use a bigger instance (≥1GB RAM):
#   RUN apt-get update && apt-get install -y --no-install-recommends chromium \
#     && rm -rf /var/lib/apt/lists/*
#   ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium  ENABLE_HYPERFRAMES=true

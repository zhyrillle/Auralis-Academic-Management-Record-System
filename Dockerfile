# Root Dockerfile for Auralis Backend
FROM node:20-bookworm-slim

# Install Chromium and system dependencies for PDF generation and model downloads
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production
ENV PORT=5000

WORKDIR /app

# Copy backend dependencies first for Docker layer caching
COPY backend/package*.json ./
RUN npm install --omit=dev --ignore-scripts

# Copy backend source code
COPY backend/ .

# Run model setup to install Python 3.14.3 and ML dependencies via uv
RUN npm run model:setup

EXPOSE 5000

CMD ["node", "server.js"]

# Auralis Academic Management Record System: Deployment Guide

This guide walks you through deploying **Auralis** to production using **Render** (Backend Docker service), **Vercel** (Frontend React SPA), and **Aiven Cloud MySQL** (Managed Database).

---

## Architecture Summary

| Component | Target Platform | Environment | Configuration Files |
| :--- | :--- | :--- | :--- |
| **Backend API** | [Render](https://render.com) | Docker (Node 20 + Python 3.14 + Chromium) | `backend/Dockerfile`, `render.yaml` |
| **Frontend UI** | [Vercel](https://vercel.com) | Static Edge CDN (Vite React 19) | `frontend/vercel.json` |
| **Database** | [Aiven](https://aiven.io) | Managed MySQL 8.x Cloud Cluster | Remote Aiven Connection URI |
| **File Storage** | [Cloudinary](https://cloudinary.com) | Cloud Storage | `CLOUDINARY_*` API keys |
| **Email Dispatch** | Gmail / SMTP | Nodemailer Transport | `EMAIL_*` App Credentials |

---

## Phase 1: Push Repository to GitHub

Ensure all your latest files (including the newly created deployment configs) are committed and pushed to your GitHub repository:

```bash
git add .
git commit -m "feat: configure production deployment for Vercel and Render"
git push origin main
```

---

## Phase 2: Deploy Backend on Render

Render will build and run the backend Docker container (which includes Node.js, Python 3.14.3 with machine learning dependencies, and Headless Chromium for SF9/SF10 PDF generation).

### Option A: Using the Render Blueprint (Recommended - 1 Click)

1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub repository: `Auralis-Academic-Management-Record-System`.
4. Render will automatically detect the `render.yaml` file in the repository root.
5. Provide the required environment variables when prompted (see table below).
6. Click **Apply**. Render will automatically build the Docker container and start your service.

### Option B: Manual Web Service Setup

If you prefer to configure the Web Service manually:

1. In the Render Dashboard, click **New +** > **Web Service**.
2. Connect your GitHub repository.
3. Configure the following fields:
   - **Name**: `auralis-backend` (or your preferred name)
   - **Region**: Choose the closest region to your users (e.g., *Singapore*).
   - **Language / Runtime**: **Docker**
   - **Docker Context**: `backend` (or leave as `.` if using root Dockerfile)
   - **Dockerfile Path**: `backend/Dockerfile` (or `Dockerfile` if using root)
   - **Instance Type**: **Free** (or Starter)
   - **Health Check Path**: `/api/health`
4. Under **Environment Variables**, click **Add Environment Variable** and enter the following:

| Variable | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production mode |
| `PORT` | `5000` | Port for Express API |
| `DATABASE_URL` | `mysql://avnadmin:<YOUR_AIVEN_PASSWORD>@mysql-3ee9c17d-auralis.i.aivencloud.com:27935/defaultdb` | Aiven Cloud MySQL URI (copy from your local `backend/.env`) |
| `DB_SSL` | `true` | Required for secure cloud connection |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | System Chromium for PDF generation |
| `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` | `true` | Prevents redundant download |
| `CLOUDINARY_CLOUD_NAME` | `hoxggpc3` | Cloudinary Cloud Name (from your `backend/.env`) |
| `CLOUDINARY_API_KEY` | `<YOUR_CLOUDINARY_API_KEY>` | Cloudinary API Key (from your `backend/.env`) |
| `CLOUDINARY_API_SECRET` | `<YOUR_CLOUDINARY_API_SECRET>` | Cloudinary API Secret (from your `backend/.env`) |
| `CLOUDINARY_URL` | `cloudinary://<API_KEY>:<API_SECRET>@hoxggpc3` | Full Cloudinary URL (from your `backend/.env`) |
| `EMAIL_USER` | `thirdtdump3@gmail.com` | Email user account (from your `backend/.env`) |
| `EMAIL_PASS` | `<YOUR_EMAIL_APP_PASSWORD>` | Gmail App Password (from your `backend/.env`) |
| `EMAIL_FROM` | `Auralis System <thirdtdump3@gmail.com>` | Sender display header |

5. Click **Create Web Service**.
6. Wait for the build to finish. Once live, copy your Render URL:
   `https://auralis-backend.onrender.com` (your exact subdomain may vary).

---

## Phase 3: Verify Backend Health

Before setting up the frontend, test your backend URL in your browser or with curl:

1. **Root Status Check**:
   Open: `https://<your-render-service>.onrender.com/`
   Expected response:
   ```json
   { "status": "Backend API is running" }
   ```

2. **Database & API Health Check**:
   Open: `https://<your-render-service>.onrender.com/api/health`
   Expected response:
   ```json
   {
     "status": "healthy",
     "database": "connected",
     "timestamp": "2026-10-29T...",
     "uptime": 12.34
   }
   ```

---

## Phase 4: Deploy Frontend on Vercel

1. Log in to [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** > **Project**.
3. Import your GitHub repository: `Auralis-Academic-Management-Record-System`.
4. In the **Configure Project** screen:
   - **Framework Preset**: **Vite**
   - **Root Directory**: Click **Edit** and select `frontend`.
   - **Build and Output Settings**:
     - Build Command: `npm run build` (default)
     - Output Directory: `dist` (default)
     - Install Command: `npm install` (default)
5. Under **Environment Variables**, add:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: `https://<your-render-service>.onrender.com/api` (Make sure to include `/api` at the end and no trailing slash)
6. Click **Deploy**.
7. Vercel will install dependencies, compile the production bundle, and deploy the application to a free `*.vercel.app` domain.

---

## Phase 5: End-to-End Post-Deployment Verification

Verify each core feature in the deployed application:

1. **SPA Routing & Page Reloads**:
   - Access `https://<your-app>.vercel.app/login`.
   - Refresh the page (F5). It should load smoothly without a 404 error (handled by `frontend/vercel.json`).
2. **User Authentication**:
   - Log in with any system account (e.g. System Admin, Principal, Teacher, or Adviser).
   - Ensure the user dashboard loads and navigation items display correctly.
3. **Class Record & Grading**:
   - Navigate to **Class Record** and inspect grade sheets.
   - Verify that grades, scores, and transmutations load properly.
4. **Official DepEd SF9 / SF10 PDF Generation**:
   - Click **Download SF9 PDF** or **Print Grading Sheet**.
   - Ensure the server-side Chromium instance generates and returns the vector PDF document.
5. **English Next-Term At-Risk Prediction**:
   - Log in as **Principal**.
   - Navigate to **At-Risk Prediction**.
   - Select a target term. Ensure the prediction worker executes and displays the risk bands (Low, Moderate, High).
6. **Offline Sync & Dexie Caching**:
   - Toggle network offline in DevTools, enter attendance marks, and go back online.
   - Verify the sync indicator synchronizes the pending changes to the cloud database.

---

## Important Maintenance Notes

### Render Free Tier Spin-Down (Cold Starts)
- On the Render Free tier, instances spin down after 15 minutes of inactivity.
- When an incoming request arrives after sleep, Render will take **30 to 50 seconds** to wake up.
- **Tip**: If you need zero cold-start delay for high-availability demonstrations or capstone defenses, you can upgrade the Render service to the **Starter Plan ($7/month)** or set up a free uptime monitor (such as [UptimeRobot](https://uptimerobot.com) pinging `https://<your-render-service>.onrender.com/api/health` every 10 minutes).

### Database Data Persistence
- Your production database is hosted on **Aiven Cloud MySQL**, which is permanent and independent of Render container restarts.
- If you ever need to backup or sync data locally:
  - Pull cloud data to local: `npm run db:pull-aiven`
  - Push local changes to cloud: `npm run db:push-aiven`

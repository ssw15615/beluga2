# Deployment Guide

## Overview
- **Frontend**: Deploy to Vercel (React/Vite app)
- **Backend**: Deploy to Railway (Node.js Express server)

---

## 🚀 Deploy Backend to Railway

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Deploy Server
1. Click **"New Project"** → **"Deploy from GitHub repo"**
2. Select your `beluga2` repository
3. Railway will auto-detect the Node.js app

### Step 3: Configure Root Directory
1. In your project settings, go to **Settings**
2. Set **Root Directory** to: `server`
3. Railway will now use `server/package.json`

### Step 4: Add Environment Variables
1. Go to your project → **Variables** tab
2. Add these environment variables:
   ```
   FR24_API_KEY=019b9077-3179-71c5-a92f-b1879c84889b|TMlN9GK6WOMVo4nBWcR6BBBQRNwMvFzUycKuynx561cf2b00
   PORT=4000
   ```

### Step 5: Generate Domain
1. Go to **Settings** → **Networking**
2. Click **Generate Domain**
3. Copy your Railway URL (e.g., `https://your-app.railway.app`)

### Step 6: Update Procfile (if needed)
Railway should auto-detect, but you already have a `Procfile`:
```
web: node index.js
```

---

## 🌐 Deploy Frontend to Vercel

### Step 1: Create Vercel Account
1. Go to [vercel.com](https://vercel.com)
2. Sign up with GitHub

### Step 2: Import Project
1. Click **"Add New..."** → **"Project"**
2. Import your `beluga2` GitHub repository
3. Vercel will auto-detect it as a Vite project

### Step 3: Configure Build Settings
Vercel should auto-configure, but verify:
- **Framework Preset**: Vite
- **Root Directory**: `./` (leave empty or use root)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### Step 4: Add Environment Variables
1. In project settings → **Environment Variables**
2. Add these variables:
   ```
   VITE_API_URL=https://your-railway-app.railway.app
   VITE_FR24_API_KEY=019b9077-3179-71c5-a92f-b1879c84889b|TMlN9GK6WOMVo4nBWcR6BBBQRNwMvFzUycKuynx561cf2b00
   VITE_VAPID_PUBLIC_KEY=BJX_2b3pWrz3uVgCMpAAbQHIli26GBIpP8ZokX_2aFWbpCe1eDVVbFmqq7CYif9dDRvMfwXNzqW3czJESi0b0rw
   ```
   ⚠️ Replace `VITE_API_URL` with your actual Railway URL from Step 5 above

### Step 5: Deploy
1. Click **Deploy**
2. Wait for build to complete
3. Your app will be live at `https://your-project.vercel.app`

---

## 🔄 Automatic Deployments

### Railway (Backend)
- Every push to `main` branch automatically deploys to Railway
- Railway rebuilds and restarts the server

### Vercel (Frontend)
- Every push to `main` branch automatically deploys to Vercel
- Preview deployments for pull requests

---

## 🔒 Security Notes

1. **Never commit `.env` files** - they're in `.gitignore`
2. **Use environment variables** on both platforms
3. **Rotate API keys** if they were committed to git history
4. Consider using Railway's **Private Networking** for better security

---

## 📝 Post-Deployment Checklist

- [ ] Backend deployed to Railway with environment variables
- [ ] Frontend deployed to Vercel with Railway URL
- [ ] Test live site - can you see plane data?
- [ ] Check browser console for errors
- [ ] Test API toggle (FR24 ↔ ADSBX)
- [ ] Verify push notifications work (if enabled)

---

## 🐛 Troubleshooting

### Frontend can't connect to backend
- Check `VITE_API_URL` in Vercel points to Railway URL
- Verify Railway server is running (check logs)
- Check CORS settings in `server/index.js`

### "402 Payment Required" error
- FR24 API key may be invalid or rate-limited
- Try switching to ADSBX using the toggle

### Railway build fails
- Check Root Directory is set to `server`
- Verify `package.json` exists in server folder
- Check Railway build logs for errors

### Vercel build fails
- Check environment variables are set correctly
- Verify `package.json` scripts are correct
- Review Vercel build logs

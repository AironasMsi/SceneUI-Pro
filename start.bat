@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo =======================================================
echo 🎬 SCENE UI PRO - STARTUP (WINDOWS DESKTOP)
echo =======================================================

echo ⏳ [1/2] Verifying Python runtime environment...
pip install -q fastapi uvicorn aiohttp websockets python-multipart jinja2 python-dotenv pydub opencv-python moviepy pillow faster-whisper google-genai

echo 📁 [2/2] Checking workspace directories...
if not exist "frontend\base" mkdir "frontend\base"
if not exist "data\vault" mkdir "data\vault"
if not exist "data\audio" mkdir "data\audio"
if not exist "data\voices" mkdir "data\voices"
if not exist "data\renders" mkdir "data\renders"
if not exist "data\projects" mkdir "data\projects"

echo =======================================================
echo ✅ SYSTEM READY! Launching server and dynamic browser port...
echo =======================================================

python server.py

pause

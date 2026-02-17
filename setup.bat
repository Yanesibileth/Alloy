@echo off
setlocal
echo ============================================
echo  Scout - AI Minecraft Companion  Setup
echo ============================================
echo.

:: ---------- Node.js ----------
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo         Install v18 or higher from https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo [OK] Node.js %%v

echo.
echo Installing dependencies...
cd backend
npm install
if errorlevel 1 ( echo [ERROR] npm install failed. & pause & exit /b 1 )

:: Create .env from example if it doesn't exist
if not exist .env (
    copy .env.example .env >nul
    echo [OK] Created backend\.env
    echo      Edit it to set your Minecraft server address and optional API key.
) else (
    echo [OK] backend\.env already exists
)
cd ..

echo.
echo ============================================
echo  Setup complete!
echo ============================================
echo.
echo HOW TO USE:
echo.
echo  1. Start a Minecraft Java Edition server (or open a world to LAN).
echo     Default expected address: localhost:25565
echo     If different, edit backend\.env and set MC_HOST / MC_PORT.
echo.
echo  2. Start Scout:
echo       cd backend
echo       node server.js
echo.
echo  3. Alex will join the game automatically and start following your child.
echo     Alex mines ores, fights mobs, and responds to chat.
echo.
echo  4. Open the parent dashboard at:
echo       http://localhost:3000
echo.
echo  5. To enable full Claude AI responses, add your API key to backend\.env:
echo       ANTHROPIC_API_KEY=sk-ant-...
echo     Get a key at: https://console.anthropic.com
echo     Without a key, Alex uses built-in fallback responses.
echo.
pause

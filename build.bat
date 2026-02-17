@echo off
setlocal
echo ============================================
echo  Scout - Build Electron Installer
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

:: ---------- Backend deps ----------
echo.
echo [1/3] Installing backend dependencies...
cd backend
npm install --omit=dev
if errorlevel 1 ( echo [ERROR] Backend npm install failed. & pause & exit /b 1 )
cd ..
echo [OK] Backend dependencies installed.

:: ---------- Electron deps ----------
echo.
echo [2/3] Installing Electron and builder...
npm install
if errorlevel 1 ( echo [ERROR] Root npm install failed. & pause & exit /b 1 )
echo [OK] Electron dependencies installed.

:: ---------- Build ----------
echo.
echo [3/3] Building installer (this takes a few minutes)...
npx electron-builder --win --x64
if errorlevel 1 ( echo [ERROR] Build failed. & pause & exit /b 1 )

echo.
echo ============================================
echo  Build complete!
echo ============================================
echo.
echo  Installer: dist\Scout-Setup.exe
echo.
echo  Share that single file with parents.
echo  Double-click to install and run Scout.
echo.
pause

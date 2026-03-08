@echo off
cd /d "%~dp0Frontend"
echo Starting Apples Paint Server...
start http://localhost:3000
npm run dev

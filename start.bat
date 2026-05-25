@echo off
if not exist ".env" (
  echo Error: .env file not found.
  echo Please copy .env.example to .env and set your ANTHROPIC_API_KEY.
  pause
  exit /b 1
)

echo Installing dependencies...
call npm install

echo Building...
call npm run build

echo Starting server...
call npm start

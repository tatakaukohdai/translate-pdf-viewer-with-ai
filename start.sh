#!/usr/bin/env bash
set -e

if [ ! -f ".env" ]; then
  echo "Error: .env file not found."
  echo "Please copy .env.example to .env and set your ANTHROPIC_API_KEY."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Starting server..."
npm start

#!/bin/bash
# Starts every service whose runtime is installed, then the TypeScript gateway (needs Node 18+; no npm install required).
cd "$(dirname "$0")"
command -v python3 >/dev/null && (python3 python-forecast/app.py &) || echo "skip Python (TS fallback used)"
command -v javac   >/dev/null && (cd java-risk && javac Risk.java && java Risk &) || echo "skip Java (TS fallback used)"
command -v go      >/dev/null && (cd go-alert && go run main.go &) || echo "skip Go (TS fallback used)"
command -v php     >/dev/null && (cd php-intake && php -S 127.0.0.1:8004 router.php >/dev/null 2>&1 &) || echo "skip PHP (TS fallback used)"
command -v dotnet  >/dev/null && (cd csharp-graph && dotnet run &) || echo "skip C# (TS fallback used)"
sleep 3; node dist/gateway/server.js

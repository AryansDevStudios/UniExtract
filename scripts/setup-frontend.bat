@echo off
echo ==> Setting up Universal Media Extractor Frontend...
call npm install --prefix client
call npm run build --prefix client
echo ==> Frontend built to client/dist.

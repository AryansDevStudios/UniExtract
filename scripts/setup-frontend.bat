@echo off
echo ==> Setting up Uni Extract Frontend...
call npm install --prefix client
call npm run build --prefix client
echo ==> Frontend built to client/dist.

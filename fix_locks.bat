@echo off
cd electron\src\renderer
del package-lock.json
npm install --package-lock-only
cd ..\..
cd electron
del package-lock.json
npm install --package-lock-only
cd ..
del package-lock.json
npm install --package-lock-only

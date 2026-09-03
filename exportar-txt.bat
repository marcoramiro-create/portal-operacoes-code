@echo off
title Exportar arquivos para TXT
cd /d "%~dp0"
echo Exportando arquivos .ts/.tsx para a pasta _txt-export ...
node "%~dp0_export-txt.mjs"
echo.
echo Pronto! Veja a pasta _txt-export.
pause
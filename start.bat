@echo off
chcp 65001 >nul
title Live2D Web Viewer
echo Starting Live2D Web Viewer...
python serve.py %*
pause

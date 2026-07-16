@echo off
echo.
echo  =================================================================
echo    AniSmooth GPU Detection Test - Standalone
echo  =================================================================
echo.
echo  This will detect your GPU vendor and specs.
echo  Send a screenshot or copy-paste the output.
echo.
pause
cls
python "%~dp0gpu_detect.py"
echo.
echo  --- End of report ---
pause

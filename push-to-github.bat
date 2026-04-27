@echo off
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

set "REPO_URL=https://github.com/wms365com-dev/purefishingsftp.git"
set "TARGET_BRANCH=main"
set "DEFAULT_MESSAGE=Update project files"
set "COMMIT_MESSAGE="
set "FORCE_UPDATE=0"
set "FORCE_PUSH=0"

for %%A in (%*) do (
  call :parse_arg "%%~A"
)

if not defined COMMIT_MESSAGE set "COMMIT_MESSAGE=%DEFAULT_MESSAGE%"

set "GIT_EXE="

for %%G in (
  "git"
  "C:\Program Files\Git\cmd\git.exe"
  "C:\Program Files\Git\bin\git.exe"
  "C:\Program Files (x86)\Git\cmd\git.exe"
  "C:\Program Files (x86)\Git\bin\git.exe"
  "%LocalAppData%\Programs\Git\cmd\git.exe"
  "%LocalAppData%\Programs\Git\bin\git.exe"
) do (
  if not defined GIT_EXE (
    call :try_git %%~G
  )
)

if not defined GIT_EXE (
  echo Could not find Git. Please install Git for Windows first:
  echo https://git-scm.com/download/win
  pause
  exit /b 1
)

echo Using Git: "%GIT_EXE%"
if "%FORCE_UPDATE%"=="1" echo Force update mode is ON. An empty commit will be created if needed.
if "%FORCE_PUSH%"=="1" echo Force push mode is ON. The remote branch will be updated with --force-with-lease.

"%GIT_EXE%" config --global user.name >nul 2>&1
if errorlevel 1 (
  echo Git user.name is not set.
  echo Run these commands first, then run this file again:
  echo   "%GIT_EXE%" config --global user.name "Your Name"
  echo   "%GIT_EXE%" config --global user.email "you@example.com"
  pause
  exit /b 1
)

"%GIT_EXE%" config --global user.email >nul 2>&1
if errorlevel 1 (
  echo Git user.email is not set.
  echo Run these commands first, then run this file again:
  echo   "%GIT_EXE%" config --global user.name "Your Name"
  echo   "%GIT_EXE%" config --global user.email "you@example.com"
  pause
  exit /b 1
)

if not exist ".git" (
  echo Initializing new git repository...
  "%GIT_EXE%" init
  if errorlevel 1 goto :git_failed
)

echo Setting branch to %TARGET_BRANCH%...
"%GIT_EXE%" branch -M %TARGET_BRANCH%
if errorlevel 1 goto :git_failed

echo Configuring origin remote...
"%GIT_EXE%" remote get-url origin >nul 2>&1
if errorlevel 1 (
  "%GIT_EXE%" remote add origin "%REPO_URL%"
) else (
  "%GIT_EXE%" remote set-url origin "%REPO_URL%"
)
if errorlevel 1 goto :git_failed

echo Staging files...
"%GIT_EXE%" add .
if errorlevel 1 goto :git_failed

set "HAS_CHANGES="
for /f %%A in ('"%GIT_EXE%" status --porcelain') do (
  set "HAS_CHANGES=1"
  goto :changes_found
)

:changes_found
if not defined HAS_CHANGES (
  echo No changes to commit.
  if "%FORCE_UPDATE%"=="1" (
    echo Creating empty commit to force a new GitHub update...
    "%GIT_EXE%" commit --allow-empty -m "%COMMIT_MESSAGE%"
    if errorlevel 1 goto :git_failed
    goto :push_changes
  )
  echo Attempting push anyway...
  goto :push_changes
)

echo Creating commit...
"%GIT_EXE%" commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 goto :git_failed

:push_changes
echo Pushing to %REPO_URL% on branch %TARGET_BRANCH%...
if "%FORCE_PUSH%"=="1" (
  "%GIT_EXE%" push -u origin %TARGET_BRANCH% --force-with-lease
) else (
  "%GIT_EXE%" push -u origin %TARGET_BRANCH%
)
if errorlevel 1 goto :git_failed

echo.
echo Push complete.
pause
exit /b 0

:try_git
set "CANDIDATE=%~1"
if /I "%CANDIDATE%"=="git" (
  where git >nul 2>&1
  if not errorlevel 1 set "GIT_EXE=git"
  goto :eof
)

if exist "%CANDIDATE%" set "GIT_EXE=%CANDIDATE%"
goto :eof

:parse_arg
set "ARG=%~1"
if /I "%ARG%"=="/forceupdate" (
  set "FORCE_UPDATE=1"
  goto :eof
)
if /I "%ARG%"=="--force-update" (
  set "FORCE_UPDATE=1"
  goto :eof
)
if /I "%ARG%"=="/forcepush" (
  set "FORCE_PUSH=1"
  goto :eof
)
if /I "%ARG%"=="--force-push" (
  set "FORCE_PUSH=1"
  goto :eof
)
if defined COMMIT_MESSAGE (
  set "COMMIT_MESSAGE=%COMMIT_MESSAGE% %ARG%"
) else (
  set "COMMIT_MESSAGE=%ARG%"
)
goto :eof

:git_failed
echo.
echo Git command failed. Review the error above.
echo If GitHub asks you to sign in, complete the sign-in and run this file again if needed.
pause
exit /b 1

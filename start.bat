@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo ============================================
echo   InvAcc — запуск проекта
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ОШИБКА] Node.js не найден.
    echo Установите Node.js LTS: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
    echo [ОШИБКА] pnpm не найден.
    echo Установите его командой: npm install -g pnpm
    echo.
    pause
    exit /b 1
)

if not exist "%ROOT%node_modules" (
    echo [1/3] Зависимости не установлены. Устанавливаю: pnpm install
    echo.
    call pnpm install
    if errorlevel 1 (
        echo.
        echo [ОШИБКА] Не удалось установить зависимости.
        pause
        exit /b 1
    )
)

if not exist "%ROOT%.env.local" (
    if exist "%ROOT%.env.example" (
        copy "%ROOT%.env.example" "%ROOT%.env.local" >nul
        echo [2/3] Создан файл .env.local из .env.example
        echo        ^>^> ВАЖНО: откройте его и заполните FINAM_API_SECRET ^(токен Финама^).
    ) else (
        echo [2/3] Файл .env.example не найден. Пропускаю настройку окружения.
    )
) else (
    echo [2/3] Файл .env.local найден — ок.
)

echo.
echo --- Проверка порта 3000 ---
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do (
    echo     Порт 3000 занят процессом PID %%P. Завершаю его...
    taskkill /PID %%P /F >nul 2>nul
)
echo.
echo [3/3] Запуск dev-сервера...
echo       Адрес: http://localhost:3000
echo       Для остановки нажмите Ctrl+C
echo.

start "" /min cmd /c "timeout /t 8 /nobreak >nul & start http://localhost:3000"
call pnpm run dev

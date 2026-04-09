# 🏛️ CiviCORE - Civic Document Management System

<p align="center">
  <img src="https://img.shields.io/badge/Laravel-12.0-red?style=for-the-badge&logo=laravel" alt="Laravel Version">
  <img src="https://img.shields.io/badge/PHP-8.2+-purple?style=for-the-badge&logo=php" alt="PHP Version">
  <img src="https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react" alt="React Version">
  <img src="https://img.shields.io/badge/Python-3.10+-yellow?style=for-the-badge&logo=python" alt="Python Version">
  <img src="https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=for-the-badge&logo=tailwind-css" alt="Tailwind Version">
</p>

CiviCORE is a premium, high-performance document management system designed for Local Government Units (LGUs). It features **AI-powered Intelligent OCR** for automated data extraction from Birth, Marriage, and Death certificates, and an **Interactive Document Scanner** with live edge tracing.

---

## 📋 System Requirements

Before you begin, ensure your local environment meets the following specifications:

### 1. Servers & Languages
- **PHP 8.2 or higher**: Required for Laravel 12 backend logic.
- **Node.js 18.x or higher**: Required for the React/Vite frontend.
- **Python 3.10 or higher**: Required for the EasyOCR engine.
- **MySQL 8.x or MariaDB**: Required for database management.

### 2. Recommended Environment (Windows)
- **Laragon Full**: Highly recommended as it provides Apache/Nginx, PHP, and MySQL in a pre-configured stack.

---

## 📥 Comprehensive Installation Guide

Follow these steps carefully to get the system running on your device.

### Step 1: Clone the Repository
Open your terminal or command prompt and run:
```bash
git clone https://github.com/louieramilo0101/civicorelaravel2.git
cd civicore_laravel
```

### Step 2: Install Dependencies
You must install both backend and frontend dependencies:

1. **PHP (Backend)**:
   ```bash
   composer install
   ```
2. **Node.js (Frontend)**:
   ```bash
   npm install
   ```

### Step 3: Configure Environment Variables
1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```
2. Generate the unique Application Key:
   ```bash
   php artisan key:generate
   ```
3. Open `.env` in your code editor and update the database details:
   ```env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306      # Update to 3307 if using Laragon default
   DB_DATABASE=civicore_laravel
   DB_USERNAME=root
   DB_PASSWORD=      # Leave blank if no password is set
   ```

### Step 4: Import the Database ⚠️ **CRITICAL**
The system requires a specific data structure and sample records.
1. Create a new database named `civicore_laravel` in your MySQL manager (e.g., HeidiSQL, phpMyAdmin).
2. Import the provided SQL dump:
   - **File**: `civicore-export-4-9-2026.sql`
   - Use the **Import** feature in your database tool to execute this file.

### Step 5: Python OCR Engine Setup
CiviCORE uses a specialized Python server for document scanning.
1. Ensure Python is added to your system's PATH.
2. Install the required Python packages:
   ```bash
   pip install flask flask-cors easyocr Pillow
   ```
   *Note: On the first run, the OCR engine will download about 150MB of machine learning models. Ensure you have an internet connection.*

### Step 6: File Storage
Create a symbolic link for the storage folder (for uploaded documents):
```bash
php artisan storage:link
```

---

## 🚀 Running the Application

For convenience, a **One-Click Launcher** has been provided.

1. Locate the `start-civicore.bat` file in the root directory.
2. **Double-click it**. This will automatically launch:
   - **Laravel Server** (Port 8000)
   - **Vite Dev Server** (Frontend)
   - **Persistent OCR Server** (Port 5000)
   - **Queue Worker** (For background processing)

**Wait for all windows to say "Ready"**, then visit:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🛠️ Troubleshooting

- **OCR not working?**: Ensure `python` command is recognized in your terminal. If you use `python3`, rename the command in `start-civicore.bat`.
- **Database Connection Error**: Double check the `DB_PORT` in your `.env`. If using Laragon, it is often `3306` or `3307`.
- **White Screen on Launch**: Run `npm run build` once if `npm run dev` doesn't resolve the CSS immediately.

---

## 📂 Project Highlights
- **`app/`**: Laravel core logic and API.
- **`resources/js/components/`**: React 19 Frontend components.
- **`ocr_server.py`**: The Python Flask server that handles AI vision.
- **`civicore-export-4-9-2026.sql`**: The production-ready database dump.

---

## License
Developed by Team CiviCORE. [MIT License](https://opensource.org/licenses/MIT).

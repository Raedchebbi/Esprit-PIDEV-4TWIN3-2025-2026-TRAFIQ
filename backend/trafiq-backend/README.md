# 🚦 TRAFIQ Backend

**Traffic Intelligence Quotient** — AI-powered traffic monitoring platform.  
REST API built with **NestJS 10**, **MongoDB** (Mongoose 7), and **JWT** authentication.

---

## 📋 Table of Contents

- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Database Seeding](#-database-seeding)
- [Running the Server](#-running-the-server)
- [API Documentation (Swagger)](#-api-documentation-swagger)
- [Authentication Flow](#-authentication-flow)
- [API Endpoints](#-api-endpoints)
- [Roles & Permissions](#-roles--permissions)
- [Running Tests](#-running-tests)
- [Default Seed Users](#-default-seed-users)

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| Database | MongoDB 4.0 (Mongoose 7) |
| Authentication | JWT + Passport.js |
| Password Hashing | bcryptjs |
| Email | @nestjs-modules/mailer + Nodemailer |
| Validation | class-validator + class-transformer |
| API Docs | Swagger (@nestjs/swagger 7) |
| Testing | Jest 29 + ts-jest |

---

## 📁 Project Structure

```
src/
├── app.module.ts               # Root module (MongoDB, Mailer, Config)
├── main.ts                     # Bootstrap + Swagger setup
├── auth/
│   ├── auth.controller.ts      # /api/auth routes
│   ├── auth.service.ts         # Register, login, verify, reset password
│   ├── auth.module.ts
│   ├── dto/                    # RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto
│   └── strategies/
│       └── jwt.strategy.ts     # Passport JWT strategy
├── users/
│   ├── users.controller.ts     # /api/users routes
│   ├── users.service.ts        # CRUD operations
│   ├── users.module.ts
│   ├── users.entity.ts         # Mongoose schema + UserDocument type
│   ├── dto/                    # CreateUserDto, UpdateUserDto, UpdateRoleDto
│   └── enums/
│       └── role.enum.ts        # admin | operator | authority | road_user
├── common/
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── roles.guard.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   └── interceptors/
│       └── transform.interceptor.ts
└── database/
    └── seed.ts                 # Database seeder script

test/
├── auth/
│   └── auth.service.spec.ts    # 11 unit tests
└── users/
    └── users.service.spec.ts   # 9 unit tests
```

---

## ✅ Prerequisites

- **Node.js** v18+
- **npm** v9+
- **MongoDB 4.0** running on `localhost:27017`

**Start MongoDB** (Windows service):
```powershell
Start-Service MongoDB
```

Or run directly:
```powershell
mongod
```

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment variables
copy .env.example .env   # then edit .env with your values

# 3. Seed the database with default users
npm run seed

# 4. Start the development server
npm run start:dev
```

The API will be available at: **http://localhost:3000/api**  
Swagger docs at: **http://localhost:3000/api/docs**

---

## 🔧 Environment Variables

Create a `.env` file in the project root (copy from `.env.example`):

```env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/trafiq_db

# JWT
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=7d

# Mail (leave MAIL_USER empty to disable auth — for local dev / no SMTP server)
MAIL_HOST=localhost
MAIL_PORT=1025
MAIL_USER=
MAIL_PASS=
MAIL_FROM=no-reply@trafiq.tn

# App
APP_URL=http://localhost:3000
```

> **Note:** If `MAIL_USER` is empty, the mailer runs without SMTP authentication. Email errors are non-fatal — registration and password-reset still work, the email is simply skipped with a warning log.

---

## 🌱 Database Seeding

Populate the database with one user per role:

```bash
npm run seed
```

The seeder is **idempotent** — running it multiple times will skip users that already exist.

**Seed output example:**
```
🌱  Connecting to MongoDB: mongodb://localhost:27017/trafiq_db
✅  Connected

✔   Created  [admin    ] admin@trafiq.tn       →  password: Admin@1234
✔   Created  [operator ] operator@trafiq.tn    →  password: Operator@1234
✔   Created  [authority] authority@trafiq.tn   →  password: Authority@1234
✔   Created  [road_user] user@trafiq.tn        →  password: User@1234
```

---

## ▶ Running the Server

```bash
# Development (watch mode — auto-restart on file changes)
npm run start:dev

# Production build
npm run build
npm run start:prod

# Debug mode
npm run start:debug
```

---

## 📖 API Documentation (Swagger)

Interactive docs are available once the server is running:

**http://localhost:3000/api/docs**

To test protected endpoints:
1. Call `POST /api/auth/login` with valid credentials
2. Copy the `accessToken` from the response
3. Click **Authorize** in Swagger UI
4. Paste the token (without `Bearer ` prefix — Swagger adds it)

---

## 🔐 Authentication Flow

```
POST /api/auth/register
  → hashes password, saves user (isVerified: false)
  → sends verification email with token link

GET  /api/auth/verify-email?token=<token>
  → sets isVerified: true

POST /api/auth/login
  → validates credentials + isVerified + isActive
  → returns JWT accessToken (7-day expiry)

POST /api/auth/forgot-password
  → generates reset token, sends email (anti-enumeration: always same response)

POST /api/auth/reset-password
  → validates token + expiry, updates password
```

All protected routes require:
```
Authorization: Bearer <accessToken>
```

---

## 🗺 API Endpoints

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | ❌ | Register a new account |
| GET | `/verify-email?token=` | ❌ | Verify email address |
| POST | `/login` | ❌ | Login and get JWT token |
| POST | `/forgot-password` | ❌ | Request password reset email |
| POST | `/reset-password` | ❌ | Reset password with token |

### Users — `/api/users`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/` | ✅ | Admin | Create a user |
| GET | `/` | ✅ | Admin | List all users |
| GET | `/:id` | ✅ | Admin | Get user by ID |
| PATCH | `/:id` | ✅ | Admin | Update user fields |
| PATCH | `/:id/role` | ✅ | Admin | Change user role |
| DELETE | `/:id` | ✅ | Admin | Deactivate user (soft delete) |
| GET | `/me/profile` | ✅ | Any | Get own profile |
| PATCH | `/me/profile` | ✅ | Any | Update own profile |

---

## 👥 Roles & Permissions

| Role | Value | Description |
|------|-------|-------------|
| **Admin** | `admin` | Full access — manage all users and platform |
| **Operator** | `operator` | Traffic system operator |
| **Authority** | `authority` | City/government authority |
| **Road User** | `road_user` | Default role for self-registered users |

---

## 🧪 Running Tests

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov
```

**Test suites:** 2 | **Tests:** 20 | **Status:** ✅ All passing

---

## 🔑 Default Seed Users

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@trafiq.tn` | `Admin@1234` |
| Operator | `operator@trafiq.tn` | `Operator@1234` |
| Authority | `authority@trafiq.tn` | `Authority@1234` |
| Road User | `user@trafiq.tn` | `User@1234` |

> ⚠️ Change these credentials in production.

---

## 📝 Response Format

All responses follow a consistent envelope:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2026-03-04T00:00:00.000Z"
}
```

**Error:**
```json
{
  "success": false,
  "statusCode": 401,
  "message": "Invalid credentials",
  "timestamp": "2026-03-04T00:00:00.000Z",
  "path": "/api/auth/login"
}
```

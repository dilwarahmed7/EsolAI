# Esol AI Web App

Full-stack ESOL learning platform for students and teachers. The application combines a React frontend, an ASP.NET Core backend, PostgreSQL hosted in Supabase, JWT authentication, and an auxiliary NLP correction service used for writing feedback.

## Stack

- Frontend: React 19, React Router, Axios, Recharts
- Backend: ASP.NET Core 9 Web API, Entity Framework Core, JWT auth
- Database: PostgreSQL via Npgsql hosted in Supabase
- NLP service: FastAPI service in `backend/FCEServer`

## Repository Structure

- `frontend/`: React application for student and teacher workflows
- `backend/`: ASP.NET Core API, EF Core models, controllers, and migrations
- `backend/FCEServer/`: Python service used by the backend for correction/NLP requests
- `dxa213.sln`: Visual Studio solution for the backend

## Main Features

### Student flows

- Register, log in, edit profile, request password reset
- View dashboard and complete assigned lessons
- Complete practice activities
- Review progress and common error patterns

### Teacher flows

- Log in and manage profile
- View teacher dashboard
- Manage lessons and students
- Review student work and feedback

## Architecture

The frontend runs separately from the API and talks to the backend over HTTP.

- React frontend: `http://localhost:3000`
- ASP.NET Core backend: local development port defined by the backend launch profile
- NLP correction service: `http://localhost:8000` by default

The backend reads:

- `ConnectionStrings:DefaultConnection` from configuration
- `DB_PASSWORD` from environment variables
- `JWT_KEY` from environment variables
- `Jwt:Issuer` and `Jwt:Audience` from configuration
- `NLP_BASE_URL` from environment variables, or defaults to `http://localhost:8000`

## Prerequisites

- Node.js and npm
- .NET 9 SDK
- PostgreSQL
- Python 3 for the NLP service

## Environment Setup

Do not commit real secrets to source control. Use local environment variables or user secrets for sensitive values.

Required backend environment variables:

- `DB_PASSWORD`
- `JWT_KEY`
- `NLP_BASE_URL` (optional if using `http://localhost:8000`)

Backend configuration also expects:

- `ConnectionStrings:DefaultConnection`
- `Jwt:Issuer`
- `Jwt:Audience`

## Running the Application

### 1. Start the backend

From `backend/`:

```bash
dotnet restore
dotnet ef database update
dotnet run
```

Swagger is enabled in development.

### 2. Start the frontend

From `frontend/`:

```bash
npm install
npm start
```

The React app runs on `http://localhost:3000`.

### 3. Start the NLP service

From `backend/FCEServer/`:

```bash
pip install -r requirements.txt
python fastapi_server.py
```

If the service runs on a different URL, set `NLP_BASE_URL` before starting the backend.

## Database

Entity Framework Core migrations are stored in `backend/Migrations/`.

Useful commands:

```bash
dotnet ef database update
dotnet ef migrations add <MigrationName>
```

Run these from `backend/`.

## Frontend Routing

The app currently exposes separate route sets by role:

- Auth: `/login`, `/register`, `/forgot-password`, `/reset-password`
- Student: `/`, `/my-lessons`, `/practice`, `/practice/common-errors`, `/progress`, `/profile`
- Teacher: `/`, `/lessons`, `/students`, `/review`, `/profile`

## Notes

- CORS is configured in development for `http://localhost:3000`.
- The backend depends on valid JWT configuration at startup.
- The NLP seed call in `Program.cs` is currently commented out.

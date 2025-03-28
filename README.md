# Dynamic Dashboard with Google Sheets Integration

A full-stack dashboard application built with Next.js and Node.js that features authentication, dynamic table creation, and Google Sheets integration.

## Features

- 🔐 JWT-based Authentication (Login & Signup)
- 📊 Dynamic Table Creation
- 📈 Google Sheets Integration
- 🔄 Real-time Data Updates
- ➕ Dynamic Column Addition
- 🎨 Modern UI with Tailwind CSS and ShadcnUI

## Tech Stack

### Frontend
- Next.js
- Tailwind CSS
- ShadcnUI
- JWT for authentication

### Backend
- Node.js (Express)
- MongoDB
- Google Sheets API
- JWT for authentication

## Prerequisites

- Node.js (v18 or higher)
- MongoDB
- Google Cloud Project with Sheets API enabled
- Google Sheets API credentials

## Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=your_backend_url
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_google_client_id
```

### Backend (.env)
```
MONGODB_URI=your_mongodb_uri
JWT_SECRET=your_jwt_secret
GOOGLE_SHEETS_CLIENT_EMAIL=your_google_service_account_email
GOOGLE_SHEETS_PRIVATE_KEY=your_google_service_account_private_key
```

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dynamic-dashboard.git
cd dynamic-dashboard
```

2. Install dependencies:
```bash
# Install frontend dependencies
cd frontend
npm install

# Install backend dependencies
cd ../backend
npm install
```

3. Set up environment variables:
- Copy `.env.example` to `.env` in both frontend and backend directories
- Fill in the required environment variables

4. Start the development servers:
```bash
# Start backend server
cd backend
npm run dev

# Start frontend server (in a new terminal)
cd frontend
npm run dev
```

5. Access the application:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000

## Google Sheets Setup

1. Create a Google Cloud Project
2. Enable Google Sheets API
3. Create a service account and download credentials
4. Share your Google Sheet with the service account email

## Deployment

### Frontend (Vercel)
1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel dashboard
4. Deploy

### Backend (Render/Heroku)
1. Push your code to GitHub
2. Create a new service in Render/Heroku
3. Connect your repository
4. Add environment variables
5. Deploy

## API Documentation

### Authentication
- POST /api/auth/register - Register new user
- POST /api/auth/login - Login user
- GET /api/auth/me - Get current user

### Tables
- POST /api/tables - Create new table
- GET /api/tables - Get all tables
- GET /api/tables/:id - Get specific table
- POST /api/tables/:id/columns - Add new column
- GET /api/tables/:id/sync - Sync with Google Sheets

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 

## Troubleshooting Node.js Installation

If you're having issues with Node.js, please follow these steps manually:

1. Open a new Command Prompt (not PowerShell) and run:
```
node --version
```

If that doesn't work, please try these troubleshooting steps:

1. Uninstall Node.js completely
2. Download Node.js LTS version from https://nodejs.org/
3. During installation:
   - Check "Automatically install the necessary tools"
   - Make sure "Add to PATH" is checked
4. After installation:
   - Close all terminal windows
   - Open a new Command Prompt
   - Run `node --version`

Please let me know once you've done this and can successfully run `node --version` in a Command Prompt. This will ensure we have a working Node.js installation before proceeding with the project setup.
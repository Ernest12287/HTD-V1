# Host TalkDrove (HTD-V1)

Host TalkDrove is a Node.js application that provides a web interface for hosting and managing bots.
It offers authentication, dashboard views, admin and moderator tools, deployment helpers and wallet
features. The project uses Express for the HTTP server, EJS for templating and MySQL for persistence.

## Features

- User authentication with signup, login and password reset routes
- Admin interface for managing bots, users, API keys and support tickets
- Moderator routes for handling bot reports and deposit requests
- Bot deployment workflows with Heroku integration
- Wallet and payment endpoints for coin deposits and purchases
- REST style APIs under `api/routes/apis`

## Project Structure

```
Hamza.js               # Application entry point
api/                   # API routes, middlewares and database helpers
public/                # Static files served by Express
views/                 # EJS views used for server-rendered pages
```

## Scripts

- `npm start` – start the application
- `npm run dev` – start with nodemon for development

## Environment Variables

Create a `.env` file in the project root and provide the following variables:

```
DB_HOST=
DB_USER=
DB_PASSWORD=
DB_NAME=
SESSION_SECRET=
NODE_ENV=production
PORT=3000
SITE_URL=
MAINTENANCE_MODE=false
HTD_API_KEY=
CREEM_API_URL=
CREEM_API_KEY=
```

`SESSION_SECRET` should be a random string used to sign cookies. The database settings should point to a
MySQL server. Update `PORT` if you want the server to listen on a different port.

## Running the Application

Install dependencies and run the server:

```bash
npm install
npm start
```

The service will listen on the port configured in the `.env` file (default `3000`).

For additional details about preparing the environment and database, see
[`docs/setup.md`](docs/setup.md).

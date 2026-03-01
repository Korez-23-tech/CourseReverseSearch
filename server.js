// =============================================================================
// server.js
// Backend server for the Course Reverse Search application.
//
// DEPLOYMENT ARCHITECTURE (GitHub Pages):
//   This file is NOT hosted on GitHub Pages. GitHub Pages serves only static
//   files (index.html, script.js, style.css). This file must be deployed
//   separately to a Node.js hosting platform such as Render or Railway.
//
//   [GitHub Pages]                         [Render / Railway]
//   index.html                             server.js  (this file)
//   script.js       — HTTPS fetch() →      /search endpoint
//   style.css                              pool.query() → TimescaleDB
//
// CHANGES FROM LOCALHOST VERSION:
//   1. "import 'dotenv/config'"  added — loads environment variables from .env
//   2. "import cors from 'cors'" added — required for cross-origin requests
//   3. "app.use(cors(...))"      added — permits requests from GitHub Pages URL
//   4. "app.use(express.static)" REMOVED — GitHub Pages serves frontend files
//   5. "process.env.DATABASE_URL" replaces hardcoded connection string
//   6. "process.env.PORT"        replaces hardcoded port 3000
// =============================================================================


// -----------------------------------------------------------------------------
// SECTION 1: IMPORTS
// -----------------------------------------------------------------------------

import 'dotenv/config';
// dotenv reads the .env file in the project root and loads every key=value
// pair into process.env, making them accessible as process.env.KEY_NAME.
// This must be the FIRST import so environment variables are available to all
// code below. The .env file is never committed to the repository — credentials
// stay off GitHub entirely.
// Install via: npm install dotenv

import express from 'express';
// Express handles incoming HTTP requests and routes them to the correct handler.

import pg from 'pg';
// node-postgres: implements the PostgreSQL wire protocol so Node.js can
// communicate with the TimescaleDB Cloud instance over TCP/IP.

import cors from 'cors';
// CORS = Cross-Origin Resource Sharing.
// Browsers enforce a security rule: a page served from Origin A cannot call
// an API at Origin B unless Origin B explicitly says it permits that.
// GitHub Pages (https://yourusername.github.io) and the backend server
// (https://your-app.onrender.com) are two different origins. Without this
// package, the browser silently blocks every fetch() response before
// script.js can read it, regardless of whether the request reached the server.
// Install via: npm install cors


// -----------------------------------------------------------------------------
// SECTION 2: INITIALIZATION
// -----------------------------------------------------------------------------

const { Pool } = pg;
// Pool manages a collection of reusable database connections.
// Reusing connections avoids the overhead of a full TCP + TLS + authentication
// handshake on every incoming request.

const app = express();
// Creates the Express application. All middleware and routes attach to this.


// -----------------------------------------------------------------------------
// SECTION 3: MIDDLEWARE
// Middleware runs on every request before it reaches a route handler.
// Order matters — middleware executes in the order app.use() is called.
// -----------------------------------------------------------------------------

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
  // ALLOWED_ORIGIN is set in the .env file (locally) and in the hosting
  // platform's environment variable settings (in production).
  //
  // Example value: https://yourusername.github.io
  //
  // This tells the browser: "only requests originating from this exact URL
  // are permitted to read responses from this server."
  // Setting origin: '*' would allow any website to call this endpoint —
  // acceptable for fully public APIs, but inappropriate here because real
  // database queries are being executed on behalf of the caller.
}));
// The cors() middleware adds the following HTTP header to every response:
//   Access-Control-Allow-Origin: https://yourusername.github.io
// The browser checks this header. If the current page's origin matches,
// the response is released to script.js. If not, the browser discards it.

app.use(express.json());
// Parses the JSON body of incoming POST requests into req.body.
// Required because script.js sends: { "courseCode": "CNIT 120" } as JSON.

// NOTE: app.use(express.static('.')) has been REMOVED.
// In the localhost version, Express served index.html, script.js, and
// style.css. In the GitHub Pages deployment, those files are served directly
// by GitHub's infrastructure. Having the backend also serve them would be
// redundant and would cause the backend to receive traffic it does not need.


// -----------------------------------------------------------------------------
// SECTION 4: DATABASE CONNECTION POOL
// -----------------------------------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
  // DATABASE_URL is defined in the .env file (locally) and as an environment
  // variable on the hosting platform (in production).
  //
  // Full value format:
  //   postgres://tsdbadmin:<PASSWORD>@gdj8h4wj0e.kfltst1kf3.tsdb.cloud.timescale.com:37859/tsdb?sslmode=require
  //
  // Using process.env means the password never appears in this source file.
  // If this file is committed to GitHub, no credentials are exposed.
});


// -----------------------------------------------------------------------------
// SECTION 5: STARTUP CONNECTION VERIFICATION
// Acquires one connection from the pool at startup to confirm that the
// DATABASE_URL is valid and the server is reachable. Surfaces credential or
// network errors immediately rather than at the first user request.
// -----------------------------------------------------------------------------

pool.connect((err, client, release) => {
  if (err) {
    console.error('Database connection failed:', err.message);
    // The server continues running after this error. Every subsequent
    // pool.query() call will also fail until the issue is resolved.
    // Check that DATABASE_URL is set correctly in the environment variables.
  } else {
    console.log('Connected to TimescaleDB successfully.');
    release();
    // release() returns the borrowed connection to the pool.
    // Omitting this call would permanently consume one pool slot, eventually
    // exhausting the pool and causing the server to stop responding.
  }
});


// -----------------------------------------------------------------------------
// SECTION 6: ROUTE HANDLER — POST /search
// Receives a course code from script.js, queries the database, returns results.
// This is the only endpoint this server exposes.
// -----------------------------------------------------------------------------

app.post('/search', async (req, res) => {
  // app.post() — responds only to HTTP POST requests at the path '/search'.
  // async      — required to use "await" on pool.query() inside this function.
  // req        — the incoming request (body, headers, etc.)
  // res        — the outgoing response (used to send JSON back to script.js)

  const { courseCode } = req.body;
  // Reads the courseCode property from the parsed JSON body.
  // script.js sends: { "courseCode": "CNIT 120" }
  // express.json() middleware already parsed that into req.body.


  // ---------------------------------------------------------------------------
  // SERVER-SIDE VALIDATION
  // This duplicates the regex in script.js intentionally. Client-side
  // validation can be bypassed by sending a POST request directly via
  // curl, Postman, or a malicious script. The server must never trust
  // input that has not been validated server-side.
  // ---------------------------------------------------------------------------

  const courseRegex = /^[A-Za-z]{2,4}\s\d{1,4}[A-Za-z]?$/;
  if (!courseCode || !courseRegex.test(courseCode.trim())) {
    return res.status(400).json({ error: 'Invalid course code format.' });
    // 400 Bad Request — input failed server-side validation.
    // "return" exits the handler; nothing below executes.
  }


  // ---------------------------------------------------------------------------
  // DATABASE QUERY
  // ---------------------------------------------------------------------------

  try {
    const result = await pool.query(
      `SELECT degree_name, certificate_name
       FROM course_qualifications
       WHERE course_code = $1
       ORDER BY degree_name`,
      // $1 is a parameterized placeholder. The value is sent separately from
      // the SQL string, so PostgreSQL treats it as pure data — never as SQL.
      // This prevents SQL injection regardless of what the user typed.

      [courseCode.trim().toUpperCase()]
      // .trim()        — removes accidental whitespace
      // .toUpperCase() — normalizes "cnit 120" → "CNIT 120" for consistent matching
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No degrees or certificates found for that course.' });
      // 404 Not Found — the query ran successfully but returned no rows.
    }

    res.json({ results: result.rows });
    // result.rows is an array of plain objects, one per returned database row.
    // res.json() serializes it to a JSON string and sends it to script.js.

  } catch (err) {
    console.error('Query error:', err.message);
    // Logs the full technical error server-side for debugging.

    res.status(500).json({ error: 'Database query failed.' });
    // 500 Internal Server Error — something went wrong on the server.
    // The vague message is intentional: detailed database errors must not
    // be exposed to the client, as they can reveal schema structure.
  }
});


// -----------------------------------------------------------------------------
// SECTION 7: START THE SERVER
// -----------------------------------------------------------------------------

const PORT = process.env.PORT || 3000;
// process.env.PORT is provided automatically by hosting platforms like Render
// and Railway. They assign a port dynamically; hardcoding 3000 would cause
// the server to fail to bind on those platforms.
// "|| 3000" provides a fallback for local development where PORT is not set.

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

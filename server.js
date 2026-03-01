// =============================================================================
// server.js
// Backend server for the Course Reverse Search application.
//
// ROLE IN THE ARCHITECTURE:
//   This file runs in Node.js — NOT in the browser. It acts as the middleman
//   between the browser (index.html / script.js) and the PostgreSQL database.
//   The browser cannot talk to PostgreSQL directly, so it sends HTTP requests
//   to this server, which then queries the database and sends results back.
//
//   [Browser] <--- HTTP (JSON) ---> [This server] <--- TCP/IP ---> [TimescaleDB]
// =============================================================================


// -----------------------------------------------------------------------------
// SECTION 1: IMPORTS
// Node.js uses "import" statements (ES Module syntax) to load external packages.
// These packages must be installed first via: npm install express pg
// -----------------------------------------------------------------------------

import express from 'express';
// "express" is a lightweight web framework for Node.js.
// It handles incoming HTTP requests (like the form submission from the browser)
// and sends HTTP responses back. Without it, raw Node.js HTTP handling is
// significantly more verbose.

import pg from 'pg';
// "pg" is the node-postgres package — the official PostgreSQL driver for Node.js.
// It implements the PostgreSQL wire protocol, which is the binary communication
// format the PostgreSQL server expects. The browser has no access to this protocol;
// it can only be used server-side in Node.js.


// -----------------------------------------------------------------------------
// SECTION 2: INITIALIZATION
// Set up the Express application and extract the Pool class from the pg package.
// -----------------------------------------------------------------------------

const { Pool } = pg;
// "Pool" is destructured from the pg package.
// A Pool manages a collection of reusable database connections.
//
// WHY USE A POOL INSTEAD OF A SINGLE CONNECTION?
//   Opening a TCP connection to PostgreSQL is expensive (authentication handshake,
//   SSL negotiation, etc.). A Pool opens several connections upfront and reuses
//   them across multiple incoming requests, improving performance significantly.
//   When a request comes in, the Pool lends a connection; when the query finishes,
//   the connection is returned to the pool rather than closed.

const app = express();
// Creates an Express application instance. All route definitions and middleware
// are attached to this object.


// -----------------------------------------------------------------------------
// SECTION 3: MIDDLEWARE
// Middleware are functions that run on every incoming request before it reaches
// a route handler. They pre-process the request in some way.
// -----------------------------------------------------------------------------

app.use(express.json());
// Parses incoming requests whose Content-Type is "application/json".
// Without this, req.body would be undefined when the browser sends JSON.
// script.js sends JSON via fetch(), so this middleware is required.

app.use(express.static('.'));
// Serves static files (index.html, script.js, style.css) from the current
// directory. When the browser navigates to http://localhost:3000, Express
// finds and returns index.html automatically. This eliminates the need for
// a separate file server or opening index.html directly from the filesystem.


// -----------------------------------------------------------------------------
// SECTION 4: DATABASE CONNECTION POOL
// Instantiate the Pool with the TimescaleDB connection string.
// The connection string encodes every parameter PostgreSQL needs to accept
// the connection (see PostgreSQL 18.3 Documentation §32.1.1).
// -----------------------------------------------------------------------------

const pool = new Pool({
  connectionString: 'postgres://tsdbadmin:<YOUR_PASSWORD>@gdj8h4wj0e.kfltst1kf3.tsdb.cloud.timescale.com:37859/tsdb?sslmode=require'
  //                  ^scheme    ^user      ^password      ^host                                              ^port ^dbname ^ssl
  //
  // BREAKDOWN OF THE URI (per §32.1.1.2 of the documentation):
  //   postgres://       — URI scheme; tells the driver this is a PostgreSQL connection
  //   tsdbadmin         — the PostgreSQL role/user to authenticate as
  //   <YOUR_PASSWORD>   — the password for that role (never commit this to git)
  //   @gdj8h4w...com   — the hostname of the TimescaleDB cloud server
  //   :37859            — the port number (default PostgreSQL port is 5432;
  //                       TimescaleDB Cloud uses a non-standard port)
  //   /tsdb             — the name of the database to connect to
  //   ?sslmode=require  — a query parameter telling the driver to require an
  //                       encrypted SSL/TLS connection. TimescaleDB Cloud
  //                       mandates this; a non-SSL connection will be rejected.
});


// -----------------------------------------------------------------------------
// SECTION 5: STARTUP CONNECTION VERIFICATION
// Immediately test that the pool can reach the database when the server starts.
// This surfaces misconfiguration errors at startup rather than at the first
// user request.
// -----------------------------------------------------------------------------

pool.connect((err, client, release) => {
  // pool.connect() acquires one connection from the pool.
  // It calls this callback with three arguments:
  //   err     — an Error object if the connection failed, otherwise null
  //   client  — the connected PGconn client object (§32.1 of documentation)
  //   release — a function to call when finished, returning the client to the pool

  if (err) {
    console.error('Database connection failed:', err.message);
    // Logs the failure reason. The server continues running, but every
    // subsequent query will also fail until the connection issue is resolved.
  } else {
    console.log('Connected to TimescaleDB successfully.');
    release();
    // release() is critical. If omitted, the connection is never returned
    // to the pool, eventually exhausting all available connections and
    // causing the application to hang on future requests.
  }
});


// -----------------------------------------------------------------------------
// SECTION 6: ROUTE HANDLER — POST /search
// This is the endpoint that script.js calls via fetch() when the form is submitted.
// A "route" is a pairing of an HTTP method + URL path to a handler function.
// -----------------------------------------------------------------------------

app.post('/search', async (req, res) => {
  // app.post()  — this route only responds to HTTP POST requests.
  // '/search'   — the URL path the browser must POST to.
  // async       — marks the function as asynchronous, enabling use of "await"
  //               for database calls without blocking the event loop.
  // req         — the incoming request object (contains body, headers, etc.)
  // res         — the outgoing response object (used to send data back)

  const { courseCode } = req.body;
  // Destructures the "courseCode" property from the JSON body.
  // The browser sends: { "courseCode": "CNIT 120" }
  // express.json() middleware (Section 3) parsed that JSON into req.body.


  // ---------------------------------------------------------------------------
  // SERVER-SIDE VALIDATION
  // Client-side validation in script.js can be bypassed by any HTTP client
  // (e.g., curl, Postman, or a malicious actor). Server-side validation is
  // therefore not optional — it is the authoritative gatekeeping layer.
  // ---------------------------------------------------------------------------

  const courseRegex = /^[A-Za-z]{2,4}\s\d{1,4}[A-Za-z]?$/;
  // Regex breakdown:
  //   ^           — start of string (no leading characters allowed)
  //   [A-Za-z]{2,4} — 2 to 4 alphabetic characters (the department code, e.g. "CNIT")
  //   \s          — exactly one whitespace character (the space between code and number)
  //   \d{1,4}     — 1 to 4 digits (the course number, e.g. "120")
  //   [A-Za-z]?   — an optional trailing letter (e.g., "101A")
  //   $           — end of string (no trailing characters allowed)

  if (!courseCode || !courseRegex.test(courseCode.trim())) {
    return res.status(400).json({ error: 'Invalid course code format.' });
    // 400 Bad Request — the client sent data that failed validation.
    // res.json() serializes the object to JSON and sets Content-Type automatically.
    // "return" exits the handler immediately; code below does not execute.
  }


  // ---------------------------------------------------------------------------
  // DATABASE QUERY
  // Uses a try/catch block because pool.query() returns a Promise that may
  // reject if the database is unreachable or the SQL is malformed.
  // ---------------------------------------------------------------------------

  try {
    const result = await pool.query(
      // pool.query() acquires a connection from the pool, executes the SQL,
      // releases the connection back, and returns a result object.
      // "await" pauses this async function until the Promise resolves,
      // without blocking other incoming requests (Node.js is single-threaded
      // but non-blocking via its event loop).

      `SELECT degree_name, certificate_name
       FROM course_qualifications
       WHERE course_code = $1
       ORDER BY degree_name`,
      // $1 is a positional placeholder — a parameterized query.
      //
      // WHY PARAMETERIZED QUERIES?
      //   If the course code were interpolated directly into the string:
      //     WHERE course_code = '${courseCode}'   <-- NEVER DO THIS
      //   A user could input: ' OR '1'='1
      //   Which would make the query: WHERE course_code = '' OR '1'='1'
      //   This is a SQL injection attack — it can expose or destroy the database.
      //   With $1, the driver sends the value as a separate binary parameter,
      //   and PostgreSQL treats it as data only, never as SQL syntax.

      [courseCode.trim().toUpperCase()]
      // The values array. $1 is replaced by this value server-side.
      // .trim()        — removes any accidental leading/trailing whitespace
      // .toUpperCase() — normalizes "cnit 120" to "CNIT 120" for consistent matching
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No degrees or certificates found for that course.' });
      // 404 Not Found — the query succeeded but returned no matching rows.
    }

    res.json({ results: result.rows });
    // result.rows is an array of plain JavaScript objects, one per returned row.
    // Example: [{ degree_name: "Network Security", certificate_name: "Cybersecurity" }]
    // res.json() converts this to JSON and sends it to the browser.

  } catch (err) {
    console.error('Query error:', err.message);
    // Logs the full error server-side for debugging.

    res.status(500).json({ error: 'Database query failed.' });
    // 500 Internal Server Error — something went wrong on the server.
    // The generic message is intentional: detailed database errors should
    // never be sent to the client, as they may reveal schema information.
  }
});


// -----------------------------------------------------------------------------
// SECTION 7: START THE SERVER
// Binds the Express application to a local port and begins listening for
// incoming TCP connections.
// -----------------------------------------------------------------------------

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
// app.listen() starts the HTTP server on the specified port.
// Port 3000 is a convention for local development; production deployments
// typically use port 80 (HTTP) or 443 (HTTPS).
// The callback runs once the server is ready to accept connections.

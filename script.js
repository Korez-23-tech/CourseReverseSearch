// =============================================================================
// script.js
// Client-side logic for the Course Reverse Search application.
//
// DEPLOYMENT CHANGE FROM LOCALHOST VERSION:
//   Previously, fetch() used the relative URL '/search', which resolved to
//   whatever host served the page. On GitHub Pages, that would point back to
//   GitHub's servers — which have no /search endpoint.
//
//   The fix is a single constant, API_BASE, set to the absolute URL of the
//   backend server deployed on Render, Railway, or another Node.js host.
//   Every fetch() call uses this constant instead of a relative path.
//
// 5-STEP WORKFLOW:
//   STEP 1 — User types a course number into #user_input.
//   STEP 2 — User clicks Submit; handleSubmit(event) is called.
//   STEP 3 — Input is validated, then sent to server.js via fetch().
//   STEP 4 — server.js queries PostgreSQL and returns matching results.
//   STEP 5 — Results are rendered into #result_list in index.html.
// =============================================================================


// -----------------------------------------------------------------------------
// API BASE URL — GITHUB PAGES DEPLOYMENT CHANGE
// This is the only value that must be updated when the backend is deployed.
// Replace the placeholder with the actual public URL assigned by the hosting
// platform after deploying server.js.
//
// Examples:
//   Render:  'https://course-search.onrender.com'
//   Railway: 'https://course-search.up.railway.app'
//
// No trailing slash. The '/search' path is appended in the fetch() call below.
// -----------------------------------------------------------------------------

const API_BASE = 'https://your-backend-url.onrender.com';
// BEFORE (localhost): fetch('/search', ...)
// AFTER  (deployed):  fetch(`${API_BASE}/search`, ...)
//
// Defining this as a named constant at the top of the file means it only
// needs to be updated in one place if the backend host ever changes.


// -----------------------------------------------------------------------------
// FUNCTION: useRegex(input)
// PURPOSE:  Validates the course number format before any network request.
//           Client-side validation only — for user experience, not security.
//           server.js performs its own validation as the authoritative check.
// -----------------------------------------------------------------------------

function useRegex(input) {

  const regex = /^[A-Za-z]{2,4}\s\d{1,4}[A-Za-z]?$/;
  // Pattern breakdown:
  //   ^             — Start anchor. Match must begin at character 1.
  //   [A-Za-z]{2,4} — 2 to 4 letters. Department codes: CS, CNIT, MATH.
  //   \s            — Exactly one whitespace character (required separator).
  //   \d{1,4}       — 1 to 4 digits. Course numbers: 1, 80, 101, 9999.
  //   [A-Za-z]?     — 0 or 1 optional trailing letter. Suffixes like "A".
  //   $             — End anchor. Nothing may follow the optional letter.

  return regex.test(input.trim());
  // .trim() strips leading/trailing whitespace so "  CS 101  " still passes.
  // .test() returns true if the pattern matches, false otherwise.
}


// -----------------------------------------------------------------------------
// FUNCTION: handleSubmit(event)
// PURPOSE:  Called when the user submits the form. Orchestrates all 5 steps.
// -----------------------------------------------------------------------------

async function handleSubmit(event) {
  // "async" enables use of "await" inside this function. Without it, await
  // would be a syntax error and fetch() would return an unresolved Promise
  // instead of pausing until the server responds.


  // -------------------------------------------------------------------------
  // STEP 2A — PREVENT DEFAULT FORM BEHAVIOR
  // Without this, the browser navigates to a new URL on form submit,
  // reloading the page and discarding all state before fetch() can run.
  // -------------------------------------------------------------------------

  event.preventDefault();


  // -------------------------------------------------------------------------
  // STEP 2B — GATHER DOM REFERENCES
  // getElementById() returns the element whose id matches the given string.
  // These references are used to read input and write output to the page.
  // -------------------------------------------------------------------------

  const userInput     = document.getElementById('user_input').value;
  const outputEl      = document.getElementById('output');
  const statusEl      = document.getElementById('status_message');
  const resultListEl  = document.getElementById('result_list');
  const searchLabelEl = document.getElementById('search_label');


  // -------------------------------------------------------------------------
  // STEP 2C — SHOW OUTPUT SECTION AND RESET PREVIOUS RESULTS
  // Overrides CSS "display: none" to make the output container visible.
  // Clears prior results so stale data is never shown alongside new output.
  // -------------------------------------------------------------------------

  outputEl.style.display    = 'block';
  resultListEl.innerHTML    = '';
  searchLabelEl.textContent = '';


  // -------------------------------------------------------------------------
  // STEP 3A — CLIENT-SIDE VALIDATION
  // If input is invalid, display an error and exit early with "return".
  // The fetch() call never runs for invalid input, avoiding a wasted request.
  // -------------------------------------------------------------------------

  if (!useRegex(userInput)) {
    statusEl.textContent =
      'Invalid format. Please enter a department code followed by a course number — for example, "CNIT 120" or "CS 101".';
    return;
  }


  // -------------------------------------------------------------------------
  // STEP 3B — LOADING STATE
  // Shown to the user while the network request is in flight.
  // -------------------------------------------------------------------------

  statusEl.textContent = `Searching for "${userInput.trim()}"...`;


  // -------------------------------------------------------------------------
  // STEP 3C — SEND REQUEST TO BACKEND SERVER
  //
  // GITHUB PAGES CHANGE: The URL is now absolute using API_BASE.
  // fetch(`${API_BASE}/search`) resolves to, for example:
  //   https://course-search.onrender.com/search
  //
  // The browser checks the response headers for the CORS header:
  //   Access-Control-Allow-Origin: https://yourusername.github.io
  // server.js (via the cors() middleware) adds this header. If it matches
  // the current page's origin, the browser permits script.js to read the
  // response. If not, the browser discards it silently.
  //
  // try/catch handles two distinct failure categories:
  //   response.ok false — server responded with an error status (400/404/500)
  //   catch block       — fetch() itself failed (server offline, no network)
  // -------------------------------------------------------------------------

  try {

    const response = await fetch(`${API_BASE}/search`, {
      // "await" pauses here until the server responds. The browser event
      // loop remains active — the tab does not freeze during the wait.

      method: 'POST',
      // POST sends data in the request body. GET is inappropriate here
      // because GET requests cannot carry a body by convention.

      headers: { 'Content-Type': 'application/json' },
      // Tells server.js how to parse the request body.
      // express.json() in server.js reads this header and parses accordingly.

      body: JSON.stringify({ courseCode: userInput.trim() })
      // Converts { courseCode: "CNIT 120" } to the JSON string:
      // '{"courseCode":"CNIT 120"}'
      // This string is sent as the HTTP request body to server.js.
    });


    // -----------------------------------------------------------------------
    // STEP 4 — PARSE THE SERVER RESPONSE
    // response.json() reads the response body stream and parses it back
    // into a JavaScript object. Also asynchronous, so "await" is required.
    // -----------------------------------------------------------------------

    const data = await response.json();


    // -----------------------------------------------------------------------
    // STEP 4A — HANDLE SERVER-REPORTED ERRORS
    // response.ok is true for HTTP status 200-299, false for 400/404/500.
    // These are errors where the server responded but rejected the request.
    // -----------------------------------------------------------------------

    if (!response.ok) {
      statusEl.textContent = `Error: ${data.error}`;
      return;
    }


    // -----------------------------------------------------------------------
    // STEP 5 — RENDER THE RESULTS
    // data.results is an array of row objects from the database.
    //
    // Example:
    //   [
    //     { degree_name: "A.S. Network Security", certificate_name: "Cybersecurity Certificate" },
    //     { degree_name: null, certificate_name: "Linux Administration Certificate" }
    //   ]
    // -----------------------------------------------------------------------

    searchLabelEl.textContent = `Results for: ${userInput.trim().toUpperCase()}`;

    statusEl.textContent =
      `${data.results.length} match${data.results.length === 1 ? '' : 'es'} found.`;
    // Ternary prints "1 match" or "2 matches" — correct singular/plural grammar.

    const listItems = data.results
      .map(row => {
        // .map() transforms each row object into one HTML <li> string.

        const degree      = row.degree_name      ?? 'N/A';
        const certificate = row.certificate_name ?? 'N/A';
        // "??" — nullish coalescing: substitutes 'N/A' if the column is null.

        return `<li>
                  <strong>Degree:</strong> ${degree}<br>
                  <strong>Certificate:</strong> ${certificate}
                </li>`;
      })
      .join('');
      // .join('') concatenates all <li> strings into one string, no separator.

    resultListEl.innerHTML = `<ul>${listItems}</ul>`;
    // innerHTML parses the string as HTML markup and renders DOM elements.
    // textContent would render the tags as literal visible characters instead.


  } catch (err) {

    // -----------------------------------------------------------------------
    // NETWORK-LEVEL FAILURE HANDLER
    // Runs only if fetch() could not establish an HTTP connection at all.
    // Does NOT run for 400/404/500 responses — those go through response.ok.
    // -----------------------------------------------------------------------

    statusEl.textContent =
      'Network error. Could not reach the server. Please try again.';
    console.error('fetch() failed:', err);
    // console.error() writes to DevTools console (F12). Not visible to users.
  }
}


// -----------------------------------------------------------------------------
// FUNCTION: simpleClock()
// Writes the current date and time into the clock widget in index.html.
// -----------------------------------------------------------------------------

function simpleClock() {
  const d = new Date();
  // new Date() creates a Date object for the current moment using the
  // user's local system clock and timezone.

  document.getElementById('simpleClock_output').textContent = d;
  // Coerces the Date object to a string via Date.toString() automatically.
  // Produces output like: "Sat Feb 28 2026 14:32:01 GMT-0800"
}


// -----------------------------------------------------------------------------
// PAGE LOAD EVENT
// window.onload fires after the full page (HTML, CSS, scripts) has loaded.
// This guarantees getElementById('simpleClock_output') finds its element.
// -----------------------------------------------------------------------------

window.onload = function () {
  simpleClock();
  // Call once immediately so the clock shows the correct time at page load
  // rather than displaying "Loading..." for the first second.

  setInterval(simpleClock, 1000);
  // Schedule simpleClock() to run every 1000ms (1 second) indefinitely.
  // Each call overwrites the previous timestamp, producing a live clock.
};

// =============================================================================
// script.js
// Client-side logic for the Course Reverse Search application.
//
// 5-STEP WORKFLOW (mirrors index.html comments):
//   STEP 1 — User types a course number into #user_input.
//   STEP 2 — User clicks Submit; handleSubmit(event) is called.
//   STEP 3 — Input is validated, then sent to server.js via fetch().
//   STEP 4 — server.js queries PostgreSQL and returns matching results.
//   STEP 5 — Results are rendered into #result_list in index.html.
// =============================================================================


// -----------------------------------------------------------------------------
// FUNCTION: useRegex(input)
// PURPOSE:  Validates that the input string matches the expected course number
//           format BEFORE sending it to the server. This is client-side
//           validation — fast, no network required, immediate user feedback.
//
// VALID EXAMPLES:   "CS 101", "CNIT 120", "MATH 80A" 
// INVALID EXAMPLES: "CS101" (no space), "123 CS" (wrong order), "TOOLONG 1"
// -----------------------------------------------------------------------------

function useRegex(input) {

  const regex = /^[A-Za-z]{2,4}\s\d{1,4}[A-Za-z]?$/;
  // Pattern breakdown, left to right:
  //   ^             — Start anchor. The match must begin at character 1.
  //   [A-Za-z]{2,4} — 2 to 4 letters. Matches department codes: CS, CNIT, MATH.
  //   \s            — Exactly one whitespace character (the required space).
  //   \d{1,4}       — 1 to 4 digits. Matches course numbers: 1, 80, 101, 9999.
  //   [A-Za-z]?     — 0 or 1 optional trailing letter. Matches suffixes like "A".
  //   $             — End anchor. Nothing may follow the optional letter.

  return regex.test(input.trim());
  // .trim() strips leading/trailing whitespace so "  CS 101  " still passes.
  // .test() returns true if the pattern matches, false otherwise.
}


// -----------------------------------------------------------------------------
// FUNCTION: handleSubmit(event)
// PURPOSE:  Entry point for the form submission (Steps 2-5).
//           Called by the form's onsubmit attribute in index.html.
// -----------------------------------------------------------------------------

async function handleSubmit(event) {
  // "async" is required here because this function uses "await" on fetch().
  // Without async, JavaScript would not know to pause and wait for the
  // network response — the code would continue executing with an unresolved
  // Promise instead of actual data.

  // -------------------------------------------------------------------------
  // STEP 2A — PREVENT DEFAULT FORM BEHAVIOR
  // HTML forms natively navigate to a new URL on submit, which reloads the
  // page and destroys all current state. preventDefault() cancels that so
  // JavaScript handles everything within the current page.
  // -------------------------------------------------------------------------
  event.preventDefault();


  // -------------------------------------------------------------------------
  // STEP 2B — GATHER DOM REFERENCES
  // Retrieve references to the HTML elements that will be read from or
  // written to. getElementById() searches the document for the element
  // whose id attribute matches the given string.
  // -------------------------------------------------------------------------

  const userInput     = document.getElementById('user_input').value;
  // The raw text the user typed into the input field.

  const outputEl      = document.getElementById('output');
  // The container div that holds all output. Hidden by default via CSS.

  const statusEl      = document.getElementById('status_message');
  // Displays loading state, validation errors, and query error messages.

  const resultListEl  = document.getElementById('result_list');
  // Displays the final list of matching Certificates and Degrees (Step 5).

  const searchLabelEl = document.getElementById('search_label');
  // Labels the results with the course number that was searched.


  // -------------------------------------------------------------------------
  // STEP 2C — MAKE OUTPUT VISIBLE
  // Overrides the CSS "display: none" so the output section appears.
  // This happens immediately on every submission, before any async work.
  // -------------------------------------------------------------------------

  outputEl.style.display = 'block';

  // Clear any results from a previous search so stale data is never shown
  // alongside new status messages.
  resultListEl.innerHTML  = '';
  searchLabelEl.textContent = '';


  // -------------------------------------------------------------------------
  // STEP 3A — CLIENT-SIDE VALIDATION
  // Run useRegex() before making any network request.
  // If validation fails, display an error and stop here with "return".
  // The fetch() call below never runs for invalid input.
  // -------------------------------------------------------------------------

  if (!useRegex(userInput)) {
    statusEl.textContent =
      'Invalid format. Please enter a department code followed by a course number — for example, "CNIT 120" or "CS 101".';
    return;
    // "return" exits handleSubmit entirely. No request is sent to the server.
  }


  // -------------------------------------------------------------------------
  // STEP 3B — LOADING STATE
  // Display a "Searching..." message while the fetch request is in flight.
  // The user sees this between clicking Submit and receiving a response.
  // -------------------------------------------------------------------------

  statusEl.textContent = `Searching for "${userInput.trim()}"...`;


  // -------------------------------------------------------------------------
  // STEP 3C — SEND REQUEST TO SERVER
  // fetch() sends an HTTP POST request to the /search endpoint on server.js.
  // The course number is sent as a JSON body, not in the URL, for consistency
  // with how server.js expects to receive it.
  //
  // The entire block is wrapped in try/catch to handle two failure categories:
  //   - try  block: handles HTTP-level errors (400, 404, 500) via response.ok
  //   - catch block: handles network-level failures (server offline, no connection)
  // -------------------------------------------------------------------------

  try {

    const response = await fetch('/search', {
      // "await" pauses handleSubmit here until the server responds.
      // The browser event loop remains active — the page does not freeze.

      method: 'POST',
      // POST is used because data (the course code) is being sent in the body.
      // GET requests carry data only in the URL, which is less appropriate here.

      headers: { 'Content-Type': 'application/json' },
      // Tells server.js what format the body is in.
      // express.json() in server.js reads this header to parse the body correctly.

      body: JSON.stringify({ courseCode: userInput.trim() })
      // JSON.stringify() converts { courseCode: "CNIT 120" } into the string:
      // '{"courseCode":"CNIT 120"}'
      // This string travels as the HTTP request body to server.js.
    });


    // -----------------------------------------------------------------------
    // STEP 4 — PARSE THE SERVER RESPONSE
    // response.json() reads the response body stream and parses it from
    // the JSON string back into a JavaScript object. Also async, so "await".
    // -----------------------------------------------------------------------

    const data = await response.json();


    // -----------------------------------------------------------------------
    // STEP 4A — HANDLE SERVER-SIDE ERRORS
    // response.ok is true for status codes 200-299.
    // It is false for 400 (bad request), 404 (not found), 500 (server error).
    // These cases mean the server responded but could not return valid results.
    // -----------------------------------------------------------------------

    if (!response.ok) {
      statusEl.textContent = `Error: ${data.error}`;
      // data.error is the error message set by server.js, e.g.:
      //   "No degrees or certificates found for that course."
      return;
    }


    // -----------------------------------------------------------------------
    // STEP 5 — RENDER THE RESULTS
    // At this point, data.results is an array of objects, each representing
    // one matching Certificate or Associate's Degree from the database.
    //
    // Example of data.results:
    //   [
    //     { degree_name: "A.S. Network Security", certificate_name: "Cybersecurity Certificate" },
    //     { degree_name: null,                     certificate_name: "Linux Administration Certificate" }
    //   ]
    // -----------------------------------------------------------------------

    // Label the output with the course that was searched.
    searchLabelEl.textContent = `Results for: ${userInput.trim().toUpperCase()}`;

    // Update the status message with a count of matches found.
    statusEl.textContent =
      `${data.results.length} match${data.results.length === 1 ? '' : 'es'} found.`;
    // The ternary expression prints "1 match" vs "2 matches" for correct grammar.

    // Build an HTML list from the results array.
    const listItems = data.results
      .map(row => {
        // .map() transforms each row object into one HTML <li> string.

        const degree      = row.degree_name      ?? 'N/A';
        const certificate = row.certificate_name ?? 'N/A';
        // The "??" nullish coalescing operator: if the value is null or
        // undefined (the database column had no value), display 'N/A' instead.

        return `<li>
                  <strong>Degree:</strong> ${degree}<br>
                  <strong>Certificate:</strong> ${certificate}
                </li>`;
        // Each list item clearly labels whether the match is a Degree or Certificate.
      })
      .join('');
      // .join('') concatenates all <li> strings into one continuous string with
      // no separators between them.

    resultListEl.innerHTML = `<ul>${listItems}</ul>`;
    // innerHTML parses the string as HTML and renders it as actual DOM elements.
    // (textContent would display the raw tag characters as visible text instead.)


  } catch (err) {

    // -----------------------------------------------------------------------
    // NETWORK-LEVEL FAILURE HANDLER
    // This catch block only runs if fetch() itself failed — meaning the
    // HTTP connection could not be established at all (server is offline,
    // no internet, DNS failure). It does NOT catch 400/404/500 responses;
    // those are handled above by the response.ok check.
    // -----------------------------------------------------------------------

    statusEl.textContent =
      'Network error. Could not reach the server. Please try again.';
    console.error('fetch() failed:', err);
    // console.error() writes to the browser DevTools console (F12 -> Console tab).
    // It is visible to developers, not end users.
  }
}


// -----------------------------------------------------------------------------
// FUNCTION: simpleClock()
// PURPOSE:  Writes the current date and time into the clock widget at the
//           bottom of index.html. Runs once when the page loads.
// -----------------------------------------------------------------------------

function simpleClock() {
  const d = new Date();
  // new Date() creates a Date object representing the current moment,
  // using the user's local system time and timezone.

  document.getElementById('simpleClock_output').textContent = d;
  // Assigning a Date object to textContent automatically calls Date.toString(),
  // producing a human-readable string like "Sat Feb 28 2026 14:32:01 GMT-0800".
}


// -----------------------------------------------------------------------------
// PAGE LOAD EVENT
// window.onload fires after the entire page has finished loading (HTML, CSS,
// linked scripts). This guarantees the clock element exists in the DOM before
// simpleClock() tries to find it with getElementById().
// -----------------------------------------------------------------------------

window.onload = simpleClock;
// NOTE: No parentheses after simpleClock.
// "simpleClock"   — assigns the function reference. Runs when onload fires. (correct)
// "simpleClock()" — calls the function immediately and assigns its return value
//                   (undefined) to window.onload. Clock never updates.  (incorrect)

// =============================================================================
// script.js
// Client-side JavaScript for the Course Reverse Search application.
//
// ROLE IN THE ARCHITECTURE:
//   This file runs entirely inside the user's browser. It handles:
//     1. Validating the user's input before sending it anywhere.
//     2. Sending the validated input to the Node.js backend via fetch().
//     3. Receiving the JSON response and rendering it on the page.
//
//   This file has NO direct access to the database. It only communicates
//   with server.js over HTTP.
// =============================================================================


// -----------------------------------------------------------------------------
// FUNCTION 1: useRegex(input)
// Validates that the input string matches the expected course code format.
// This is the FIRST line of defense — it runs before any network call is made,
// providing instant feedback to the user without a round-trip to the server.
//
// NOTE: This validation is also duplicated in server.js. Client-side validation
// is for user experience; server-side validation is for security. Both are
// necessary for different reasons.
// -----------------------------------------------------------------------------

function useRegex(input) {
  const regex = /^[A-Za-z]{2,4}\s\d{1,4}[A-Za-z]?$/;
  // Regex pattern breakdown — each token has a specific role:
  //
  //   ^             — Anchor: the match must begin at the very start of the string.
  //                   Prevents inputs like "!!CNIT 120" from matching.
  //
  //   [A-Za-z]{2,4} — Character class: matches 2 to 4 letters (upper or lowercase).
  //                   This captures department codes like "CS", "CNIT", "MATH".
  //
  //   \s            — Whitespace: matches exactly one space character.
  //                   This enforces the required separator between code and number.
  //
  //   \d{1,4}       — Digit class: matches 1 to 4 numeric digits.
  //                   Covers course numbers from "1" up to "9999".
  //
  //   [A-Za-z]?     — Optional letter: the "?" makes this group match 0 or 1 times.
  //                   Handles courses like "CNIT 101A" where a suffix letter exists.
  //
  //   $             — Anchor: the match must end at the very end of the string.
  //                   Prevents inputs like "CNIT 120 extra" from matching.

  return regex.test(input.trim());
  // regex.test() returns a boolean: true if the pattern matches, false otherwise.
  // .trim() removes any leading or trailing whitespace from the input first,
  // so "  CNIT 120  " is treated the same as "CNIT 120".
}


// -----------------------------------------------------------------------------
// FUNCTION 2: handleSubmit(event)
// Called when the user clicks "Submit" on the form in index.html.
// Orchestrates validation, the fetch() request, and rendering the response.
//
// Declared with "async" because it uses "await" internally to pause execution
// while waiting for the fetch() response without freezing the browser tab.
// -----------------------------------------------------------------------------

async function handleSubmit(event) {

  event.preventDefault();
  // The HTML <form> element's default behavior on submit is to reload the page
  // (a full HTTP GET/POST navigation). preventDefault() cancels that default
  // behavior, keeping the user on the current page so JavaScript can handle
  // the submission instead. Without this line, the page would refresh and
  // all state would be lost immediately.


  // ---------------------------------------------------------------------------
  // GATHER DOM REFERENCES
  // document.getElementById() searches the HTML document for an element whose
  // "id" attribute matches the given string. These are used to read input and
  // write output without reloading the page.
  // ---------------------------------------------------------------------------

  const userInput = document.getElementById('user_input').value;
  // Reads the current text in the <input type="text" id="user_input"> field.
  // .value gives the string the user has typed.

  const resultEl = document.getElementById('regex_result');
  // Reference to the <span id="regex_result"> element where feedback is displayed.

  const outputEl = document.getElementById('output');
  // Reference to the <div id="output"> container, initially hidden via CSS
  // (display: none in style.css).


  // ---------------------------------------------------------------------------
  // SHOW OUTPUT CONTAINER
  // Makes the output div visible. Prior to any submission, this div is hidden.
  // ---------------------------------------------------------------------------

  outputEl.style.display = 'block';
  // Overrides the CSS "display: none" rule by setting the inline style directly.
  // "block" causes the element to appear as a standard block-level element.


  // ---------------------------------------------------------------------------
  // CLIENT-SIDE VALIDATION GATE
  // If the input fails the regex test, display an error message and return early.
  // "return" exits the function immediately — the fetch() call below never runs.
  // ---------------------------------------------------------------------------

  if (!useRegex(userInput)) {
    resultEl.textContent =
      'Input does not match the expected format. Try something like "CNIT 120".';
    return;
    // Early return prevents unnecessary network requests for invalid input.
  }


  // ---------------------------------------------------------------------------
  // LOADING STATE
  // Give the user visual confirmation that work is in progress before the
  // asynchronous fetch() call completes. Without this, the UI appears frozen.
  // ---------------------------------------------------------------------------

  resultEl.textContent = 'Searching...';


  // ---------------------------------------------------------------------------
  // FETCH REQUEST
  // fetch() is the browser's built-in API for making HTTP requests from JavaScript.
  // It returns a Promise, so "await" is used to pause here until the server responds.
  //
  // The entire block is wrapped in try/catch to handle network-level failures
  // (e.g., the server is offline) separately from application-level errors
  // (e.g., course not found), which are handled via response.ok below.
  // ---------------------------------------------------------------------------

  try {
    const response = await fetch('/search', {
      // '/search' is a relative URL. Because this page is served by the same
      // Express server (via express.static), this resolves to:
      // http://localhost:3000/search
      // The browser automatically prepends the current host and port.

      method: 'POST',
      // HTTP POST is used rather than GET because data is being sent in the
      // request body. GET requests cannot carry a body by convention, and
      // the course code should not appear in the URL (query string), as
      // URLs are logged by servers and proxies.

      headers: { 'Content-Type': 'application/json' },
      // Tells the server what format the body is in.
      // server.js has express.json() middleware that reads this header
      // to know it should parse the body as JSON.

      body: JSON.stringify({ courseCode: userInput.trim() })
      // JSON.stringify() converts the JavaScript object { courseCode: "CNIT 120" }
      // into the JSON string: '{"courseCode":"CNIT 120"}'
      // This string is sent as the HTTP request body.
      // .trim() removes accidental whitespace before sending.
    });
    // "await" pauses this async function here until the server sends a response.
    // The browser's event loop continues processing other events (clicks, repaints)
    // during this wait — the tab does not freeze.


    const data = await response.json();
    // response.json() reads the response body and parses it from JSON into a
    // JavaScript object. This is also async (it reads a network stream),
    // so "await" is used again.
    //
    // If the server sent: '{"results":[{"degree_name":"Network Security",...}]}'
    // Then data becomes: { results: [{ degree_name: "Network Security", ... }] }


    // -------------------------------------------------------------------------
    // RESPONSE HANDLING
    // response.ok is true for HTTP status codes 200–299 (success range).
    // Codes like 400 (bad request) or 404 (not found) make response.ok false.
    // -------------------------------------------------------------------------

    if (!response.ok) {
      resultEl.textContent = `Error: ${data.error}`;
      // Displays the error message sent by server.js (e.g., "No degrees found...").
      return;
    }

    // -------------------------------------------------------------------------
    // RENDER RESULTS
    // Builds an HTML unordered list from the array of result rows and injects
    // it into the page using innerHTML.
    // -------------------------------------------------------------------------

    const list = data.results
      .map(row => `<li>${row.degree_name ?? ''} — ${row.certificate_name ?? ''}</li>`)
      // .map() transforms each object in the results array into an HTML <li> string.
      // The "??" is the nullish coalescing operator: if row.degree_name is null
      // or undefined, it falls back to an empty string '' instead of showing "null".
      .join('');
      // .join('') concatenates all <li> strings into one string with no separator.

    resultEl.innerHTML = `<ul>${list}</ul>`;
    // innerHTML allows setting HTML markup (not just plain text).
    // textContent (used elsewhere) would escape the HTML tags as literal text.
    // The result is a rendered bulleted list of matching degrees/certificates.

  } catch (err) {
    // This catch block handles network-level failures only — situations where
    // the fetch() itself could not complete (server offline, DNS failure, etc.).
    // HTTP error responses (400, 404, 500) do NOT trigger this catch block;
    // those are handled by the response.ok check above.

    resultEl.textContent = 'Network error. Could not reach the server.';
    console.error(err);
    // console.error() writes to the browser's developer console (F12 → Console tab).
    // It does not display anything to the user — it is for the developer only.
  }
}


// -----------------------------------------------------------------------------
// FUNCTION 3: simpleClock()
// Displays the current date and time in the clock element at the bottom of
// the page. Runs once on page load.
// -----------------------------------------------------------------------------

function simpleClock() {
  const d = new Date();
  // new Date() creates a Date object representing the current moment in time
  // according to the user's local system clock and timezone.

  document.getElementById('simpleClock_output').textContent = d;
  // .textContent sets the visible text of the <span id="simpleClock_output"> element.
  // Assigning a Date object coerces it to a human-readable string automatically
  // via Date.prototype.toString().
}


// -----------------------------------------------------------------------------
// PAGE LOAD EVENT
// Assigns simpleClock as a callback to run when the page finishes loading.
// -----------------------------------------------------------------------------

window.onload = simpleClock;
// window.onload fires after the entire page (HTML, CSS, images) has finished
// loading, guaranteeing that getElementById('simpleClock_output') will find
// its target element.
//
// IMPORTANT: This is written WITHOUT parentheses — "simpleClock", not "simpleClock()".
// With parentheses, JavaScript would immediately CALL the function and assign
// its return value (undefined) to window.onload. Without parentheses, the
// function reference itself is assigned, deferring execution until the load event.

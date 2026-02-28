
function pageLoadFunction() {
  alert("Page is loaded");
}

function useRegex(input) {
    //"use strict";
    let regex = /[A-Za-z0-9]+ [A-Za-z0-9]+/i;
    //let regex = /^[A-Za-z0-9]+ [0-9]+[A-Za-z]$/i; // Example regex: matches "CS 101", "MATH 202", etc.
    //let regex = /^[A-Za-z]{2,4}\s(?:[A-Za-z]\d{1,4}|\d{1,4}[A-Za-z]?|\d{1,4})$;
    return regex.test(input); // return true or false
}

function handleSubmit(event) {
    event.preventDefault();
    const userInput = document.getElementById('user_input').value;
    // document.getElementById('output_text').textContent = userInput;
    document.getElementById('output').style.display = 'block';

    if (useRegex(userInput)) {
        document.getElementById('regex_result').textContent = 'Input matches the regex pattern. Fetching course information...';
    } else {
        document.getElementById('regex_result').textContent = 'Input does NOT match the regex pattern. Try your course name followed by your course number, e.g., "CS 101".';
    }
}

function simpleClock(){
	const d = new Date();
	document.getElementById('simpleClock_output').textContent = d;
}

window.onload = simpleClock();

// simpleClock();
// setInterval(simpleClock, 1000);

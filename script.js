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

function useRegex(input) {
  let regex = /^[A-Za-z0-9]+ [0-9]+[A-Za-z]$/i;; // Example regex: matches "CS 101", "MATH 202", etc.
  return regex.test(input); // return true or false
}

// Update date and time continuously
function updateDateTime() {
  const now = new Date();
  
  // Format date as MM-DD-YYYY
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  const dateString = `${month}-${day}-${year}`;
  
  // Format time as HH:MM:SS with AM/PM
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 12-hour format
  const timeString = `${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
  
  document.getElementById('datetime-text').textContent = `${dateString} | ${timeString}`;
}

// Update immediately and then every second
updateDateTime();
setInterval(updateDateTime, 1000);

/*
function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const meridien = hours >= 12 ? "PM": "AM";
  hours = hours % 12 || 12;
  hours = hours.toString().padStart(2, 0);
  const minutes = now.getMinutes().toString().padStart(2, 0);
  const seconds = now.getSeconds().toString().padStart(2, 0);
  const timeString = `${hours}:${minutes}:${seconds} ${meridien}`;
  document.getElementById("datetime-text").textContent = timeString;
}

updateClock();
setInterval(updateClock, 1000);
*/
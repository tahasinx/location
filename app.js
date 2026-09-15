const refreshBtn = document.getElementById("refreshBtn");
const copyBtn = document.getElementById("copyBtn");
const messageEl = document.getElementById("message");
const resultEl = document.getElementById("result");
const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const mapFrame = document.getElementById("map");

let lastCoords = null;
let locating = false;
let copyResetTimer;

function showMessage(text, ok = false) {
  messageEl.hidden = false;
  messageEl.textContent = text;
  messageEl.classList.toggle("ok", ok);
}

function hideMessage() {
  messageEl.hidden = true;
  messageEl.textContent = "";
  messageEl.classList.remove("ok");
}

function formatCoord(value) {
  return Number(value).toFixed(6);
}

function copyText() {
  if (!lastCoords) return "";
  return `latitude: ${formatCoord(lastCoords.lat)}, longitude: ${formatCoord(lastCoords.lng)}`;
}

function placePin(lat, lng) {
  const q = `${lat},${lng}`;
  mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=k&z=18&ie=UTF8&output=embed`;
}

function onSuccess(position) {
  const { latitude, longitude } = position.coords;

  locating = false;
  hideMessage();
  refreshBtn.classList.remove("busy");
  refreshBtn.disabled = false;
  refreshBtn.textContent = "Refresh";

  lastCoords = { lat: latitude, lng: longitude };
  latEl.textContent = formatCoord(latitude);
  lngEl.textContent = formatCoord(longitude);
  copyBtn.disabled = false;
  resultEl.hidden = false;
  placePin(latitude, longitude);
}

function onError(error) {
  locating = false;
  refreshBtn.classList.remove("busy");
  refreshBtn.disabled = false;
  refreshBtn.textContent = "Refresh";

  const messages = {
    1: "Location was denied. Press Refresh to allow it again, or set Location to Allow in the lock icon next to the URL.",
    2: "Position unavailable. Press Refresh to try again, ideally outdoors with GPS on.",
    3: "Request timed out. Press Refresh to try again."
  };

  showMessage(messages[error.code] || "Could not read your location. Press Refresh to try again.");
}

function requestLocation() {
  if (locating) return;

  if (!navigator.geolocation) {
    showMessage("This browser does not support location.");
    return;
  }

  if (!window.isSecureContext) {
    showMessage("Location needs HTTPS or localhost. Open this page via http://localhost or HTTPS.");
    return;
  }

  locating = true;
  hideMessage();
  refreshBtn.disabled = true;
  refreshBtn.classList.add("busy");
  refreshBtn.textContent = "Finding you…";

  navigator.geolocation.getCurrentPosition(onSuccess, onError, {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 0
  });
}

async function copyCoords() {
  const text = copyText();
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "absolute";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  copyBtn.textContent = "Copied";
  showMessage(text, true);
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copyBtn.textContent = "Copy";
  }, 1600);
}

refreshBtn.addEventListener("click", requestLocation);
copyBtn.addEventListener("click", copyCoords);

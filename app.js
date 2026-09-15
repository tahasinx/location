const refreshBtn = document.getElementById("refreshBtn");
const copyBtn = document.getElementById("copyBtn");
const messageEl = document.getElementById("message");
const blockedPanel = document.getElementById("blockedPanel");
const resultEl = document.getElementById("result");
const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const accEl = document.getElementById("acc");
const mapFrame = document.getElementById("map");

const GEO_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 45000,
  maximumAge: 0
};

const TARGET_ACCURACY_M = 12;
const MAX_WAIT_MS = 25000;

let lastCoords = null;
let locating = false;
let copyResetTimer;
let watchId = null;
let bestPosition = null;
let settleTimer = null;

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

function showBlocked() {
  blockedPanel.hidden = false;
}

function hideBlocked() {
  blockedPanel.hidden = true;
}

function formatCoord(value) {
  return Number(value).toFixed(7);
}

function formatAccuracy(meters) {
  if (!Number.isFinite(meters)) return "GPS precise";
  if (meters < 1) return `± ${(meters * 100).toFixed(0)} cm`;
  return `± ${meters < 10 ? meters.toFixed(1) : Math.round(meters)} m`;
}

function copyText() {
  if (!lastCoords) return "";
  return `latitude: ${formatCoord(lastCoords.lat)}, longitude: ${formatCoord(lastCoords.lng)}`;
}

function mapZoom(accuracy) {
  if (accuracy <= 10) return 21;
  if (accuracy <= 25) return 20;
  if (accuracy <= 50) return 19;
  return 18;
}

function placePin(lat, lng, accuracy) {
  const q = `${lat},${lng}`;
  const z = mapZoom(accuracy);
  mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=k&z=${z}&ie=UTF8&output=embed`;
}

function setFinding() {
  locating = true;
  refreshBtn.disabled = true;
  refreshBtn.classList.add("busy");
  refreshBtn.textContent = "Finding you…";
}

function setButtonIdle(label) {
  locating = false;
  refreshBtn.classList.remove("busy");
  refreshBtn.disabled = false;
  refreshBtn.textContent = label;
}

function stopWatch() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  clearTimeout(settleTimer);
  settleTimer = null;
}

function applyReading(position) {
  const { latitude, longitude, accuracy } = position.coords;

  lastCoords = { lat: latitude, lng: longitude, accuracy };
  latEl.textContent = formatCoord(latitude);
  lngEl.textContent = formatCoord(longitude);
  accEl.textContent = formatAccuracy(accuracy);
  copyBtn.disabled = false;
  resultEl.hidden = false;
}

function finishSuccess(position) {
  stopWatch();
  hideMessage();
  hideBlocked();
  applyReading(position);
  placePin(position.coords.latitude, position.coords.longitude, position.coords.accuracy);
  setButtonIdle("Refresh");
}

function onWatch(position) {
  const accuracy = position.coords.accuracy;
  const isBetter = !bestPosition || accuracy < bestPosition.coords.accuracy;

  if (!isBetter) return;

  const firstFix = !bestPosition;
  bestPosition = position;
  applyReading(position);

  if (firstFix) {
    placePin(position.coords.latitude, position.coords.longitude, accuracy);
  }

  if (accuracy <= TARGET_ACCURACY_M) {
    finishSuccess(bestPosition);
  }
}

function onError(error) {
  if (error?.code === 1) {
    stopWatch();
    setButtonIdle("Refresh");
    showBlocked();
    showMessage("Location was denied. Press Refresh to try again, or set Location to Allow in the address bar.");
    return;
  }

  // Timeouts can fire while GPS is still locking in. Keep waiting for a better fix.
  if (error?.code === 3 && locating) {
    return;
  }

  if (bestPosition) {
    finishSuccess(bestPosition);
    return;
  }

  stopWatch();
  setButtonIdle("Refresh");
  showMessage(
    error?.code === 2
      ? "Position unavailable. Press Refresh to try again, ideally outdoors with GPS on."
      : "High-accuracy GPS timed out. Press Refresh to try again outdoors."
  );
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

  stopWatch();
  bestPosition = null;
  hideMessage();
  hideBlocked();
  setFinding();

  watchId = navigator.geolocation.watchPosition(onWatch, onError, GEO_OPTIONS);

  settleTimer = setTimeout(() => {
    if (bestPosition) {
      finishSuccess(bestPosition);
      return;
    }

    stopWatch();
    setButtonIdle("Refresh");
    showMessage("High-accuracy GPS timed out. Press Refresh to try again outdoors.");
  }, MAX_WAIT_MS);
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

if (navigator.permissions?.query) {
  navigator.permissions.query({ name: "geolocation" }).then((status) => {
    status.onchange = () => {
      if (status.state === "granted" && !lastCoords) {
        requestLocation();
      }
    };
  }).catch(() => {});
}

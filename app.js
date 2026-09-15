const refreshBtn = document.getElementById("refreshBtn");
const copyBtn = document.getElementById("copyBtn");
const messageEl = document.getElementById("message");
const blockedPanel = document.getElementById("blockedPanel");
const resultEl = document.getElementById("result");
const latEl = document.getElementById("lat");
const lngEl = document.getElementById("lng");
const accEl = document.getElementById("acc");
const mapFrame = document.getElementById("map");

const GPS_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0
};

const PRECISE_M = 20;
const REFINE_MS = 5000;

let lastCoords = null;
let locating = false;
let copyResetTimer;
let watchId = null;
let bestPosition = null;
let settleTimer = null;
let requestId = 0;

function isCurrent(id) {
  return locating && id === requestId;
}

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

function isValidCoords(coords) {
  if (!coords) return false;
  const lat = Number(coords.latitude);
  const lng = Number(coords.longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function getAccuracy(coords) {
  const accuracy = Number(coords?.accuracy);
  return Number.isFinite(accuracy) && accuracy > 0 ? accuracy : Infinity;
}

function formatCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(7) : "—";
}

function formatAccuracy(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return "Unknown";
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

function clearMap() {
  mapFrame.src = "about:blank";
}

function placePin(lat, lng, accuracy) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

  const q = `${latitude},${longitude}`;
  const z = mapZoom(accuracy);
  mapFrame.src = `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=k&z=${z}&ie=UTF8&output=embed`;
}

function resetCopyButton() {
  clearTimeout(copyResetTimer);
  copyBtn.textContent = "Copy";
}

function setBusyLabel(label) {
  locating = true;
  refreshBtn.disabled = true;
  refreshBtn.classList.add("busy");
  refreshBtn.textContent = label;
  refreshBtn.setAttribute("aria-busy", "true");
}

function setButtonIdle(label) {
  locating = false;
  refreshBtn.classList.remove("busy");
  refreshBtn.disabled = false;
  refreshBtn.textContent = label;
  refreshBtn.setAttribute("aria-busy", "false");
}

function stopWatch() {
  if (watchId != null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  clearTimeout(settleTimer);
  settleTimer = null;
}

function failRequest(id, message, blocked = false) {
  if (!isCurrent(id)) return;
  stopWatch();
  bestPosition = null;
  lastCoords = null;
  copyBtn.disabled = true;
  resetCopyButton();
  resultEl.hidden = true;
  clearMap();
  setButtonIdle("Refresh");
  if (blocked) showBlocked();
  showMessage(message);
}

function finishSuccess(position, id) {
  if (!isCurrent(id)) return;
  if (!isValidCoords(position?.coords)) {
    failRequest(id, "Got an invalid location reading. Press Refresh to try again.");
    return;
  }

  stopWatch();
  hideMessage();
  hideBlocked();

  const { latitude, longitude } = position.coords;
  const accuracy = getAccuracy(position.coords);

  lastCoords = { lat: latitude, lng: longitude, accuracy };
  latEl.textContent = formatCoord(latitude);
  lngEl.textContent = formatCoord(longitude);
  accEl.textContent = formatAccuracy(accuracy);
  resetCopyButton();
  copyBtn.disabled = false;
  placePin(latitude, longitude, accuracy);
  resultEl.hidden = false;
  setButtonIdle("Refresh");
}

function keepIfBetter(position) {
  const accuracy = getAccuracy(position.coords);
  const bestAccuracy = getAccuracy(bestPosition?.coords);
  if (accuracy > bestAccuracy) return false;
  if (
    accuracy === bestAccuracy &&
    bestPosition &&
    Number(position.timestamp) <= Number(bestPosition.timestamp)
  ) {
    return false;
  }
  bestPosition = position;
  setBusyLabel(`Ensuring accuracy ${formatAccuracy(accuracy)}`);
  return true;
}

function onRefine(position, id) {
  if (!isCurrent(id) || !isValidCoords(position?.coords)) return;
  if (!keepIfBetter(position)) return;
  if (getAccuracy(position.coords) <= PRECISE_M) {
    finishSuccess(bestPosition, id);
  }
}

function startRefine(id) {
  try {
    watchId = navigator.geolocation.watchPosition(
      (position) => onRefine(position, id),
      (error) => {
        if (!isCurrent(id)) return;
        if (error?.code === 1) {
          onError(error, id);
          return;
        }
        if (bestPosition) finishSuccess(bestPosition, id);
      },
      GPS_OPTIONS
    );
  } catch {
    if (bestPosition) finishSuccess(bestPosition, id);
    return;
  }

  settleTimer = setTimeout(() => {
    if (isCurrent(id) && bestPosition) finishSuccess(bestPosition, id);
  }, REFINE_MS);
}

function onPrimaryFix(position, id) {
  if (!isCurrent(id)) return;
  if (!isValidCoords(position?.coords)) {
    failRequest(id, "Got an invalid location reading. Press Refresh to try again.");
    return;
  }

  bestPosition = position;
  const accuracy = getAccuracy(position.coords);
  setBusyLabel(`Ensuring accuracy ${formatAccuracy(accuracy)}`);

  if (accuracy <= PRECISE_M) {
    finishSuccess(position, id);
    return;
  }

  startRefine(id);
}

function onError(error, id) {
  if (!isCurrent(id)) return;

  if (error?.code === 1) {
    failRequest(
      id,
      "Location was denied. Press Refresh to try again, or set Location to Allow in the address bar.",
      true
    );
    return;
  }

  if (bestPosition) {
    finishSuccess(bestPosition, id);
    return;
  }

  failRequest(
    id,
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

  const id = ++requestId;
  stopWatch();
  bestPosition = null;
  lastCoords = null;
  copyBtn.disabled = true;
  resetCopyButton();
  resultEl.hidden = true;
  clearMap();
  hideMessage();
  hideBlocked();
  setBusyLabel("Finding you…");

  try {
    navigator.geolocation.getCurrentPosition(
      (position) => onPrimaryFix(position, id),
      (error) => onError(error, id),
      GPS_OPTIONS
    );
  } catch {
    failRequest(id, "Could not start location. Press Refresh to try again.");
  }
}

function fallbackCopy(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.setAttribute("aria-hidden", "true");
  input.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  input.setSelectionRange(0, text.length);
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  input.remove();
  return ok;
}

async function copyCoords() {
  const text = copyText();
  if (!text || locating) return;

  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch {
    ok = fallbackCopy(text);
  }

  if (!ok) {
    showMessage("Could not copy automatically. Select the coordinates and copy them.");
    return;
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
      if (status.state === "granted" && !lastCoords && !locating) {
        requestLocation();
      }
    };
  }).catch(() => {});
}

window.addEventListener("pagehide", () => {
  requestId += 1;
  stopWatch();
  if (locating) {
    setButtonIdle(lastCoords ? "Refresh" : "Allow location");
  }
});

const chart = document.querySelector("#priceChart");
const priceSetPoint = document.querySelector("#priceSetPoint");
const priceSetPointValue = document.querySelector("#priceSetPointValue");
const thermostat = document.querySelector("#thermostat");
const thermostatValue = document.querySelector("#thermostatValue");
const simulateButton = document.querySelector("#simulateButton");
const personaliseButton = document.querySelector("#personaliseButton");
const periodStatus = document.querySelector("#periodStatus");
const heatingStatus = document.querySelector("#heatingStatus");
const electricPipe = document.querySelector("#electricPipe");
const gridNode = document.querySelector(".grid-node");
const tankHeat = document.querySelector("#tankHeat");
const auxTank = document.querySelector("#auxTank");
const regularWater = document.querySelector("#regularWater");
const showerButton = document.querySelector("#showerButton");
const thermostatMarker = document.querySelector("#thermostatMarker");
const tempReadout = document.querySelector("#tempReadout");
const tankState = document.querySelector("#tankState");
const timeReadout = document.querySelector("#timeReadout");
const priceReadout = document.querySelector("#priceReadout");
const chartPriceReadout = document.querySelector("#chartPriceReadout");

const chartBox = {
  left: 78,
  right: 960,
  top: 34,
  bottom: 360,
  width: 882,
  height: 326,
};

const ambientTemp = 30;
const startingTankTemp = 45;
const simulationHours = 24;
const simulationMs = 24000;
const coolingRatePerHour = ambientTemp / 24;
let tankTemp = startingTankTemp;
let regularLevel = 76;
let auxReserveLevel = 50;
let showerMode = "ready-to-drain";
let activeShowerMode = null;
let showerAnimationId = null;
let showerLastFrame = null;
let simulatedHour = getCurrentHourDecimal();
let animationFrameId = null;
let lastFrameTime = null;
let isRunning = false;
let activeDrag = null;

const data = buildNemLikePriceData();
const priceDomain = getPriceDomain(data);

function buildNemLikePriceData() {
  const points = [];
  for (let i = 0; i <= 288; i += 1) {
    const hour = i / 12;
    const morningPeak = gaussian(hour, 7.7, 1.35) * 120;
    const eveningPeak = gaussian(hour, 18.35, 1.55) * 175;
    const solarDip = gaussian(hour, 12.9, 2.15) * 92;
    const nightDip = gaussian(hour, 2.5, 2.2) * 44;
    const ripple = Math.sin(hour * 1.7) * 16 + Math.cos(hour * 3.2) * 9;
    const price = Math.round(92 + morningPeak + eveningPeak - solarDip - nightDip + ripple);
    points.push({ hour, price });
  }
  return points;
}

function gaussian(x, mean, spread) {
  return Math.exp(-((x - mean) ** 2) / (2 * spread ** 2));
}

function getPriceDomain(points) {
  const prices = points.map((point) => point.price);
  const min = Math.min(-100, Math.min(...prices) - 35);
  const max = Math.max(450, Math.max(...prices) + 35);
  return { min, max };
}

function getCurrentHourDecimal() {
  const now = new Date();
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
}

function xScale(hour) {
  return chartBox.left + (hour / 24) * chartBox.width;
}

function yScale(price) {
  const ratio = (price - priceDomain.min) / (priceDomain.max - priceDomain.min);
  return chartBox.bottom - ratio * chartBox.height;
}

function priceFromY(y) {
  const ratio = (chartBox.bottom - y) / chartBox.height;
  return priceDomain.min + ratio * (priceDomain.max - priceDomain.min);
}

function hourFromX(x) {
  return ((x - chartBox.left) / chartBox.width) * 24;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatHour(hour) {
  const normalized = ((hour % 24) + 24) % 24;
  const wholeHours = Math.floor(normalized);
  const minutes = Math.floor((normalized - wholeHours) * 60);
  return `${String(wholeHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatPrice(price) {
  return `$${Math.round(price)}/MWh`;
}

function getPriceAtHour(hour) {
  const boundedHour = Math.max(0, Math.min(24, hour));
  const index = boundedHour * 12;
  const lowIndex = Math.floor(index);
  const highIndex = Math.min(data.length - 1, lowIndex + 1);
  const mix = index - lowIndex;
  return data[lowIndex].price + (data[highIndex].price - data[lowIndex].price) * mix;
}

function pointsToPath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xScale(point.hour).toFixed(2)} ${yScale(point.price).toFixed(2)}`)
    .join(" ");
}

function areaPath(points) {
  const line = pointsToPath(points);
  return `${line} L ${xScale(24)} ${chartBox.bottom} L ${xScale(0)} ${chartBox.bottom} Z`;
}

function renderChart() {
  const setPoint = Number(priceSetPoint.value);
  const currentHour = getCurrentHourDecimal();
  const simPrice = getPriceAtHour(simulatedHour);
  const setPointY = yScale(setPoint);
  const currentX = xScale(currentHour);
  const simX = xScale(simulatedHour);
  const simY = yScale(simPrice);
  const yTicks = [-100, 0, 100, 200, 300, 400];
  const xTicks = [0, 6, 12, 18, 24];

  chart.innerHTML = `
    <defs>
      <linearGradient id="priceFill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stop-color="#1769aa" stop-opacity="0.24"></stop>
        <stop offset="100%" stop-color="#1769aa" stop-opacity="0.02"></stop>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="1000" height="430" fill="transparent"></rect>
    ${yTicks
      .map(
        (tick) => `
          <line class="chart-grid" x1="${chartBox.left}" x2="${chartBox.right}" y1="${yScale(tick)}" y2="${yScale(tick)}"></line>
          <text class="axis-text" x="28" y="${yScale(tick) + 7}">${formatPrice(tick)}</text>
        `,
      )
      .join("")}
    ${xTicks
      .map(
        (tick) => `
          <line class="chart-grid" x1="${xScale(tick)}" x2="${xScale(tick)}" y1="${chartBox.top}" y2="${chartBox.bottom}"></line>
          <text class="axis-text" x="${xScale(tick) - 28}" y="404">${formatHour(tick)}</text>
        `,
      )
      .join("")}
    <path class="price-area" d="${areaPath(data)}" fill="url(#priceFill)"></path>
    <path class="price-line" d="${pointsToPath(data)}"></path>
    <rect class="drag-hit-area" data-drag-target="price" x="${chartBox.left}" y="${setPointY - 18}" width="${chartBox.width}" height="36"></rect>
    <line class="setpoint-line" data-drag-target="price" x1="${chartBox.left}" x2="${chartBox.right}" y1="${setPointY}" y2="${setPointY}"></line>
    <circle class="drag-handle" data-drag-target="price" cx="${chartBox.right - 22}" cy="${setPointY}" r="11"></circle>
    <text class="setpoint-label" x="${chartBox.right - 224}" y="${Math.max(chartBox.top + 22, setPointY - 12)}">Price set point</text>
    <line class="current-time-line" x1="${currentX}" x2="${currentX}" y1="${chartBox.top}" y2="${chartBox.bottom}"></line>
    <text class="marker-label" x="${Math.min(currentX + 10, chartBox.right - 130)}" y="${chartBox.top + 24}">Current time</text>
    <rect class="drag-hit-area" data-drag-target="time" x="${simX - 18}" y="${chartBox.top}" width="36" height="${chartBox.height}"></rect>
    <line class="sim-time-line" data-drag-target="time" x1="${simX}" x2="${simX}" y1="${chartBox.top}" y2="${chartBox.bottom}"></line>
    <circle class="marker-dot" data-drag-target="time" cx="${simX}" cy="${simY}" r="10"></circle>
    <text class="marker-label" x="${Math.min(simX + 12, chartBox.right - 150)}" y="${Math.max(chartBox.top + 58, simY - 14)}">Time bar</text>
  `;
}

function updateState(deltaHours = 0) {
  const setPoint = Number(priceSetPoint.value);
  const target = Number(thermostat.value);
  const price = getPriceAtHour(simulatedHour);
  const cheapPeriod = price <= setPoint;
  const canRaiseTemperature = cheapPeriod && tankTemp < target;

  if (deltaHours > 0) {
    if (canRaiseTemperature) {
      tankTemp += 5 * deltaHours;
      auxReserveLevel = Math.min(100, auxReserveLevel + 10 * deltaHours);
    } else {
      tankTemp -= coolingRatePerHour * deltaHours;
    }
  }

  tankTemp = Math.max(ambientTemp, Math.min(target, tankTemp));
  const tempFillPercent = ((tankTemp - ambientTemp) / (60 - ambientTemp)) * 100;
  const auxFillPercent = Math.max(8, Math.min(auxReserveLevel, tempFillPercent));

  priceSetPointValue.textContent = formatPrice(setPoint);
  thermostatValue.textContent = `${target}°C`;
  if (timeReadout) {
    timeReadout.textContent = formatHour(simulatedHour);
  }
  if (priceReadout) {
    priceReadout.textContent = formatPrice(price);
  }
  chartPriceReadout.textContent = formatPrice(price);
  tempReadout.textContent = `${Math.round(tankTemp)}°C`;
  tankState.textContent = `${Math.round(tankTemp)}°C / ${target}°C target`;
  tankHeat.style.height = `${Math.max(12, auxFillPercent)}%`;
  regularWater.style.height = `${regularLevel}%`;
  thermostatMarker.style.top = `${100 - ((target - ambientTemp) / (60 - ambientTemp)) * 100}%`;
  thermostatMarker.setAttribute("aria-valuenow", String(target));

  periodStatus.className = `status-pill ${cheapPeriod ? "status-cheap" : "status-peak"}`;
  periodStatus.textContent = cheapPeriod ? "cheap off-peak period in effect" : "peak-usage period in effect";

  heatingStatus.className = `status-pill ${cheapPeriod ? "status-heating" : "status-idle"}`;
  heatingStatus.textContent = cheapPeriod ? "heating" : "standby";
  electricPipe.classList.toggle("is-heating", cheapPeriod);
  gridNode.classList.toggle("is-heating", cheapPeriod);
  auxTank.classList.toggle("is-heating", cheapPeriod);
}

function stopShowerAnimation() {
  if (showerAnimationId) {
    cancelAnimationFrame(showerAnimationId);
  }
  showerAnimationId = null;
  showerLastFrame = null;
  activeShowerMode = null;
  showerButton.classList.remove("is-dripping");
}

function animateShower(mode) {
  stopShowerAnimation();
  activeShowerMode = mode;
  showerMode = mode;
  showerButton.classList.toggle("is-dripping", mode === "drain");
  showerLastFrame = performance.now();

  const tick = (now) => {
    const deltaSeconds = Math.min(0.08, (now - showerLastFrame) / 1000);
    showerLastFrame = now;

    if (mode === "drain") {
      regularLevel = Math.max(36, regularLevel - 18 * deltaSeconds);
      if (regularLevel <= 36) {
        stopShowerAnimation();
        showerMode = "ready-to-refill";
      }
    }

    if (mode === "refill") {
      const transfer = Math.min(20 * deltaSeconds, 100 - regularLevel);
      regularLevel = Math.min(100, regularLevel + transfer);
      auxReserveLevel = Math.max(8, auxReserveLevel - transfer * 0.6);
      tankTemp = Math.max(ambientTemp, ambientTemp + (auxReserveLevel / 100) * (Number(thermostat.value) - ambientTemp));

      if (regularLevel >= 100) {
        stopShowerAnimation();
        showerMode = "ready-to-drain";
      }
    }

    updateState(0);

    if (showerAnimationId) {
      showerAnimationId = requestAnimationFrame(tick);
    }
  };

  showerAnimationId = requestAnimationFrame(tick);
}

function chartPointFromEvent(event) {
  const rect = chart.getBoundingClientRect();
  const point = chart.createSVGPoint();
  point.x = event.clientX - rect.left;
  point.y = event.clientY - rect.top;
  const viewX = (point.x / rect.width) * 1000;
  const viewY = (point.y / rect.height) * 430;
  return { x: viewX, y: viewY };
}

function setPriceFromPointer(event) {
  const point = chartPointFromEvent(event);
  const rawPrice = priceFromY(clamp(point.y, chartBox.top, chartBox.bottom));
  const steppedPrice = Math.round(rawPrice / 5) * 5;
  priceSetPoint.value = String(clamp(steppedPrice, Number(priceSetPoint.min), Number(priceSetPoint.max)));
  updateState(0);
  renderChart();
}

function setTimeFromPointer(event) {
  if (isRunning) {
    cancelAnimationFrame(animationFrameId);
    isRunning = false;
    simulateButton.innerHTML = '<span class="play-icon" aria-hidden="true"></span>Simulate';
  }
  const point = chartPointFromEvent(event);
  simulatedHour = clamp(hourFromX(point.x), 0, 24);
  updateState(0);
  renderChart();
}

function setThermostatFromPointer(event) {
  const rect = auxTank.getBoundingClientRect();
  const y = clamp(event.clientY - rect.top, 0, rect.height);
  const invertedRatio = 1 - y / rect.height;
  const target = Math.round(ambientTemp + invertedRatio * (60 - ambientTemp));
  thermostat.value = String(clamp(target, Number(thermostat.min), Number(thermostat.max)));
  tankTemp = Math.min(tankTemp, Number(thermostat.value));
  updateState(0);
}

function beginChartDrag(event) {
  const target = event.target.closest("[data-drag-target]")?.dataset.dragTarget;
  if (!target) {
    return;
  }
  event.preventDefault();
  activeDrag = target;
  if (target === "price") {
    setPriceFromPointer(event);
  }
  if (target === "time") {
    setTimeFromPointer(event);
  }
}

function moveActiveDrag(event) {
  if (activeDrag === "price") {
    setPriceFromPointer(event);
  }
  if (activeDrag === "time") {
    setTimeFromPointer(event);
  }
  if (activeDrag === "thermostat") {
    setThermostatFromPointer(event);
  }
}

function endActiveDrag() {
  activeDrag = null;
}

function startSimulation() {
  if (isRunning) {
    cancelAnimationFrame(animationFrameId);
    resetSimulation();
    return;
  }

  isRunning = true;
  simulateButton.textContent = "Reset";
  simulatedHour = 0;
  tankTemp = startingTankTemp;
  regularLevel = 76;
  auxReserveLevel = 50;
  showerMode = "ready-to-drain";
  stopShowerAnimation();
  lastFrameTime = performance.now();
  const start = lastFrameTime;

  const tick = (now) => {
    const elapsed = now - start;
    const deltaHours = ((now - lastFrameTime) / simulationMs) * simulationHours;
    lastFrameTime = now;
    simulatedHour = Math.min(simulationHours, (elapsed / simulationMs) * simulationHours);
    updateState(deltaHours);
    renderChart();

    if (elapsed < simulationMs) {
      animationFrameId = requestAnimationFrame(tick);
    } else {
      isRunning = false;
      simulateButton.innerHTML = '<span class="play-icon" aria-hidden="true"></span>Simulate';
    }
  };

  animationFrameId = requestAnimationFrame(tick);
}

function resetSimulation() {
  isRunning = false;
  simulatedHour = 0;
  tankTemp = startingTankTemp;
  regularLevel = 76;
  auxReserveLevel = 50;
  showerMode = "ready-to-drain";
  stopShowerAnimation();
  simulateButton.innerHTML = '<span class="play-icon" aria-hidden="true"></span>Simulate';
  updateState(0);
  renderChart();
}

priceSetPoint.addEventListener("input", () => {
  updateState(0);
  renderChart();
});

personaliseButton.addEventListener("click", () => {
  const priceMin = Number(priceSetPoint.min);
  const priceMax = Number(priceSetPoint.max);
  const thermostatMin = Number(thermostat.min);
  const thermostatMax = Number(thermostat.max);

  priceSetPoint.value = String(Math.round((priceMin + (priceMax - priceMin) * 0.8) / 5) * 5);
  thermostat.value = String(Math.round(thermostatMin + (thermostatMax - thermostatMin) * 0.8));
  tankTemp = Math.min(tankTemp, Number(thermostat.value));
  updateState(0);
  renderChart();
});

thermostat.addEventListener("input", () => {
  tankTemp = Math.min(tankTemp, Number(thermostat.value));
  updateState(0);
});

simulateButton.addEventListener("click", startSimulation);

showerButton.addEventListener("click", () => {
  if (showerAnimationId) {
    if (activeShowerMode === "drain") {
      animateShower("refill");
      return;
    }
    stopShowerAnimation();
    return;
  }
  if (showerMode === "ready-to-refill") {
    animateShower("refill");
  } else {
    animateShower("drain");
  }
});

chart.addEventListener("pointerdown", (event) => {
  beginChartDrag(event);
  if (!activeDrag) {
    return;
  }
  chart.setPointerCapture(event.pointerId);
});

chart.addEventListener("pointermove", (event) => {
  moveActiveDrag(event);
});

chart.addEventListener("pointerup", (event) => {
  endActiveDrag();
  if (chart.hasPointerCapture(event.pointerId)) {
    chart.releasePointerCapture(event.pointerId);
  }
});

chart.addEventListener("pointercancel", () => {
  endActiveDrag();
});

chart.addEventListener("mousedown", beginChartDrag);
window.addEventListener("mousemove", moveActiveDrag);
window.addEventListener("mouseup", endActiveDrag);

thermostatMarker.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  activeDrag = "thermostat";
  thermostatMarker.setPointerCapture(event.pointerId);
  setThermostatFromPointer(event);
});

thermostatMarker.addEventListener("pointermove", (event) => {
  moveActiveDrag(event);
});

thermostatMarker.addEventListener("pointerup", (event) => {
  endActiveDrag();
  if (thermostatMarker.hasPointerCapture(event.pointerId)) {
    thermostatMarker.releasePointerCapture(event.pointerId);
  }
});

thermostatMarker.addEventListener("pointercancel", () => {
  endActiveDrag();
});

thermostatMarker.addEventListener("mousedown", (event) => {
  event.preventDefault();
  activeDrag = "thermostat";
  setThermostatFromPointer(event);
});

auxTank.addEventListener("mousedown", (event) => {
  if (!event.target.closest("#thermostatMarker")) {
    return;
  }
  event.preventDefault();
  activeDrag = "thermostat";
  setThermostatFromPointer(event);
});

thermostatMarker.addEventListener("keydown", (event) => {
  if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const current = Number(thermostat.value);
  if (event.key === "ArrowUp") {
    thermostat.value = String(clamp(current + 1, 30, 60));
  }
  if (event.key === "ArrowDown") {
    thermostat.value = String(clamp(current - 1, 30, 60));
  }
  if (event.key === "Home") {
    thermostat.value = "30";
  }
  if (event.key === "End") {
    thermostat.value = "60";
  }
  tankTemp = Math.min(tankTemp, Number(thermostat.value));
  updateState(0);
});

updateState(0);
renderChart();

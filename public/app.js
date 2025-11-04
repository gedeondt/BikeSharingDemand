const scenarioSelect = document.getElementById('scenario');
const daysInput = document.getElementById('days');
const form = document.getElementById('query-form');
const feedback = document.getElementById('feedback');
const detailPanel = document.getElementById('station-details');
const stationNameElement = document.getElementById('station-name');
const stationSummaryElement = document.getElementById('station-summary');
const closeDetailsButton = document.getElementById('close-details');
const chartCanvas = document.getElementById('station-chart');

let map;
let markersLayer;
let demandChart;
let lastScenarioMeta = null;

function setFeedback(message, variant = 'info') {
  feedback.textContent = message;
  feedback.dataset.variant = variant;
}

function toggleFormDisabled(disabled) {
  Array.from(form.elements).forEach((element) => {
    element.disabled = disabled;
  });
}

function initMap() {
  map = L.map('map');
  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:
      '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });
  tileLayer.addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  map.setView([40.4168, -3.7038], 12);
}

function getMarkerColor(bikes, capacity) {
  if (!capacity) {
    return '#95a5a6';
  }
  const ratio = bikes / capacity;
  if (ratio >= 0.66) return '#2ecc71';
  if (ratio >= 0.33) return '#f1c40f';
  return '#e74c3c';
}

function createMarker(station) {
  if (!station.location || typeof station.location.lat !== 'number' || typeof station.location.lng !== 'number') {
    return null;
  }

  const marker = L.circleMarker([station.location.lat, station.location.lng], {
    radius: 12,
    color: '#1f2933',
    weight: 1,
    fillColor: getMarkerColor(station.bikesAvailable, station.capacity),
    fillOpacity: 0.85,
  });

  const popupContent = `
    <strong>${station.name}</strong><br />
    Bicis disponibles: ${station.bikesAvailable} / ${station.capacity}
  `;
  marker.bindPopup(popupContent);
  marker.on('click', () => {
    showStationDetails(station);
  });

  return marker;
}

function computeAverageTrips(station) {
  if (!station.hourlyAverageDemand || !station.hourlyAverageDemand.length) {
    return 0;
  }

  const total = station.hourlyAverageDemand.reduce((sum, item) => sum + item.averageTrips, 0);
  return total / station.hourlyAverageDemand.length;
}

function showStationDetails(station) {
  stationNameElement.textContent = station.name;
  const avgTrips = computeAverageTrips(station);
  stationSummaryElement.textContent = `Capacidad total: ${station.capacity} bicicletas. Disponibles estimadas: ${station.bikesAvailable}. Demanda media por hora (últimos ${Math.min(7, Number(daysInput.value))} días): ${avgTrips.toFixed(1)} trayectos.`;

  const labels = station.hourlyAverageDemand.map((item) => `${String(item.hour).padStart(2, '0')}:00`);
  const values = station.hourlyAverageDemand.map((item) => item.averageTrips);

  if (demandChart) {
    demandChart.destroy();
  }

  demandChart = new Chart(chartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Demanda media (entradas + salidas)',
          data: values,
          borderColor: '#1f8ef1',
          backgroundColor: 'rgba(31, 142, 241, 0.25)',
          tension: 0.3,
          fill: true,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
          },
          title: {
            display: true,
            text: 'Viajes por hora',
          },
        },
        x: {
          title: {
            display: true,
            text: 'Hora del día',
          },
        },
      },
      plugins: {
        legend: {
          display: false,
        },
        tooltip: {
          callbacks: {
            label(context) {
              return `${context.parsed.y.toFixed(2)} viajes`;
            },
          },
        },
        title: {
          display: Boolean(lastScenarioMeta),
          text: lastScenarioMeta
            ? `${lastScenarioMeta.name} · ${lastScenarioMeta.city}`.trim()
            : 'Demanda media',
        },
      },
    },
  });

  detailPanel.hidden = false;
}

function hideStationDetails() {
  detailPanel.hidden = true;
  stationNameElement.textContent = '';
  stationSummaryElement.textContent = '';
  if (demandChart) {
    demandChart.destroy();
    demandChart = null;
  }
}

closeDetailsButton.addEventListener('click', hideStationDetails);

function renderStations(data) {
  markersLayer.clearLayers();
  hideStationDetails();
  lastScenarioMeta = data.scenario;

  const stationsWithLocation = data.stations.filter(
    (station) => station.location && typeof station.location.lat === 'number' && typeof station.location.lng === 'number'
  );

  if (!stationsWithLocation.length) {
    setFeedback('No se encontraron estaciones con localización para este escenario.', 'warning');
    return;
  }

  const bounds = L.latLngBounds(
    stationsWithLocation.map((station) => [station.location.lat, station.location.lng])
  );

  stationsWithLocation.forEach((station) => {
    const marker = createMarker(station);
    if (marker) {
      marker.addTo(markersLayer);
    }
  });

  map.fitBounds(bounds, { padding: [48, 48] });
}

async function loadScenarios() {
  try {
    const response = await fetch('/api/scenarios');
    if (!response.ok) {
      throw new Error('No se pudieron cargar los escenarios.');
    }
    const data = await response.json();
    scenarioSelect.innerHTML = '';
    data.scenarios.forEach((scenario) => {
      const option = document.createElement('option');
      option.value = scenario.id;
      option.textContent = scenario.name;
      scenarioSelect.append(option);
    });

    if (scenarioSelect.options.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No hay escenarios disponibles';
      scenarioSelect.append(option);
      scenarioSelect.disabled = true;
      toggleFormDisabled(true);
      setFeedback('No hay escenarios disponibles.');
    } else if (!feedback.textContent) {
      setFeedback('Selecciona un escenario y pulsa "Generar histórico".');
    }
  } catch (error) {
    console.error(error);
    setFeedback('No se pudo obtener la lista de escenarios.', 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!scenarioSelect.value) {
    setFeedback('Selecciona un escenario válido.', 'error');
    return;
  }

  toggleFormDisabled(true);
  setFeedback('Generando histórico…');

  try {
    const params = new URLSearchParams({
      scenario: scenarioSelect.value,
      days: daysInput.value,
    });
    const response = await fetch(`/api/generate?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'No se pudo generar el histórico.');
    }

    renderStations(data);
    if (data.range) {
      const start = new Date(data.range.start);
      const end = new Date(data.range.end);
      const formatter = new Intl.DateTimeFormat('es-ES', {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
      setFeedback(
        `Histórico generado para ${data.scenario.name} del ${formatter.format(start)} al ${formatter.format(end)}.`
      );
    } else {
      setFeedback('No se recibieron datos del generador.', 'warning');
    }
  } catch (error) {
    console.error(error);
    setFeedback(error.message, 'error');
  } finally {
    toggleFormDisabled(false);
  }
});

initMap();
loadScenarios();

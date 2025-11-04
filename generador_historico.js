#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const HOURS_IN_DAY = 24;
const MS_IN_HOUR = 60 * 60 * 1000;

const [, , scenarioName, daysArg] = process.argv;

if (!scenarioName || !daysArg) {
  console.error('Uso: node generador_historico.js <escenario> <dias_hacia_atras>');
  process.exit(1);
}

const daysBack = Number(daysArg);

if (!Number.isInteger(daysBack) || daysBack < 1) {
  console.error('El parámetro <dias_hacia_atras> debe ser un entero positivo.');
  process.exit(1);
}

const scenarioPath = path.join(__dirname, 'escenarios', `${scenarioName}.json`);

if (!fs.existsSync(scenarioPath)) {
  console.error(`No se encontró el escenario en ${scenarioPath}`);
  process.exit(1);
}

const scenarioContent = fs.readFileSync(scenarioPath, 'utf-8');
let scenario;

try {
  scenario = JSON.parse(scenarioContent);
} catch (error) {
  console.error(`No se pudo parsear el escenario: ${error.message}`);
  process.exit(1);
}

if (!scenario.parking_points || !Array.isArray(scenario.parking_points)) {
  console.error('El escenario no contiene la lista de "parking_points".');
  process.exit(1);
}

const parkingPoints = scenario.parking_points.map((point, index) => {
  if (typeof point.id !== 'string' || !point.id.trim()) {
    console.error(`El punto de estacionamiento en la posición ${index} no tiene un id válido.`);
    process.exit(1);
  }

  if (typeof point.total_stands !== 'number' || point.total_stands <= 0) {
    console.error(`El punto ${point.id} no tiene un "total_stands" válido.`);
    process.exit(1);
  }

  const initialBikes = typeof point.initial_bikes === 'number'
    ? point.initial_bikes
    : Math.round(point.total_stands * 0.5);

  if (initialBikes < 0 || initialBikes > point.total_stands) {
    console.error(`El punto ${point.id} tiene un "initial_bikes" fuera de rango.`);
    process.exit(1);
  }

  return {
    id: point.id,
    name: point.name || point.id,
    capacity: point.total_stands,
    bikes: initialBikes,
  };
});

const maxCapacity = parkingPoints.reduce((max, point) => Math.max(max, point.capacity), 0);

const hourlyActivity = [
  0.10, 0.06, 0.04, 0.03, 0.03, 0.05, 0.12, 0.26, 0.34, 0.30, 0.28, 0.26,
  0.22, 0.20, 0.18, 0.20, 0.24, 0.32, 0.38, 0.30, 0.24, 0.18, 0.14, 0.12,
];

const hourlyNetBias = [
  0.18, 0.12, 0.08, 0.02, -0.05, -0.18, -0.40, -0.36, -0.22, -0.04, 0.06, 0.12,
  0.16, 0.10, 0.02, -0.04, -0.08, -0.06, 0.12, 0.24, 0.28, 0.20, 0.16, 0.12,
];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function generateForHour(hourIndex, timestamp) {
  const results = [];

  parkingPoints.forEach((point) => {
    const activity = hourlyActivity[hourIndex % HOURS_IN_DAY];
    const bias = hourlyNetBias[hourIndex % HOURS_IN_DAY];
    const scale = 0.55 + 0.45 * (point.capacity / maxCapacity);
    const variability = randomBetween(0.75, 1.25);

    let totalTrips = Math.round(activity * scale * point.capacity * variability);
    totalTrips = Math.max(totalTrips, 0);

    const desiredNet = Math.round(totalTrips * bias);
    const limitedNet = Math.max(-totalTrips, Math.min(totalTrips, desiredNet));

    let entries = Math.round((totalTrips + limitedNet) / 2);
    let exits = totalTrips - entries;

    entries = Math.max(entries, 0);
    exits = Math.max(exits, 0);

    if (exits > point.bikes) {
      exits = point.bikes;
    }

    const bikesAfterExits = point.bikes - exits;
    const availableSlots = point.capacity - bikesAfterExits;

    if (entries > availableSlots) {
      entries = availableSlots;
    }

    point.bikes = bikesAfterExits + entries;

    results.push({
      stationId: point.id,
      stationName: point.name,
      timestamp,
      entries,
      exits,
    });
  });

  return results;
}

const now = new Date();
now.setMinutes(0, 0, 0);
now.setHours(0, 0, 0, 0);

const startDate = new Date(now.getTime() - (daysBack - 1) * HOURS_IN_DAY * MS_IN_HOUR);

const rows = [];

for (let dayIndex = 0; dayIndex < daysBack; dayIndex += 1) {
  for (let hour = 0; hour < HOURS_IN_DAY; hour += 1) {
    const timestamp = new Date(startDate.getTime() + (dayIndex * HOURS_IN_DAY + hour) * MS_IN_HOUR).toISOString();
    const hourResults = generateForHour(hour, timestamp);
    rows.push(...hourResults);
  }
}

console.log('station_id,station_name,timestamp,entries,exits');
rows.forEach((row) => {
  console.log(`${row.stationId},${row.stationName},${row.timestamp},${row.entries},${row.exits}`);
});

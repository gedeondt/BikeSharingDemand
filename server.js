const http = require('http');
const path = require('path');
const fs = require('fs');
const url = require('url');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SCENARIOS_DIR = path.join(__dirname, 'escenarios');
const GENERATOR_PATH = path.join(__dirname, 'generador_historico.js');
const HOURS_IN_DAY = 24;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

function serveStatic(req, res, pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^\.\/+/, '');
  const filePath = path.join(PUBLIC_DIR, normalizedPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      sendText(res, 404, 'Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    stream.on('error', (streamErr) => {
      console.error('Error al leer archivo estático:', streamErr);
      if (!res.headersSent) {
        sendText(res, 500, 'Error interno del servidor');
      } else {
        res.destroy(streamErr);
      }
    });
  });
}

function loadScenario(scenarioName) {
  return new Promise((resolve, reject) => {
    const scenarioPath = path.join(SCENARIOS_DIR, `${scenarioName}.json`);
    fs.readFile(scenarioPath, 'utf-8', (err, data) => {
      if (err) {
        reject(new Error('Escenario no encontrado'));
        return;
      }

      try {
        const scenario = JSON.parse(data);
        resolve(scenario);
      } catch (parseError) {
        reject(new Error('Escenario con formato inválido'));
      }
    });
  });
}

function listScenarios() {
  return new Promise((resolve, reject) => {
    fs.readdir(SCENARIOS_DIR, (err, files) => {
      if (err) {
        reject(err);
        return;
      }

      const scenarios = [];

      files.filter((file) => file.endsWith('.json')).forEach((file) => {
        try {
          const content = fs.readFileSync(path.join(SCENARIOS_DIR, file), 'utf-8');
          const scenario = JSON.parse(content);
          scenarios.push({
            id: path.basename(file, '.json'),
            name: scenario.name || path.basename(file, '.json'),
            description: scenario.description || '',
            parkingPoints: Array.isArray(scenario.parking_points) ? scenario.parking_points.length : 0,
          });
        } catch (error) {
          console.error(`No se pudo cargar el escenario ${file}:`, error.message);
        }
      });

      resolve(scenarios);
    });
  });
}

function runGenerator(scenarioName, days) {
  return new Promise((resolve, reject) => {
    const generator = spawn('node', [GENERATOR_PATH, scenarioName, String(days)], {
      cwd: __dirname,
    });

    let stdout = '';
    let stderr = '';

    generator.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    generator.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    generator.on('error', (error) => {
      reject(error);
    });

    generator.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Generador finalizó con código ${code}`));
        return;
      }

      resolve(stdout);
    });
  });
}

function parseGeneratorOutput(csvText, scenario, days) {
  const trimmed = csvText.trim();
  if (!trimmed) {
    return { rows: [], stations: [] };
  }

  const lines = trimmed.split(/\r?\n/);
  lines.shift(); // remove header

  const rows = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [stationId, stationName, timestamp, entriesStr, exitsStr] = line.split(',');
      return {
        stationId,
        stationName,
        timestamp,
        entries: Number(entriesStr),
        exits: Number(exitsStr),
      };
    })
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const stationMap = new Map();

  scenario.parking_points.forEach((point) => {
    stationMap.set(point.id, {
      id: point.id,
      name: point.name || point.id,
      location: point.location || null,
      capacity: point.total_stands || 0,
      initialBikes: typeof point.initial_bikes === 'number' ? point.initial_bikes : Math.round((point.total_stands || 0) * 0.5),
      bikesAvailable: typeof point.initial_bikes === 'number' ? point.initial_bikes : Math.round((point.total_stands || 0) * 0.5),
      currentBikes: typeof point.initial_bikes === 'number' ? point.initial_bikes : Math.round((point.total_stands || 0) * 0.5),
      history: [],
    });
  });

  rows.forEach((row) => {
    const station = stationMap.get(row.stationId);
    if (!station) {
      return;
    }

    station.currentBikes -= row.exits;
    if (station.currentBikes < 0) {
      station.currentBikes = 0;
    }
    station.currentBikes += row.entries;
    if (station.currentBikes > station.capacity) {
      station.currentBikes = station.capacity;
    }

    station.history.push({
      timestamp: row.timestamp,
      entries: row.entries,
      exits: row.exits,
      bikesAvailable: station.currentBikes,
    });
  });

  stationMap.forEach((station) => {
    const relevantHistoryLength = Math.min(station.history.length, HOURS_IN_DAY * Math.min(days, 7));
    const relevantHistory = station.history.slice(-relevantHistoryLength);
    const hourlyBuckets = Array.from({ length: HOURS_IN_DAY }, (_, hour) => ({
      hour,
      totalTrips: 0,
      count: 0,
    }));

    relevantHistory.forEach((entry) => {
      const hour = new Date(entry.timestamp).getUTCHours();
      const bucket = hourlyBuckets[hour];
      const trips = entry.entries + entry.exits;
      bucket.totalTrips += trips;
      bucket.count += 1;
    });

    station.hourlyAverageDemand = hourlyBuckets.map((bucket) => ({
      hour: bucket.hour,
      averageTrips: bucket.count === 0 ? 0 : Number((bucket.totalTrips / bucket.count).toFixed(2)),
    }));

    station.bikesAvailable = station.currentBikes;
    delete station.currentBikes;
  });

  return {
    rows,
    stations: Array.from(stationMap.values()),
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const { pathname, query } = parsedUrl;

  if (req.method === 'GET' && pathname === '/api/scenarios') {
    try {
      const scenarios = await listScenarios();
      sendJson(res, 200, { scenarios });
    } catch (error) {
      console.error('Error listando escenarios:', error);
      sendJson(res, 500, { error: 'No se pudieron listar los escenarios' });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/generate') {
    const scenarioName = (query.scenario || '').toString().trim();
    const daysParam = Number(query.days);

    if (!scenarioName) {
      sendJson(res, 400, { error: 'El parámetro "scenario" es obligatorio.' });
      return;
    }

    if (!Number.isInteger(daysParam) || daysParam < 1 || daysParam > 30) {
      sendJson(res, 400, { error: 'El parámetro "days" debe ser un entero entre 1 y 30.' });
      return;
    }

    let scenario;
    try {
      scenario = await loadScenario(scenarioName);
    } catch (error) {
      sendJson(res, 404, { error: error.message });
      return;
    }

    try {
      const csvOutput = await runGenerator(scenarioName, daysParam);
      const { rows, stations } = parseGeneratorOutput(csvOutput, scenario, daysParam);
      const response = {
        scenario: {
          id: scenarioName,
          name: scenario.name || scenarioName,
          description: scenario.description || '',
          city: scenario.city || '',
        },
        range: rows.length
          ? {
              start: rows[0].timestamp,
              end: rows[rows.length - 1].timestamp,
              days: daysParam,
            }
          : null,
        stations,
      };

      sendJson(res, 200, response);
    } catch (error) {
      console.error('Error ejecutando generador:', error);
      sendJson(res, 500, { error: 'No se pudo ejecutar el generador' });
    }
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});

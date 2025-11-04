const { useState, useEffect, useRef, useCallback } = React;

const DEFAULT_CENTER = [40.4168, -3.7038];

function getMarkerColor(bikes, capacity) {
  if (!capacity) {
    return '#95a5a6';
  }
  const ratio = bikes / capacity;
  if (ratio >= 0.66) return '#2ecc71';
  if (ratio >= 0.33) return '#f1c40f';
  return '#e74c3c';
}

function computeAverageTrips(station) {
  if (!station?.hourlyAverageDemand?.length) {
    return 0;
  }

  const total = station.hourlyAverageDemand.reduce((sum, item) => sum + item.averageTrips, 0);
  return total / station.hourlyAverageDemand.length;
}

function MapView({ stations, onStationSelect }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersLayerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current && mapContainerRef.current) {
      const map = L.map(mapContainerRef.current);
      const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
        maxZoom: 19,
      });
      tileLayer.addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      map.setView(DEFAULT_CENTER, 12);
      mapRef.current = map;
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) {
      return;
    }

    markersLayer.clearLayers();

    if (!Array.isArray(stations) || stations.length === 0) {
      return;
    }

    const stationsWithLocation = stations.filter(
      (station) => station.location && typeof station.location.lat === 'number' && typeof station.location.lng === 'number'
    );

    if (!stationsWithLocation.length) {
      return;
    }

    const bounds = L.latLngBounds(
      stationsWithLocation.map((station) => [station.location.lat, station.location.lng])
    );

    stationsWithLocation.forEach((station) => {
      const marker = L.circleMarker([station.location.lat, station.location.lng], {
        radius: 12,
        color: '#1f2933',
        weight: 1,
        fillColor: getMarkerColor(station.bikesAvailable, station.capacity),
        fillOpacity: 0.85,
      });

      marker.on('click', () => onStationSelect(station));
      marker.addTo(markersLayer);
    });

    map.fitBounds(bounds, { padding: [48, 48] });
  }, [stations, onStationSelect]);

  return <div ref={mapContainerRef} className="w-100 rounded" style={{ height: '500px' }} />;
}

function StationDetails({ station, onClose, scenarioMeta, days }) {
  const chartCanvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!station) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return undefined;
    }

    const canvas = chartCanvasRef.current;
    if (!canvas) {
      return undefined;
    }

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    const labels = (station.hourlyAverageDemand || []).map((item) => `${String(item.hour).padStart(2, '0')}:00`);
    const values = (station.hourlyAverageDemand || []).map((item) => item.averageTrips);

    const chart = new Chart(canvas, {
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
            display: Boolean(scenarioMeta),
            text: scenarioMeta ? `${scenarioMeta.name} · ${scenarioMeta.city || ''}`.trim() : 'Demanda media',
          },
        },
      },
    });

    chartRef.current = chart;

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [station, scenarioMeta]);

  if (!station) {
    return null;
  }

  const averageTrips = computeAverageTrips(station);
  const effectiveDays = Math.min(7, Number(days) || 0);

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 bg-dark bg-opacity-25 d-flex justify-content-end"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="bg-white shadow-lg h-100 overflow-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="station-name"
        style={{ maxWidth: '420px', width: '100%' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="d-flex align-items-start justify-content-between border-bottom px-4 py-3">
          <div>
            <h2 id="station-name" className="h4 mb-1">
              {station.name}
            </h2>
            <p className="text-muted mb-0">
              Capacidad total: {station.capacity} bicicletas. Disponibles estimadas: {station.bikesAvailable}.<br />
              Demanda media por hora (últimos {effectiveDays} días): {averageTrips.toFixed(1)} trayectos.
            </p>
          </div>
          <button type="button" className="btn-close" aria-label="Cerrar panel" onClick={onClose}></button>
        </div>
        <div className="p-4">
          <div className="border rounded" style={{ height: '240px' }}>
            <canvas ref={chartCanvasRef} width="400" height="240" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeedbackAlert({ feedback }) {
  if (!feedback.message) {
    return null;
  }

  const variant = feedback.variant || 'info';
  const bootstrapVariant = variant === 'error' ? 'danger' : variant;

  return (
    <div className={`alert alert-${bootstrapVariant} mb-0`} role="status" aria-live="polite">
      {feedback.message}
    </div>
  );
}

function App() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenario, setSelectedScenario] = useState('');
  const [days, setDays] = useState(7);
  const [feedback, setFeedback] = useState({ message: '', variant: 'info' });
  const [loading, setLoading] = useState(false);
  const [stationsData, setStationsData] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadScenarios() {
      try {
        const response = await fetch('/api/scenarios');
        if (!response.ok) {
          throw new Error('No se pudieron cargar los escenarios.');
        }
        const data = await response.json();
        if (!isMounted) {
          return;
        }

        const receivedScenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
        setScenarios(receivedScenarios);

        if (receivedScenarios.length) {
          setSelectedScenario(receivedScenarios[0].id);
          setFeedback({ message: 'Selecciona un escenario y pulsa "Generar histórico".', variant: 'info' });
        } else {
          setFeedback({ message: 'No hay escenarios disponibles.', variant: 'warning' });
        }
      } catch (error) {
        console.error(error);
        if (isMounted) {
          setFeedback({ message: 'No se pudo obtener la lista de escenarios.', variant: 'danger' });
        }
      }
    }

    loadScenarios();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleStationSelect = useCallback((station) => {
    setSelectedStation(station);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedScenario) {
      setFeedback({ message: 'Selecciona un escenario válido.', variant: 'danger' });
      return;
    }

    setLoading(true);
    setFeedback({ message: 'Generando histórico…', variant: 'info' });

    try {
      const params = new URLSearchParams({
        scenario: selectedScenario,
        days,
      });
      const response = await fetch(`/api/generate?${params.toString()}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'No se pudo generar el histórico.');
      }

      const stations = Array.isArray(data.stations) ? data.stations : [];
      setStationsData({ ...data, stations });
      setSelectedStation(null);

      const stationsWithLocation = stations.filter(
        (station) => station.location && typeof station.location.lat === 'number' && typeof station.location.lng === 'number'
      );

      if (!stationsWithLocation.length) {
        setFeedback({
          message: 'No se encontraron estaciones con localización para este escenario.',
          variant: 'warning',
        });
      } else if (data.range) {
        const start = new Date(data.range.start);
        const end = new Date(data.range.end);
        const formatter = new Intl.DateTimeFormat('es-ES', {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        setFeedback({
          message: `Histórico generado para ${data.scenario.name} del ${formatter.format(start)} al ${formatter.format(end)}.`,
          variant: 'success',
        });
      } else {
        setFeedback({ message: 'No se recibieron datos del generador.', variant: 'warning' });
      }
    } catch (error) {
      console.error(error);
      setFeedback({ message: error.message, variant: 'danger' });
    } finally {
      setLoading(false);
    }
  };

  const formDisabled = loading || !scenarios.length;

  return (
    <div className="container py-4">
      <header className="text-center mb-4">
        <h1 className="display-6">Visualizador de demanda BikeSharing</h1>
        <p className="text-muted">
          Introduce un escenario y el número de días a simular. Se generará el histórico y se mostrará un mapa interactivo con el estado
          estimado de las bases.
        </p>
      </header>

      <div className="row g-4">
        <div className="col-12 col-lg-4">
          <div className="card shadow-sm">
            <div className="card-body">
              <form onSubmit={handleSubmit} className="vstack gap-3">
                <div>
                  <label htmlFor="scenario" className="form-label">
                    Escenario
                  </label>
                  <select
                    id="scenario"
                    name="scenario"
                    className="form-select"
                    value={selectedScenario}
                    onChange={(event) => setSelectedScenario(event.target.value)}
                    disabled={formDisabled}
                    required
                  >
                    {scenarios.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="days" className="form-label">
                    Días a simular
                  </label>
                  <input
                    type="number"
                    id="days"
                    name="days"
                    className="form-control"
                    min="1"
                    max="30"
                    value={days}
                    onChange={(event) => setDays(event.target.value)}
                    disabled={formDisabled}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary" disabled={formDisabled}>
                  {loading ? 'Generando…' : 'Generar histórico'}
                </button>
              </form>
            </div>
            {feedback.message && (
              <div className="card-footer">
                <FeedbackAlert feedback={feedback} />
              </div>
            )}
          </div>
        </div>

        <div className="col-12 col-lg-8">
          <div className="card shadow-sm h-100">
            <div className="card-body">
              <MapView stations={stationsData?.stations} onStationSelect={handleStationSelect} />
            </div>
          </div>
        </div>
      </div>

      <StationDetails
        station={selectedStation}
        onClose={() => setSelectedStation(null)}
        scenarioMeta={stationsData?.scenario}
        days={days}
      />
    </div>
  );
}

const rootElement = document.getElementById('root');
ReactDOM.createRoot(rootElement).render(<App />);

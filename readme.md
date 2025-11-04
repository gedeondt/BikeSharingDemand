# Bike Sharing Demand Simulator

Este repositorio alberga la construcción incremental de un simulador que predice la demanda de bicicletas en puntos de estacionamiento. A lo largo del proyecto ensamblaremos varias piezas que permitirán alimentar, entrenar y visualizar el modelo de predicción.

## Hoja de ruta
1. **Generador de datos históricos**: sintetizar registros de uso en distintos puntos para simular la demanda pasada.
2. **Motor de predicción**: entrenar modelos que aprovechen los datos generados para estimar la demanda futura.
3. **API de servicio**: exponer las predicciones y permitir consultas desde aplicaciones externas.
4. **Interfaz web interactiva**: presentar los resultados de forma visual sobre un mapa o lista de estaciones.

Comenzaremos desarrollando el generador de datos históricos como la primera pieza fundamental antes de avanzar con los componentes de predicción y visualización.

## Escenarios
Los escenarios del simulador se almacenan en la carpeta `escenarios/` como archivos JSON. Cada archivo describe una ciudad teórica con sus puntos de estacionamiento.

### Formato de archivo
Un escenario debe respetar la siguiente estructura:

```json
{
  "name": "Nombre del escenario",
  "city": "Ciudad de referencia",
  "description": "Descripción opcional del propósito del escenario",
  "parking_points": [
    {
      "name": "Identificador del punto",
      "location": {"lat": 0.0, "lng": 0.0},
      "total_stands": 0
    }
  ]
}
```

- `name`: nombre corto y único del escenario.
- `city`: ciudad o región de referencia.
- `description`: texto libre que contextualiza la selección de puntos.
- `parking_points`: lista de puntos de estacionamiento que pertenecen al escenario.
  - `name`: nombre descriptivo del punto.
  - `location.lat` y `location.lng`: coordenadas GPS en formato decimal.
  - `total_stands`: número total de puestos disponibles en el punto.

### Ejemplo disponible
- `escenarios/madrid.json`: escenario de Madrid con 20 puntos distribuidos por los barrios más relevantes de la ciudad.

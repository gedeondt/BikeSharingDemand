# Bike Sharing Demand Simulator

Este repositorio alberga la construcción incremental de un simulador que predice la demanda de bicicletas en puntos de estacionamiento. A lo largo del proyecto ensamblaremos varias piezas que permitirán alimentar, entrenar y visualizar el modelo de predicción.

## Hoja de ruta
1. **Generador de datos históricos**: sintetizar registros de uso en distintos puntos para simular la demanda pasada.
2. **Motor de predicción**: entrenar modelos que aprovechen los datos generados para estimar la demanda futura.
3. **API de servicio**: exponer las predicciones y permitir consultas desde aplicaciones externas.
4. **Interfaz web interactiva**: presentar los resultados de forma visual sobre un mapa o lista de estaciones.

Comenzaremos desarrollando el generador de datos históricos como la primera pieza fundamental antes de avanzar con los componentes de predicción y visualización.

## Generador de datos históricos
El script `generador_historico.js` crea un CSV con el histórico sintético de entradas y salidas por estación y hora. Se invoca indicando el escenario base y el número de días hacia atrás que se desea cubrir:

```bash
node generador_historico.js madrid 7 > historico.csv
```

- El primer parámetro identifica el escenario (`madrid` lee `escenarios/madrid.json`).
- El segundo parámetro indica cuántos días completos se generan contando el día actual. Por ejemplo, `1` produce 24 horas para hoy y `7` genera una semana completa hasta el día presente.
- La salida estándar incluye una cabecera con los campos `station_id,station_name,timestamp,entries,exits` y una fila por estación y hora.
- El número de entradas y salidas respeta el inventario y la capacidad de cada estación a partir del estado inicial definido en el escenario.

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
      "id": "Identificador único",
      "name": "Identificador del punto",
      "location": {"lat": 0.0, "lng": 0.0},
      "total_stands": 0,
      "initial_bikes": 0
    }
  ]
}
```

- `id`: código único y legible que identifica la estación.
- `name`: nombre descriptivo del punto.
- `location.lat` y `location.lng`: coordenadas GPS en formato decimal.
- `total_stands`: número total de puestos disponibles en el punto.
- `initial_bikes`: inventario inicial de bicicletas disponibles en el punto. El generador lo utiliza como punto de partida para mantener la coherencia de los datos.

### Ejemplo disponible
- `escenarios/madrid.json`: escenario de Madrid con 20 puntos distribuidos por los barrios más relevantes de la ciudad.

#### Identificadores de Madrid
| ID       | Estación                               | Puestos | Bicis iniciales |
|----------|----------------------------------------|---------|-----------------|
| MAD-001  | Puerta del Sol                         | 30      | 18              |
| MAD-002  | Gran Vía - Callao                      | 28      | 16              |
| MAD-003  | Malasaña - Plaza del Dos de Mayo       | 24      | 14              |
| MAD-004  | Chueca - Plaza de Chueca               | 22      | 12              |
| MAD-005  | Barrio de las Letras                   | 20      | 12              |
| MAD-006  | Lavapiés - Plaza de Lavapiés           | 18      | 10              |
| MAD-007  | La Latina - Plaza de la Cebada         | 20      | 11              |
| MAD-008  | Atocha - Estación                      | 26      | 15              |
| MAD-009  | Retiro - Puerta de Alcalá              | 24      | 14              |
| MAD-010  | Salamanca - Calle Serrano              | 22      | 13              |
| MAD-011  | Goya - Palacio de Deportes             | 26      | 15              |
| MAD-012  | Chamberí - Plaza de Olavide            | 20      | 12              |
| MAD-013  | Argüelles - Princesa                   | 18      | 11              |
| MAD-014  | Moncloa - Intercambiador               | 30      | 19              |
| MAD-015  | Chamartín - Plaza de Castilla          | 32      | 20              |
| MAD-016  | Tetuán - Cuatro Caminos                | 24      | 13              |
| MAD-017  | Hortaleza - Palacio de Hielo           | 18      | 9               |
| MAD-018  | Usera - Matadero Madrid                | 16      | 8               |
| MAD-019  | Legazpi - Plaza Río 2                  | 18      | 10              |
| MAD-020  | Méndez Álvaro - Estación Sur           | 28      | 17              |

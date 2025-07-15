// Configuración de la aplicación de mapas
const apiKey = "***"; // 

// Configuración del mapa
const mapConfig = {
    center: [2.95, 39.6], // Centro inicial del mapa (Pla de Mallorca)
    zoom: 9.5, // Zoom inicial
    style: `https://api.maptiler.com/maps/topo-v2/style.json?key=${apiKey}`
};

// Configuración de las rutas
const rutasConfig = {
    pla: {
        id: 'ruta-pla',
        layerId: 'linea-ruta-pla',
        dataPath: './data/ruta_pla.geojson',
        color: '#ff7f00', // Color naranja
        width: 4
    }
};

// Configuración de los talayots
const talayotsConfig = {
    id: 'talayots',
    layerId: 'puntos-talayots',
    dataPath: './data/talayots.geojson',
    style: {
        color: '#8B4513', // Color marrón tierra
        radius: 10, // Tamaño más grande para mejor visibilidad
        strokeWidth: 3,
        strokeColor: '#ffffff' // Borde blanco para contraste
    }
};

// Configuración del popup
const popupConfig = {
    closeButton: true, // Permitir botón de cerrar
    closeOnClick: true, // Cerrar al hacer clic fuera del popup
    offset: 25
};

// Variables globales para la sincronización
let currentMap = null;
let currentChart = null;
let routeCoordinates = null;
let elevationDataPoints = null;
let positionMarker = null;

// configuración del gráfico de elevación
const elevationConfig = {
    canvasId: 'elevationChart',
    options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        plugins: {
            title: {
                display: true,
                text: 'Perfil de Elevación - Ruta Pla',
                font: {
                    size: 16,
                    weight: 'bold'
                }
            },
            legend: {
                display: true,
                position: 'top'
            },
            tooltip: {
                callbacks: {
                    title: function(context) {
                        return `Distancia: ${context[0].parsed.x} km`;
                    },
                    label: function(context) {
                        return `Elevación: ${context.parsed.y} m`;
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                title: {
                    display: true,
                    text: 'Distancia (km)',
                    font: {
                        size: 14,
                        weight: 'bold'
                    }
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                }
            },
            y: {
                title: {
                    display: true,
                    text: 'Elevación (m)',
                    font: {
                        size: 14,
                        weight: 'bold'
                    }
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                },
                beginAtZero: false
            }
        },
        elements: {
            line: {
                borderJoinStyle: 'round'
            },
            point: {
                radius: 0,
                hoverRadius: 4
            }
        }
    }
};

// Función para inicializar el mapa
function initMap() {
    const map = new maplibregl.Map({
        container: 'map',
        style: mapConfig.style,
        center: mapConfig.center,
        zoom: mapConfig.zoom
    });

    // Añadir controles de navegación
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    return map;
}

// Función para cargar las rutas
async function loadRoutes(map) {
    // Cargar Ruta Pla
    map.addSource(rutasConfig.pla.id, {
        'type': 'geojson',
        'data': rutasConfig.pla.dataPath
    });
    map.addLayer({
        'id': rutasConfig.pla.layerId,
        'type': 'line',
        'source': rutasConfig.pla.id,
        'layout': {
            'line-join': 'round',
            'line-cap': 'round'
        },
        'paint': {
            'line-color': rutasConfig.pla.color,
            'line-width': rutasConfig.pla.width
        }
    });
    
    // Cargar coordenadas de la ruta para la sincronización
    try {
        const response = await fetch(rutasConfig.pla.dataPath);
        const data = await response.json();
        routeCoordinates = data.features[0].geometry.coordinates;
        console.log('Coordenadas de ruta cargadas para sincronización:', routeCoordinates.length, 'puntos');
        
        // Si el gráfico ya está creado, configurar la interactividad
        if (currentChart && elevationDataPoints) {
            setupChartInteraction(currentChart, routeCoordinates, elevationDataPoints);
        }
    } catch (error) {
        console.error('Error cargando coordenadas de ruta:', error);
    }
}

// Función para cargar los talayots
function loadTalayots(map) {
    console.log('Cargando talayots como círculos...');
    console.log('Ruta del archivo:', talayotsConfig.dataPath);
    
    // Cargar directamente como círculos (más confiable)
    map.addSource(talayotsConfig.id, {
        type: 'geojson',
        data: talayotsConfig.dataPath
    });
    
    console.log('Fuente de datos añadida:', talayotsConfig.id);
    
    map.addLayer({
        'id': talayotsConfig.layerId,
        'type': 'circle',
        'source': talayotsConfig.id,
        'paint': {
            'circle-color': talayotsConfig.style.color,
            'circle-radius': talayotsConfig.style.radius,
            'circle-stroke-width': talayotsConfig.style.strokeWidth,
            'circle-stroke-color': talayotsConfig.style.strokeColor
        }
    });
    
    console.log('Capa añadida:', talayotsConfig.layerId);
    console.log('Estilo aplicado:', talayotsConfig.style);
    
    // Verificar si la fuente se cargó correctamente
    map.on('sourcedata', function(e) {
        if (e.sourceId === talayotsConfig.id && e.isSourceLoaded) {
            console.log('Datos de talayots cargados correctamente');
            const source = map.getSource(talayotsConfig.id);
            if (source._data?.features) {
                console.log('Número de talayots encontrados:', source._data.features.length);
            }
        }
    });
    
    // Verificar errores al cargar los datos
    map.on('error', function(e) {
        console.error('Error en el mapa:', e);
    });
    
    console.log('Talayots configurados como círculos');
}

// Función para calcular la distancia entre dos puntos (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Función para obtener elevación real usando Open Elevation API
async function getRealElevation(coordinates) {
    try {
        // Preparar los puntos para la API
        const locations = coordinates.map(coord => ({
            latitude: coord[1],
            longitude: coord[0]
        }));
        
        // Dividir en lotes de 100 puntos (límite de la API)
        const batchSize = 100;
        const batches = [];
        for (let i = 0; i < locations.length; i += batchSize) {
            batches.push(locations.slice(i, i + batchSize));
        }
        
        let allElevations = [];
        
        for (const batch of batches) {
            const response = await fetch('https://api.open-elevation.com/api/v1/lookup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    locations: batch
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                allElevations = allElevations.concat(data.results);
            } else {
                throw new Error(`API Error: ${response.status}`);
            }
            
            // pausa entre requests para ser respetuosos con la API
            await new Promise(resolve => setTimeout(resolve, 200)); // Reducido para acelerar
        }
        
        return allElevations;
    } catch (error) {
        console.error('Error obteniendo elevaciones reales:', error);
        return null;
    }
}

// Función para generar datos de elevación reales
async function generateRealElevationData(coordinates, routeName) {
    console.log(`Obteniendo elevaciones reales para ${routeName}...`);
    
    // 1. Calcular la distancia acumulada real para TODA la ruta
    let totalDistance = 0;
    const realDistances = [0];
    for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i-1];
        const curr = coordinates[i];
        const segmentDistance = calculateDistance(prev[1], prev[0], curr[1], curr[0]);
        totalDistance += segmentDistance;
        realDistances.push(totalDistance);
    }
    console.log(`Distancia total real de la ruta: ${totalDistance.toFixed(2)} km con ${coordinates.length} puntos.`);

    // 2. Muestrear coordenadas para la API de elevación
    const maxApiPoints = 200; // Aumentamos para más detalle
    const step = Math.max(1, Math.floor(coordinates.length / maxApiPoints));
    const sampledCoords = coordinates.filter((_, index) => index % step === 0);
    const sampledDistances = realDistances.filter((_, index) => index % step === 0);

    // Asegurarse de que el último punto siempre esté incluido
    const lastIndex = coordinates.length - 1;
    if ((lastIndex % step) !== 0) {
        sampledCoords.push(coordinates[lastIndex]);
        sampledDistances.push(realDistances[lastIndex]);
    }
    
    console.log(`Usando ${sampledCoords.length} puntos de ${coordinates.length} coordenadas totales`);
    
    const elevations = await getRealElevation(sampledCoords);
    
    if (!elevations || elevations.length === 0) {
        console.log(`Fallback a elevaciones simuladas para ${routeName}`);
        return generateSimulatedElevationData(coordinates, routeName);
    }

    // 3. Crear un mapa de distancia -> elevación a partir de los resultados de la API
    const elevationMap = new Map();
    for (let i = 0; i < elevations.length; i++) {
        elevationMap.set(sampledDistances[i], elevations[i].elevation);
    }

    // 4. Generar el conjunto de datos final para el gráfico, interpolando elevaciones
    const finalElevationData = [];
    const graphPoints = 500; // Puntos a mostrar en el gráfico
    const graphStep = Math.max(1, Math.floor(coordinates.length / graphPoints));

    for (let i = 0; i < coordinates.length; i += graphStep) {
        const currentDist = realDistances[i];
        let elevation = null;

        // Buscar la elevación más cercana o interpolar
        if (elevationMap.has(currentDist)) {
            elevation = elevationMap.get(currentDist);
        } else {
            // Encontrar los puntos de API más cercanos para interpolar
            let prevApiDist = -1, nextApiDist = -1;
            for (const dist of elevationMap.keys()) {
                if (dist < currentDist && dist > prevApiDist) prevApiDist = dist;
                if (dist > currentDist && (nextApiDist === -1 || dist < nextApiDist)) nextApiDist = dist;
            }

            if (prevApiDist !== -1 && nextApiDist !== -1) {
                const prevElev = elevationMap.get(prevApiDist);
                const nextElev = elevationMap.get(nextApiDist);
                const ratio = (currentDist - prevApiDist) / (nextApiDist - prevApiDist);
                elevation = prevElev + ratio * (nextElev - prevElev);
            } else if (prevApiDist !== -1) {
                elevation = elevationMap.get(prevApiDist); // Usar el anterior si no hay siguiente
            } else if (nextApiDist !== -1) {
                elevation = elevationMap.get(nextApiDist); // Usar el siguiente si no hay anterior
            }
        }
        
        if (elevation !== null) {
            finalElevationData.push({
                distance: Math.round(currentDist * 100) / 100,
                elevation: Math.round(elevation)
            });
        }
    }
    
    // Asegurar que el último punto esté en el gráfico
    const lastDist = realDistances[realDistances.length - 1];
    const lastElev = elevationMap.get(lastDist) || elevationMap.get(Array.from(elevationMap.keys()).pop());
     finalElevationData.push({
        distance: Math.round(lastDist * 100) / 100,
        elevation: Math.round(lastElev)
    });


    console.log(`Perfil de elevación generado con ${finalElevationData.length} puntos.`);
    console.log(`Distancia final en el perfil: ${finalElevationData[finalElevationData.length-1]?.distance.toFixed(2)} km`);
    return finalElevationData;
}

// Función para generar datos de elevación simulados (backup)
function generateSimulatedElevationData(coordinates, routeName) {
    console.log(`Generando elevaciones simuladas para ${routeName}...`);
    
    // Calcular la distancia real total de la ruta
    let totalDistance = 0;
    const realDistances = [0];
    
    for (let i = 1; i < coordinates.length; i++) {
        // Manejar coordenadas 3D: [lon, lat, elevation]
        const prev = coordinates[i-1];
        const curr = coordinates[i];
        
        const segmentDistance = calculateDistance(
            prev[1], prev[0], // lat1, lon1
            curr[1], curr[0]  // lat2, lon2
        );
        totalDistance += segmentDistance;
        realDistances.push(totalDistance);
    }
    
    console.log(`Distancia total real para simulación: ${totalDistance.toFixed(2)} km`);
    
    // Elevaciones base diferentes para cada ruta
    const baseElevations = {
        'Ruta Pla': 100
    };
    
    const baseElevation = baseElevations[routeName] || 75;
    const elevationData = [];
    
    // Reducir el número de puntos para mantener un perfil suave pero detallado
    const maxPoints = 100;
    const step = Math.max(1, Math.floor(coordinates.length / maxPoints));
    
    for (let i = 0; i < coordinates.length; i += step) {
        const distance = realDistances[i] || totalDistance;
        
        // Generar elevación simulada con variaciones naturales
        const variation = Math.sin(distance * 0.1) * 30 + 
                         Math.cos(distance * 0.05) * 20 +
                         Math.random() * 15 - 7.5;
        const elevation = baseElevation + variation;
        
        elevationData.push({
            distance: Math.round(distance * 100) / 100,
            elevation: Math.round(Math.max(0, elevation))
        });
    }
    
    console.log(`Elevaciones simuladas generadas para ${routeName}:`, elevationData.length, 'puntos');
    console.log(`Distancia en el perfil simulado: 0 - ${elevationData[elevationData.length-1]?.distance} km`);
    return elevationData;
}

// Función para cargar y procesar datos de rutas para elevación
async function loadElevationData() {
    try {
        console.log('Cargando datos de rutas...');
        const rutaPlaResponse = await fetch(rutasConfig.pla.dataPath);
        
        const rutaPlaData = await rutaPlaResponse.json();
        
        // Extraer coordenadas de la ruta
        const rutaPlaCoords = rutaPlaData.features[0].geometry.coordinates;
        
        console.log('Coordenadas cargadas para elevación:', rutaPlaCoords.length, 'puntos');
        console.log('Primera coordenada:', rutaPlaCoords[0]);
        console.log('Última coordenada:', rutaPlaCoords[rutaPlaCoords.length - 1]);
        
        console.log('Obteniendo elevaciones reales...');
        
        // Generar datos de elevación reales
        const elevationPla = await generateRealElevationData(rutaPlaCoords, 'Ruta Pla');
        
        return { elevationPla };
    } catch (error) {
        console.error('Error cargando datos de rutas:', error);
        return null;
    }
}

// Función para crear el gráfico de elevación
async function createElevationChart() {
    const canvas = document.getElementById(elevationConfig.canvasId);
    const ctx = canvas.getContext('2d');
    
    // Mostrar mensaje de carga
    ctx.fillStyle = '#666';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Cargando elevaciones reales...', canvas.width / 2, canvas.height / 2);
    
    console.log('Iniciando carga de datos de elevación...');
    const elevationData = await loadElevationData();
    
    if (!elevationData) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillText('Error cargando datos de elevación', canvas.width / 2, canvas.height / 2);
        console.error('No se pudieron cargar los datos de elevación');
        return;
    }
    
    // Limpiar el canvas antes de crear el gráfico
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Guardar datos para la sincronización
    elevationDataPoints = elevationData.elevationPla;
    
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Ruta Pla',
                data: elevationData.elevationPla.map(point => ({
                    x: point.distance,
                    y: point.elevation
                })),
                borderColor: rutasConfig.pla.color,
                backgroundColor: rutasConfig.pla.color + '20',
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 4,
                borderWidth: 2,
                pointBackgroundColor: rutasConfig.pla.color,
                pointBorderColor: '#fff',
                pointBorderWidth: 1
            }]
        },
        options: elevationConfig.options
    });
    
    // Configurar interactividad si tenemos las coordenadas de la ruta
    if (routeCoordinates && currentMap) {
        setupChartInteraction(currentChart, routeCoordinates, elevationDataPoints);
    }
    
    console.log('Gráfico de elevación creado con datos reales:', currentChart ? 'exitoso' : 'error');
}

// Función para configurar la interactividad de los popups
function setupPopups(map) {
    map.on('mouseenter', talayotsConfig.layerId, (e) => {
        map.getCanvas().style.cursor = 'pointer';
    });

    map.on('mouseleave', talayotsConfig.layerId, () => {
        map.getCanvas().style.cursor = '';
    });

    map.on('click', talayotsConfig.layerId, (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const properties = e.features[0].properties;
        
        // Procesar la fuente de la imagen para crear enlaces
        let fuenteHTML = properties.fuenteImagen || 'Fuente no especificada';
        if (properties.fuenteImagen?.includes('|')) {
            const [texto, url] = properties.fuenteImagen.split('|');
            fuenteHTML = `<a href="${url}" target="_blank" rel="noopener">${texto}</a>`;
        }
        
        const popupHTML = `
            <h3>${properties.nombre}</h3>
            <img src="${properties.imagenUrl}" alt="${properties.nombre}">
            <p class="image-source" style="font-size: 0.8em; color: #666; font-style: italic; margin-top: 5px; margin-bottom: 10px;">${fuenteHTML}</p>
            <p>${properties.descripcion}</p>
        `;
        
        while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
            coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
        }

        new maplibregl.Popup(popupConfig)
            .setLngLat(coordinates)
            .setHTML(popupHTML)
            .addTo(map);
    });
}

// Función para interpolar posición en la ruta basada en la distancia
function interpolatePositionOnRoute(targetDistance, coordinates, elevationData) {
    if (!coordinates || !elevationData || elevationData.length === 0) return null;
    
    // Calcular todas las distancias reales a lo largo de la ruta
    let totalDistance = 0;
    const realDistances = [0];
    
    for (let i = 1; i < coordinates.length; i++) {
        const prev = coordinates[i-1];
        const curr = coordinates[i];
        
        const segmentDistance = calculateDistance(
            prev[1], prev[0], // lat1, lon1
            curr[1], curr[0]  // lat2, lon2
        );
        totalDistance += segmentDistance;
        realDistances.push(totalDistance);
    }
    
    // Encontrar el segmento de la ruta que contiene la distancia objetivo
    let segmentIndex = -1;
    for (let i = 0; i < realDistances.length - 1; i++) {
        if (targetDistance >= realDistances[i] && targetDistance <= realDistances[i+1]) {
            segmentIndex = i;
            break;
        }
    }

    if (segmentIndex === -1) {
        // Si está fuera del rango, devolver el último punto
        return {
            coordinates: [coordinates[coordinates.length-1][0], coordinates[coordinates.length-1][1]],
            elevation: elevationData[elevationData.length-1]?.elevation || 0,
            distance: totalDistance
        };
    }

    // Interpolar la posición dentro del segmento
    const startPoint = coordinates[segmentIndex];
    const endPoint = coordinates[segmentIndex + 1];
    const startDistance = realDistances[segmentIndex];
    const segmentLength = realDistances[segmentIndex + 1] - startDistance;
    
    // Evitar división por cero
    const fraction = segmentLength > 0 ? (targetDistance - startDistance) / segmentLength : 0;

    const interpolatedLon = startPoint[0] + (endPoint[0] - startPoint[0]) * fraction;
    const interpolatedLat = startPoint[1] + (endPoint[1] - startPoint[1]) * fraction;

    // Encontrar la elevación correspondiente en los datos del gráfico
    let elevation = 100; // valor por defecto
    for (const point of elevationData) {
        if (point.distance >= targetDistance) {
            elevation = point.elevation;
            break;
        }
    }
    
    return {
        coordinates: [interpolatedLon, interpolatedLat],
        elevation: elevation,
        distance: targetDistance
    };
}

// Función para crear/actualizar el marcador de posición en el mapa
function updatePositionMarker(position) {
    if (!currentMap || !position) return;
    
    // Remover marcador anterior si existe
    if (positionMarker) {
        positionMarker.remove();
    }
    
    // Crear nuevo marcador
    const el = document.createElement('div');
    el.className = 'position-marker';
    el.style.cssText = `
        width: 12px;
        height: 12px;
        background-color: #ff4444;
        border: 2px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        cursor: pointer;
    `;
    
    positionMarker = new maplibregl.Marker(el)
        .setLngLat(position.coordinates)
        .addTo(currentMap);
}

// Función para configurar eventos del gráfico
function setupChartInteraction(chart, coordinates, elevationData) {
    const canvas = chart.canvas;
    
    canvas.addEventListener('mousemove', (event) => {
        // Obtener posición en el gráfico
        const canvasPosition = Chart.helpers.getRelativePosition(event, chart);
        const dataX = chart.scales.x.getValueForPixel(canvasPosition.x);
        
        if (dataX >= 0) {
            const position = interpolatePositionOnRoute(dataX, coordinates, elevationData);
            if (position) {
                updatePositionMarker(position);
            }
        }
    });
    
    canvas.addEventListener('mouseleave', () => {
        // Remover marcador cuando el mouse sale del gráfico
        if (positionMarker) {
            positionMarker.remove();
            positionMarker = null;
        }
    });
}

// Función principal para inicializar toda la aplicación
async function initApp() {
    currentMap = initMap();
    
    currentMap.on('load', async () => {
        // Cargar rutas (asíncrono para obtener coordenadas)
        await loadRoutes(currentMap);
        
        // Cargar talayots
        loadTalayots(currentMap);
        
        // Configurar popups
        setupPopups(currentMap);
        
        // Crear gráfico de elevación
        await createElevationChart();
        
        console.log('Aplicación inicializada completamente');
    });
}

// Iniciar la aplicación
initApp().catch(error => console.error('Error inicializando la aplicación:', error));

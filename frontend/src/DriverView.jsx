import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import axios from 'axios';
import './index.css';



const API_BASE = 'http://localhost:8000';
function createArrowElement() {
  const wrapper = document.createElement('div');
  wrapper.style.width = '48px';
  wrapper.style.height = '48px';
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';

  const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  arrow.setAttribute('viewBox', '0 0 100 100');
  arrow.setAttribute('width', '48');
  arrow.setAttribute('height', '48');
  arrow.style.overflow = 'visible';

  arrow.innerHTML = `
    <defs>
      <linearGradient id="split-blue" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="50%" stop-color="#1e6fe3" />
        <stop offset="50%" stop-color="#0b4fcf" />
      </linearGradient>
    </defs>

    <path
      d="M 50 5 L 90 95 L 50 75 L 10 95 Z"
      fill="url(#split-blue)"
      stroke="url(#split-blue)"
      stroke-width="8"
      stroke-linejoin="round"
    />
  `;

  wrapper.appendChild(arrow);
  return wrapper;
}

function DriverView({ truckId: propTruckId, mode: propMode }) {
  // Get truckId from props first, then from URL parameters, then from localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const urlTruckId = urlParams.get('truckId');
  const storageTruckId = localStorage.getItem('driverTruckId');
  
  const effectiveTruckId = propTruckId || urlTruckId || storageTruckId;
  
  // Determine initial mode based on prop, then from localStorage, then default to DRIVER_FOLLOW
  const storageMode = localStorage.getItem('driverViewMode');
  const initialMode = propMode || storageMode || 'DRIVER_FOLLOW';
  const [worldState, setWorldState] = useState(null);
  const [currentTruck, setCurrentTruck] = useState(null);
  const [currentHub, setCurrentHub] = useState(null);
  const [instruction, setInstruction] = useState(null);  // For manual instructions from manager
  const [acknowledgedInstructions, setAcknowledgedInstructions] = useState(new Set());  // Track acknowledged instructions
  const [disasterNotifications, setDisasterNotifications] = useState([]);  // Track disaster notifications
  const [bearing, setBearing] = useState(0); // For truck bearing state
  
  // Map mode state
  const [mapMode, setMapMode] = useState(initialMode);  // Use initial mode from props
  
  const mapContainer = useRef(null);
  const map = useRef(null);
  const mapInitialized = useRef(false);

  // persistent markers for driver view
  const markers = useRef({
    destination: null,
    truck: null
  });

  // refs for continuous camera tracking
  const truckPositionRef = useRef(null);
  const truckBearingRef = useRef(0);

  // Poll backend state
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`${API_BASE}/state`);
        setWorldState(res.data);
      } catch (e) {
        console.error('Error fetching state:', e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Update current truck, hub, and instructions when state changes
  useEffect(() => {
    if (worldState && effectiveTruckId) {
      const truck = worldState.trucks?.find(t => t.id === effectiveTruckId);
      setCurrentTruck(truck);
      
      if (truck?.current_task?.hub_id) {
        const hub = worldState.hubs?.find(h => h.id === truck.current_task.hub_id);
        setCurrentHub(hub);
      }
      
      // Check for instructions for this truck
      // Only show instructions that are ACTIVE
      if (truck?.instructions && truck.instruction_status === 'ACTIVE') {
        setInstruction(truck.instructions);
      } else {
        // If there's no active instruction, clear the current one
        setInstruction(null);
      }
      
      // Check for disaster notifications for this truck
      if (truck?.disaster_notifications && Array.isArray(truck.disaster_notifications)) {
        setDisasterNotifications(truck.disaster_notifications);
      } else {
        setDisasterNotifications([]);
      }
      
      // Update truck refs for continuous camera tracking
      if (truck) {
        truckPositionRef.current = [
          truck.current_longitude,
          truck.current_latitude
        ];
        
        // Calculate bearing from route if available
        let calculatedBearing = 0;
        if (truck.full_route && truck.full_route.length > 1) {
          // Find the next point in the route after the current position
          if (truck.full_route.length > 1) {
            // Find the closest point in the route to current position
                          // 🔑 Correct bearing: current road segment only
              let segmentIndex = 0;
              let minDist = Infinity;

              for (let i = 0; i < truck.full_route.length - 1; i++) {
                const a = truck.full_route[i];
                const b = truck.full_route[i + 1];

                // distance from truck to segment midpoint
                const midLat = (a.latitude + b.latitude) / 2;
                const midLon = (a.longitude + b.longitude) / 2;

                const dLat = (midLat - truck.current_latitude) * Math.PI / 180;
                const dLon = (midLon - truck.current_longitude) * Math.PI / 180;
                const dist = Math.sqrt(dLat * dLat + dLon * dLon);

                if (dist < minDist) {
                  minDist = dist;
                  segmentIndex = i;
                }
              }
              // Use road segment direction (prev → next), NOT truck → next
              if (segmentIndex > 0 && segmentIndex < truck.full_route.length - 1) {
                const prev = truck.full_route[segmentIndex];
                const next = truck.full_route[segmentIndex + 1];

                const lat1 = prev.latitude * Math.PI / 180;
                const lat2 = next.latitude * Math.PI / 180;
                const dLon = (next.longitude - prev.longitude) * Math.PI / 180;

                const y = Math.sin(dLon) * Math.cos(lat2);
                const x =
                  Math.cos(lat1) * Math.sin(lat2) -
                  Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

                calculatedBearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
              }
          }
        }
        
        truckBearingRef.current = calculatedBearing;
        setBearing(calculatedBearing); // Update the state for reactive updates
      }
    }
  }, [worldState, effectiveTruckId]);

  // Initialize map
  useEffect(() => {
    if (mapInitialized.current || !mapContainer.current) return;
    
    // Default to DRIVER_FOLLOW mode
    const initialMode = 'DRIVER_FOLLOW';
    
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-layer',
            type: 'raster',
            source: 'osm'
          }
        ]
      },
      center: [78.9629, 20.5937],
      zoom: 5,
      bearing: 0,  // Start with north-up orientation
      pitch: 0,
      renderWorldCopies: false
    });
    
    // Apply styling after map loads
    map.current.on('load', () => {
      // Apply dark background
      map.current.setPaintProperty('osm-layer', 'raster-opacity', 1);
      
      // Hide all text labels to reduce visual clutter
      const layers = map.current.getStyle().layers;
      if (layers) {
        layers.forEach(layer => {
          if (layer.type === 'symbol' && 
              (layer.id.includes('label') || 
               layer.id.includes('place') || 
               layer.id.includes('poi') ||
               layer.id.includes('text'))
          ) {
            map.current.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        });
      }
    });

    // Enable map interactions for driver view (for auto-follow pause functionality)
    // These will be handled by event listeners
    
    mapInitialized.current = true;

    return () => {
      if (map.current) {
        map.current.remove();
        mapInitialized.current = false;
      }
    };
  }, []);

  // Navigation state
  const [autoFollow, setAutoFollow] = useState(true);
  const [followTimeout, setFollowTimeout] = useState(null);
  
  // Continuous camera-follow loop for driver modes only
  useEffect(() => {
    if (!map.current || !mapInitialized.current) return;
    if (mapMode !== "DRIVER_FOLLOW" && mapMode !== "DRIVER_NAVIGATION") return;

    let animationFrameId;

    const followCamera = () => {
      if (!truckPositionRef.current) {
        animationFrameId = requestAnimationFrame(followCamera);
        return;
      }

      const isNavigation = mapMode === "DRIVER_NAVIGATION";

      map.current.easeTo({
        center: truckPositionRef.current,
        zoom: isNavigation ? 15.8 : 14,
        bearing: isNavigation ? truckBearingRef.current : 0,
        pitch: isNavigation ? 40 : 0,
        offset: isNavigation
          ? [0, map.current.getCanvas().height * 0.15] // truck below center
          : [0, 0],
        duration: 0   // CRITICAL: no animation, pure camera binding
      });

      animationFrameId = requestAnimationFrame(followCamera);
    };

    followCamera();

    return () => cancelAnimationFrame(animationFrameId);
  }, [mapMode, autoFollow]);
  
  // Handle map interaction to pause auto-follow
  useEffect(() => {
    if (!map.current || !mapInitialized.current) return;
    
    const handleMapMove = () => {
      if (autoFollow) {
        // Pause auto-follow when user pans the map
        setAutoFollow(false);
        
        // Clear any existing timeout
        if (followTimeout) {
          clearTimeout(followTimeout);
        }
        
        // Set timeout to automatically recenter after 7 seconds
        const timeout = setTimeout(() => {
          setAutoFollow(true);
          setFollowTimeout(null);
        }, 7000);
        
        setFollowTimeout(timeout);
      }
    };
    
    // Add event listeners
    map.current.on('drag', handleMapMove);
    map.current.on('zoom', handleMapMove);
    map.current.on('rotate', handleMapMove);
    
    return () => {
      // Remove event listeners
      if (map.current) {
        map.current.off('drag', handleMapMove);
        map.current.off('zoom', handleMapMove);
        map.current.off('rotate', handleMapMove);
      }
      
      // Clear timeout if it exists
      if (followTimeout) {
        clearTimeout(followTimeout);
      }
    };
  }, [autoFollow, followTimeout]);

  // Render route from truck to destination
  useEffect(() => {
    if (!map.current || !currentTruck || !currentTruck.full_route || !mapInitialized.current) return;

    const routeId = 'driver-route';
    
    // Determine route to render based on mode
    let routeToRender = currentTruck.full_route;
    
    if (mapMode === 'DRIVER_NAVIGATION') {
      // For navigation mode, find the closest index in full_route to the truck's current position
      // and slice the route from that index onward (erase already traveled route)
      let closestIndex = 0;
      let minDistance = Infinity;
      
      for (let i = 0; i < currentTruck.full_route.length; i++) {
        const point = currentTruck.full_route[i];
        const dLat = (point.latitude - currentTruck.current_latitude) * Math.PI / 180;
        const dLon = (point.longitude - currentTruck.current_longitude) * Math.PI / 180;
        const a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(currentTruck.current_latitude * Math.PI / 180) * Math.cos(point.latitude * Math.PI / 180) * 
          Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const dist = 6371 * c; // Earth's radius in km
        
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = i;
        }
      }
      
      // Slice the route from the closest index onward (remaining route)
      routeToRender = currentTruck.full_route.slice(closestIndex);
    }
    
    const geojson = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: routeToRender.map(p => [
          p.longitude,
          p.latitude
        ])
      }
    };

    if (map.current.getSource(routeId)) {
      map.current.getSource(routeId).setData(geojson);
    } else {
      map.current.addSource(routeId, {
        type: 'geojson',
        data: geojson
      });

      map.current.addLayer({
        id: routeId,
        type: 'line',
        source: routeId,
        paint: {
          'line-color': '#FF0000',  // Bright red for high contrast navigation
          'line-width': 8,
          'line-opacity': 0.95,
          'line-blur': 0.5
        }
      });
    }
  }, [currentTruck, mapMode]);

  // Render disasters if they exist
  useEffect(() => {
    if (!map.current || !mapInitialized.current || !worldState) return;
    
    // Remove all existing disaster layers and sources before rendering new ones
    const allLayers = map.current.getStyle().layers || [];
    allLayers.forEach(layer => {
      if (layer.id.startsWith('disaster-layer-')) {
        const sourceId = layer.id.replace('disaster-layer-', 'disaster-source-');
        if (map.current.getLayer(layer.id)) {
          map.current.removeLayer(layer.id);
        }
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
      }
    });
    
    // Render disasters if they exist
    if (worldState?.disasters && worldState.disasters.length > 0) {
      worldState.disasters.forEach(disaster => {
        const disasterId = `disaster-${disaster.id}`;
        const layerId = `disaster-layer-${disaster.id}`;
        const sourceId = `disaster-source-${disaster.id}`;
        
        // Handle different disaster types with appropriate geometry
        let geojsonData;
        
        if (disaster.disaster_type === 'rain') {
          // Rain: Render as circular polygon
          const points = [];
          const sides = 64; // Number of sides for the circle approximation
          for (let i = 0; i <= sides; i++) {
            const angle = (i / sides) * 2 * Math.PI;
            const lat = disaster.latitude + (disaster.radius_km / 111) * Math.cos(angle); // Approximate conversion
            const lng = disaster.longitude + (disaster.radius_km / (111 * Math.cos(disaster.latitude * Math.PI / 180))) * Math.sin(angle);
            points.push([lng, lat]);
          }
          
          geojsonData = {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [points]
            },
            properties: {
              disaster_type: disaster.disaster_type
            }
          };
        } else {
          // Traffic or Road Block: Render as line overlay on the affected route segment
          // Find the affected truck and route
          const affectedTruck = worldState.trucks.find(t => t.id === disaster.affected_route_id);
          if (affectedTruck && disaster.affected_segment_start_idx !== null && disaster.affected_segment_end_idx !== null) {
            // Get the start and end points of the affected segment
            const route = affectedTruck.full_route || affectedTruck.route;
            if (route && route.length > disaster.affected_segment_start_idx && route.length > disaster.affected_segment_end_idx) {
              const startPoint = route[disaster.affected_segment_start_idx];
              const endPoint = route[disaster.affected_segment_end_idx];
              
              geojsonData = {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [startPoint.longitude, startPoint.latitude],
                    [endPoint.longitude, endPoint.latitude]
                  ]
                },
                properties: {
                  disaster_type: disaster.disaster_type
                }
              };
            }
          }
        }
        
        // Add new source if geojsonData exists
        if (geojsonData) {
          map.current.addSource(sourceId, {
            type: 'geojson',
            data: geojsonData
          });
        }

        // Add new layer with appropriate styling based on disaster type
        if (geojsonData) {
          let layerType, paintProps;
          if (disaster.disaster_type === 'rain') {
            // Rain: Fill polygon with translucent color
            layerType = 'fill';
            paintProps = {
              'fill-color': disaster.disaster_type === 'rain' ? 'rgba(52, 152, 219, 0.3)' : 
                           disaster.disaster_type === 'traffic' ? 'rgba(243, 156, 18, 0.4)' : 
                           'rgba(231, 76, 60, 0.4)',
              'fill-outline-color': disaster.disaster_type === 'rain' ? '#3498db' : 
                                  disaster.disaster_type === 'traffic' ? '#f39c12' : 
                                  '#e74c3c',
              'fill-opacity': 0.4
            };
          } else {
            // Traffic/Road Block: Line overlay
            layerType = 'line';
            paintProps = {
              'line-color': disaster.disaster_type === 'traffic' ? '#f39c12' : '#e74c3c',
              'line-width': disaster.disaster_type === 'traffic' ? 8 : 10,
              'line-opacity': disaster.disaster_type === 'traffic' ? 0.6 : 0.8,
              'line-dasharray': disaster.disaster_type === 'traffic' ? [2, 2] : [1, 0]  // Dashed for traffic, solid for road block
            };
          }

          map.current.addLayer({
            id: layerId,
            type: layerType,
            source: sourceId,
            paint: paintProps
          });
        }
      });
    }
  }, [worldState]);

  // Render truck marker
  useEffect(() => {
  if (!map.current || !currentTruck || !mapInitialized.current) return;

  // CREATE marker once
  if (!markers.current.truck) {
    const el = createArrowElement();

    markers.current.truck = new maplibregl.Marker({
        element: el,
        anchor: 'center',
      })
      .setLngLat([
        currentTruck.current_longitude,
        currentTruck.current_latitude
      ])
      .addTo(map.current);
  } else {
    // UPDATE position only
    markers.current.truck.setLngLat([
      currentTruck.current_longitude,
      currentTruck.current_latitude
    ]);
  }

}, [currentTruck, bearing]);

  // Render destination marker
  useEffect(() => {
    if (!map.current || !currentHub || !mapInitialized.current) return;

    // Remove existing destination marker
    if (markers.current.destination) {
      markers.current.destination.remove();
    }

    // Create destination marker with default marker
    markers.current.destination = new maplibregl.Marker()
      .setLngLat([currentHub.longitude, currentHub.latitude])
      .addTo(map.current);
  }, [currentHub]);

  // Calculate remaining distance and time
  const calculateRemainingDistance = () => {
    if (!currentTruck?.full_route) return 0;
    
    // Calculate distance from current position to destination using the route
    const route = currentTruck.full_route;
    if (route.length === 0) return 0;
    
    // Find the closest point in the route to current position
    let distance = 0;
    let closestPointIndex = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < route.length; i++) {
      const point = route[i];
      const dLat = (point.latitude - currentTruck.current_latitude) * Math.PI / 180;
      const dLon = (point.longitude - currentTruck.current_longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(currentTruck.current_latitude * Math.PI / 180) * Math.cos(point.latitude * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const dist = 6371 * c; // Earth's radius in km
      
      if (dist < minDistance) {
        minDistance = dist;
        closestPointIndex = i;
      }
    }
    
    // Calculate remaining distance from closest point to end of route
    for (let i = closestPointIndex; i < route.length - 1; i++) {
      const point1 = route[i];
      const point2 = route[i + 1];
      
      const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
      const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      distance += 6371 * c; // Earth's radius in km
    }
    
    return distance.toFixed(1);
  };

  const calculateRemainingTime = () => {
    if (!currentTruck || currentTruck.status !== 'moving') return 'N/A';
    
    const distance = calculateRemainingDistance();
    const speed = currentTruck.speed || 40; // Default to 40 km/h if speed not available
    
    if (speed <= 0) return 'N/A';
    
    const timeInHours = distance / speed;
    const hours = Math.floor(timeInHours);
    const minutes = Math.round((timeInHours - hours) * 60);
    
    return `${hours}h ${minutes}m`;
  };

  return (
    <div style={{ 
      position: 'relative', 
      height: '100vh', 
      width: '100vw',
      overflow: 'hidden'
    }}>
      <div 
        ref={mapContainer} 
        style={{ 
          position: 'absolute', 
          inset: 0 
        }} 
      />
      
      {/* Driver HUD Overlay */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '12px',
        padding: '15px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        zIndex: 1000,
        maxWidth: '400px',
        color: 'white'
      }}>
        {/* Disaster Notification Banner */}
        {disasterNotifications.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '-30px',
            left: '0',
            right: '0',
            backgroundColor: disasterNotifications[0].includes('blocked') ? '#e74c3c' : disasterNotifications[0].includes('rain') ? '#3498db' : '#f39c12',
            color: 'white',
            padding: '8px',
            borderRadius: '4px',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '14px',
            zIndex: 1001
          }}>
            {disasterNotifications[0]}
          </div>
        )}
        <h3 style={{ margin: '0 0 10px 0', color: '#ffffff' }}>Navigation</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <div style={{ fontSize: '14px', color: '#bdc3c7', marginBottom: '4px' }}>Remaining Distance</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>
              {calculateRemainingDistance()} km
            </div>
          </div>
          
          <div>
            <div style={{ fontSize: '14px', color: '#bdc3c7', marginBottom: '4px' }}>Estimated Time</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ffffff' }}>
              {calculateRemainingTime()}
            </div>
          </div>
          
          <div>
            <div style={{ fontSize: '14px', color: '#bdc3c7', marginBottom: '4px' }}>Current Task</div>
            <div style={{ fontSize: '16px', color: '#ffffff' }}>
              {currentHub ? `Deliver to ${currentHub.name}` : 'No active task'}
            </div>
          </div>
          
          <div>
            <div style={{ fontSize: '14px', color: '#bdc3c7', marginBottom: '4px' }}>Status</div>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: 'bold',
              color: currentTruck?.status === 'moving' ? '#27ae60' : '#f39c12'
            }}>
              {currentTruck?.status?.toUpperCase() || 'IDLE'}
            </div>
          </div>
        </div>
      </div>
      
      {/* Instruction Panel on the right side */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: '350px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '12px',
        padding: '15px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        zIndex: 1000,
        maxHeight: 'calc(100vh - 40px)',
        overflowY: 'auto',
        color: 'white'
      }}>
        <h4 style={{ margin: '0 0 15px 0', color: '#ffffff' }}>Manager Instructions</h4>
        
        {instruction ? (
          <div style={{ marginBottom: '15px' }}>
            <div style={{ 
              fontSize: '15px', 
              color: '#ffffff',
              lineHeight: '1.5',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              padding: '10px',
              borderRadius: '4px',
              borderLeft: '4px solid #007bff',
              marginBottom: '10px'
            }}>
              {instruction}
            </div>
            
            <button
              onClick={async () => {
                try {
                  // Call the backend to acknowledge the instruction
                  await axios.post(`${API_BASE}/trucks/${effectiveTruckId}/acknowledge-instruction`);
                  
                  // Add the current instruction to the acknowledged set
                  setAcknowledgedInstructions(prev => new Set([...prev, instruction]));
                  // Clear the current instruction
                  setInstruction(null);
                } catch (error) {
                  console.error('Error acknowledging instruction:', error);
                  // Even if backend call fails, still update UI
                  setAcknowledgedInstructions(prev => new Set([...prev, instruction]));
                  setInstruction(null);
                }
              }}
              style={{
                marginTop: '5px',
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
                width: '100%'
              }}
            >
              Noted
            </button>
          </div>
        ) : (
          <div style={{ 
            fontSize: '14px', 
            color: '#bdc3c7',
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '20px 0',
            minHeight: '80px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <div>
              <div>No instructions from manager</div>
              <small style={{ fontSize: '12px', display: 'block', marginTop: '5px', color: '#95a5a6' }}>Waiting for instructions...</small>
            </div>
          </div>
        )}
      </div>
      
      {/* General Information Panel (bottom) */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '20px',
        right: '370px', // Leave space for the instruction panel
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: '12px',
        padding: '15px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        zIndex: 1000,
        color: 'white'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#ffffff' }}>Route Information</h4>
        <div style={{ 
          fontSize: '14px', 
          color: '#ffffff',
          lineHeight: '1.5'
        }}>
          {currentHub ? (
            <p>
              Proceed to <strong>{currentHub.name}</strong> for delivery. 
              Follow the red route on your map. Estimated arrival: {calculateRemainingTime()}.
            </p>
          ) : (
            <p>
              No active delivery task. Return to depot or wait for new instructions.
            </p>
          )}
          
          {currentTruck?.current_task?.instructions && !instruction && (
            <p style={{ marginTop: '8px', fontStyle: 'italic' }}>
              Additional: {currentTruck.current_task.instructions}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Add a method to set navigation mode for external access
DriverView.setNavigationMode = function() {
  // This would be called from the parent component when needed
  // Since we can't directly access state here, we'll rely on prop changes
  // or a callback passed from the parent
};

export default DriverView;
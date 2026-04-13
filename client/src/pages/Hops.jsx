import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import mapboxgl from 'mapbox-gl';
import { useAuth } from '../context/AuthContext';
import BASE from '../api';
import { IoMap, IoTrophy, IoBeer, IoPerson } from 'react-icons/io5';
import logo from '../assets/logo.png';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const NAV = [
  { label: <IoMap size={22} />, page: 'map', title: 'Map' },
  { label: <IoTrophy size={22} />, page: 'leaderboard', title: 'Leaderboard' },
  { label: <IoBeer size={22} />, page: 'hops', title: 'Hops' },
  { label: <IoPerson size={22} />, page: 'profile', title: 'Profile' },
];

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setWidth(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return width;
}

function Countdown({ expiresAt }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt) - Date.now();
      if (diff <= 0) { setLabel('Expired'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLabel(`${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  return <span>{label}</span>;
}

export default function Hops() {
  const { token } = useAuth();
  const width = useWindowWidth();
  const isMobile = width < 768;

  const [hop, setHop] = useState(undefined);
  const [hopLoaded, setHopLoaded] = useState(false);
  const [hopsStartedToday, setHopsStartedToday] = useState(0);
  const [userLoc, setUserLoc] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [completing, setCompleting] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const mapReadyRef = useRef(false);
  const userLocRef = useRef(null);

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch current hop
  const fetchHop = useCallback(async () => {
    try {
      const { data } = await axios.get(`${BASE}/api/hops/current`, auth);
      setHop(data.hop);
      setHopsStartedToday(data.hopsStartedToday ?? 0);
      if (data.hop?.status === 'active') {
        localStorage.setItem('hopActive', 'true');
      } else {
        localStorage.removeItem('hopActive');
      }
    } catch {
      setHop(null);
      localStorage.removeItem('hopActive');
    } finally {
      setHopLoaded(true);
    }
  }, [token]);

  useEffect(() => { fetchHop(); }, [fetchHop]);

  // Refresh at midnight Eastern so the hop counter resets automatically
  useEffect(() => {
    const msUntilMidnight = () => {
      const nowEastern = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Detroit' }));
      const midnight = new Date(nowEastern);
      midnight.setHours(24, 0, 0, 0);
      return midnight - nowEastern;
    };
    const id = setTimeout(() => fetchHop(), msUntilMidnight());
    return () => clearTimeout(id);
  }, [fetchHop]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await axios.get(
          `${BASE}/api/spots/search?q=${encodeURIComponent(searchQuery.trim())}`,
          auth
        );
        setSearchResults(data);
      } catch { setSearchResults([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Init map once hop has loaded
  useEffect(() => {
    if (!hopLoaded) return;
    if (mapRef.current || !mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/ssawhney/cmnuodf9w007p01s7awrha0jw/draft',
      center: [-83.7382, 42.2808],
      zoom: 14,
    });

    // Center on user location and store for route
    navigator.geolocation?.getCurrentPosition(pos => {
      const loc = { lng: pos.coords.longitude, lat: pos.coords.latitude };
      userLocRef.current = loc;
      setUserLoc(loc);
      map.setCenter([loc.lng, loc.lat]);
    }, null, { timeout: 8000, maximumAge: 60000 });

    map.on('load', () => {
      map.addSource('hop-route', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: 'hop-route-line',
        type: 'line',
        source: 'hop-route',
        paint: { 'line-color': '#FF3B30', 'line-width': 4, 'line-opacity': 0.85, 'line-cap': 'round', 'line-join': 'round' },
      });
      mapReadyRef.current = true;
      refreshMarkers(map, hop);
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      mapReadyRef.current = false;
    };
  }, [hopLoaded]);

  // Update markers/route when hop changes
  const refreshMarkers = useCallback((mapInstance, currentHop) => {
    const map = mapInstance || mapRef.current;
    if (!map || !mapReadyRef.current) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const stops = currentHop?.stops || [];
    if (!stops.length) {
      map.getSource('hop-route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();

    stops.forEach((stop, i) => {
      const done = !!stop.checked_in_at;
      const isCurrent = !done && stops.slice(0, i).every(s => !!s.checked_in_at);

      const el = document.createElement('div');
      el.className = isCurrent ? 'hop-marker-current' : '';
      el.style.cssText = `
        width:34px;height:34px;border-radius:50%;
        background:${done ? '#22c55e' : isCurrent ? '#FFCB05' : '#fff'};
        border:3px solid ${done ? '#16a34a' : isCurrent ? '#00274C' : '#bbb'};
        display:flex;align-items:center;justify-content:center;
        font-weight:800;font-size:13px;
        color:${done ? '#fff' : isCurrent ? '#00274C' : '#888'};
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        font-family:system-ui,sans-serif;
      `;
      el.textContent = done ? '✓' : String(i + 1);

      new mapboxgl.Popup({ offset: 25, closeButton: false })
        .setText(stop.name);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([parseFloat(stop.lng), parseFloat(stop.lat)])
        .setPopup(new mapboxgl.Popup({ offset: 25, closeButton: false }).setText(stop.name))
        .addTo(map);

      markersRef.current.push(marker);
      bounds.extend([parseFloat(stop.lng), parseFloat(stop.lat)]);
    });

    if (stops.length > 0) map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });

    if (currentHop?.status === 'active' && stops.length >= 2) {
      drawRoute(stops);
    } else {
      map.getSource('hop-route')?.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] } });
    }
  }, []);

  useEffect(() => {
    if (mapReadyRef.current) refreshMarkers(null, hop);
  }, [hop, refreshMarkers]);

  // Resize map when it becomes visible (was display:none while no hop)
  const isBuilding = hop?.status === 'building';
  const isActive = hop?.status === 'active';
  const showMap = isBuilding || isActive;
  useEffect(() => {
    if (showMap && mapRef.current) {
      setTimeout(() => mapRef.current?.resize(), 50);
    }
  }, [showMap]);

  const drawRoute = async (stops) => {
    if (!mapRef.current || !mapReadyRef.current) return;
    const waypoints = userLocRef.current
      ? [userLocRef.current, ...stops]
      : stops;
    const coords = waypoints.map(s => `${s.lng},${s.lat}`).join(';');
    try {
      const res = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/walking/${coords}?geometries=geojson&access_token=${mapboxgl.accessToken}`
      );
      const data = await res.json();
      const routeCoords = data.routes?.[0]?.geometry?.coordinates;
      if (!routeCoords) return;

      const duration = 1400;
      const start = performance.now();
      const animate = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const t = eased * (routeCoords.length - 1);
        const i = Math.floor(t);
        const frac = t - i;
        const partial = routeCoords.slice(0, i + 1);
        if (i < routeCoords.length - 1) {
          const a = routeCoords[i], b = routeCoords[i + 1];
          partial.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
        }
        mapRef.current?.getSource('hop-route')?.setData({
          type: 'Feature', geometry: { type: 'LineString', coordinates: partial },
        });
        if (progress < 1) requestAnimationFrame(animate);
      };
      mapRef.current?.getSource('hop-route')?.setData({
        type: 'Feature', geometry: { type: 'LineString', coordinates: [routeCoords[0], routeCoords[0]] },
      });
      requestAnimationFrame(animate);
    } catch {}
  };

  // Actions
  const createHop = async () => {
    const { data } = await axios.post(`${BASE}/api/hops`, {}, auth);
    setHop(data);
  };

  const addStop = async (spot) => {
    setSearchQuery('');
    setSearchResults([]);
    try {
      const { data } = await axios.post(`${BASE}/api/hops/current/stops`, { spot_id: spot.id }, auth);
      setHop(data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Could not add stop', 'error');
    }
  };

  const removeStop = async (stopId) => {
    try {
      const { data } = await axios.delete(`${BASE}/api/hops/current/stops/${stopId}`, auth);
      setHop(data);
    } catch {}
  };

  const startHop = async () => {
    try {
      const { data } = await axios.post(`${BASE}/api/hops/current/start`, {}, auth);
      setHop(data);
    } catch (err) {
      showToast(err.response?.data?.error || 'Could not start hop', 'error');
    }
  };

  const completeStop = async (stopId) => {
    setCompleting(stopId);
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 15000, maximumAge: 30000 })
      );
      const { data } = await axios.post(`${BASE}/api/hops/current/stops/${stopId}/complete`, {
        user_lat: pos.coords.latitude,
        user_lng: pos.coords.longitude,
      }, auth);

      if (data.hopCompleted) {
        showToast(`🎉 Hop Complete! +${data.bonusPoints} bonus pts!`, 'success');
      } else if (data.isDoubleChud) {
        showToast(`+${data.points} pts · Double Chow!`, 'success');
      } else {
        const multiplierLabel = data.multiplier > 1 ? ` · ${data.multiplier}x` : '';
        showToast(`+${data.points} pts${multiplierLabel}`, 'success');
      }
      await fetchHop();
    } catch (err) {
      showToast(err.response?.data?.error || err.message || 'Could not complete stop', 'error');
    } finally {
      setCompleting(null);
    }
  };

  const failHop = async () => {
    if (!window.confirm('Abandon this hop? This cannot be undone.')) return;
    await axios.post(`${BASE}/api/hops/current/fail`, {}, auth);
    setHop(null);
    setToast(null);
  };

  const googleMapsUrl = hop?.stops?.length >= 1
    ? `https://www.google.com/maps/dir/${[
        userLoc ? `${userLoc.lat},${userLoc.lng}` : 'My+Location',
        ...hop.stops.map(s => `${s.lat},${s.lng}`)
      ].join('/')}`
    : null;

  if (!hopLoaded) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#00274C' }}>
      Loading...
    </div>
  );

  const isCompleted = hop?.status === 'completed';

  // Which stop is next to complete
  const nextStop = isActive ? hop.stops.find(s => !s.checked_in_at) : null;

  return (
    <div style={{ display: 'flex', height: '100dvh', background: '#f5f5f5', fontFamily: 'system-ui,sans-serif', overflow: 'hidden' }}>

      {/* Desktop sidebar */}
      <div className="profile-sidebar" style={{
        width: 72, flexShrink: 0, background: 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(8px)', borderRight: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24, gap: 8,
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <img src={logo} alt="A2 Chows" style={{ width: 68, marginBottom: 16 }} />
        {NAV.map(item => (
          <a key={item.page} href={`/${item.page === 'map' ? '' : item.page}`} style={{
            width: 48, height: 48, borderRadius: 12,
            background: item.page === 'hops' ? 'rgba(0,39,76,0.1)' : 'transparent',
            border: item.page === 'hops' ? '1px solid #00274C' : '1px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: '#00274C',
          }} title={item.title}>{item.label}</a>
        ))}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden', position: 'relative' }}>

        {/* Map container — always mounted so ref is stable */}
        <div ref={mapContainerRef} style={{
          flex: isMobile ? 'none' : (showMap ? 1 : 0),
          height: isMobile ? (showMap && !searchFocused ? '38vh' : 0) : '100%',
          width: isMobile ? '100%' : undefined,
          display: showMap ? 'block' : 'none',
          transition: 'height 0.25s ease',
          overflow: 'hidden',
        }} />

        {/* Controls panel */}
        <div style={{
          width: isMobile ? '100%' : showMap ? 340 : '100%',
          flex: isMobile ? 1 : (showMap ? 'none' : 1),
          minHeight: 0,
          overflowY: isMobile ? 'hidden' : 'auto',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 16px',
          paddingBottom: isMobile ? 100 : 24,
          boxShadow: !isMobile && showMap ? '-4px 0 20px rgba(0,0,0,0.06)' : 'none',
        }}>

          {/* ── No hop ── */}
          {!hop && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 56 }}>🍺</div>
              <div style={{ color: '#00274C', fontWeight: 900, fontSize: 22 }}>Plan a Hop</div>
              <div style={{ color: '#999', fontSize: 14, maxWidth: 260 }}>
                Build a route of 2+ spots, chow at each one, and earn bonus points for completing the full hop.
              </div>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: hopsStartedToday >= 3 ? '#FF3B30' : '#00274C',
                background: hopsStartedToday >= 3 ? 'rgba(255,59,48,0.08)' : 'rgba(0,39,76,0.07)',
                borderRadius: 10, padding: '6px 14px',
              }}>
                {hopsStartedToday >= 3 ? 'No hops left today — resets at midnight!' : `${3 - hopsStartedToday} hop${3 - hopsStartedToday !== 1 ? 's' : ''} left today`}
              </div>
              <button
                onClick={hopsStartedToday >= 3 ? undefined : createHop}
                disabled={hopsStartedToday >= 3}
                style={{
                  marginTop: 4, background: hopsStartedToday >= 3 ? '#e0e0e0' : '#00274C',
                  color: hopsStartedToday >= 3 ? '#aaa' : '#FFCB05',
                  border: 'none', borderRadius: 14, padding: '14px 32px',
                  fontWeight: 800, fontSize: 16,
                  cursor: hopsStartedToday >= 3 ? 'not-allowed' : 'pointer',
                }}>Start Planning</button>
            </div>
          )}

          {/* ── Completed ── */}
          {isCompleted && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 60 }}>🏆</div>
              <div style={{ color: '#00274C', fontWeight: 900, fontSize: 22 }}>Hop Complete!</div>
              <div style={{ background: '#FFCB05', color: '#00274C', fontWeight: 800, fontSize: 20, borderRadius: 12, padding: '10px 24px' }}>
                +20 Bonus Pts
              </div>
              <div style={{ color: '#999', fontSize: 14 }}>You crushed it. Ready for another?</div>
              <button onClick={createHop} style={{
                marginTop: 8, background: '#00274C', color: '#FFCB05',
                border: 'none', borderRadius: 14, padding: '14px 32px',
                fontWeight: 800, fontSize: 16, cursor: 'pointer',
              }}>New Hop</button>
            </div>
          )}

          {/* ── Building ── */}
          {isBuilding && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

              {/* Header — hidden when search focused on mobile */}
              {!(isMobile && searchFocused) && (
                <div style={{ color: '#00274C', fontWeight: 900, fontSize: 18, marginBottom: 12, flexShrink: 0 }}>Plan Your Hop</div>
              )}

              {/* Scrollable stop list — hidden when search focused on mobile */}
              {!(isMobile && searchFocused) && (
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, marginBottom: 12 }}>
                  {hop.stops.length === 0 ? (
                    <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
                      Search below to add your first stop
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {hop.stops.map((stop, i) => (
                        <div key={stop.id} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          background: '#f8f8f8', borderRadius: 12, padding: '10px 12px',
                        }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%', background: '#00274C',
                            color: '#FFCB05', fontWeight: 800, fontSize: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          }}>{i + 1}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#00274C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.name}</div>
                            <div style={{ fontSize: 11, color: '#999', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stop.address}</div>
                          </div>
                          <button onClick={() => removeStop(stop.id)} style={{
                            background: 'none', border: 'none', color: '#ccc', fontSize: 18,
                            cursor: 'pointer', flexShrink: 0, padding: 0, lineHeight: 1,
                          }}>✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* spacer so input stays pinned at bottom when focused */}
              {isMobile && searchFocused && <div style={{ flex: 1 }} />}

              {/* Search + Start — pinned at bottom, single persistent input */}
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: isMobile && searchFocused ? 0 : 10 }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type="text"
                      placeholder="Search for a restaurant..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      onFocus={() => isMobile && setSearchFocused(true)}
                      onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                      style={{
                        width: '100%', padding: '10px 14px', borderRadius: 12,
                        border: `1.5px solid ${searchFocused ? '#00274C' : '#e0e0e0'}`,
                        fontSize: 16, outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    {/* Desktop dropdown — appears above input */}
                    {!isMobile && searchResults.length > 0 && (
                      <div style={{
                        position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 50,
                        background: '#fff', borderRadius: 12, marginBottom: 4,
                        boxShadow: '0 -4px 24px rgba(0,0,0,0.14)',
                        maxHeight: 220, overflowY: 'auto', border: '1px solid #f0f0f0',
                      }}>
                        {searchResults.map(spot => (
                          <div key={spot.id} onClick={() => addStop(spot)} style={{
                            padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                          }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9f9f9'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                          >
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#00274C' }}>{spot.name}</div>
                            <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{spot.address}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {isMobile && searchFocused && (
                    <button
                      onMouseDown={() => { setSearchQuery(''); setSearchResults([]); setSearchFocused(false); }}
                      style={{ background: 'none', border: 'none', color: '#00274C', fontWeight: 700, fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}
                    >Cancel</button>
                  )}
                </div>

                {!(isMobile && searchFocused) && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div style={{ color: '#bbb', fontSize: 11 }}>
                        {hop.stops.length < 2 ? `Add ${2 - hop.stops.length} more stop${hop.stops.length === 1 ? '' : 's'} to start` : `${hop.stops.length} stops ready`}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: hopsStartedToday >= 3 ? '#FF3B30' : '#999' }}>
                        {3 - hopsStartedToday} hop{3 - hopsStartedToday !== 1 ? 's' : ''} left today
                      </div>
                    </div>
                    <button
                      onClick={startHop}
                      disabled={hop.stops.length < 2 || hopsStartedToday >= 3}
                      style={{
                        background: (hop.stops.length < 2 || hopsStartedToday >= 3) ? '#e0e0e0' : '#00274C',
                        color: (hop.stops.length < 2 || hopsStartedToday >= 3) ? '#aaa' : '#FFCB05',
                        border: 'none', borderRadius: 14, padding: '14px 0',
                        fontWeight: 800, fontSize: 15, cursor: (hop.stops.length < 2 || hopsStartedToday >= 3) ? 'not-allowed' : 'pointer',
                        width: '100%',
                      }}
                    >Start Hop 🍺</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Active ── */}
          {isActive && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
                <div>
                  <div style={{ color: '#00274C', fontWeight: 900, fontSize: 17 }}>Hop in Progress</div>
                  <div style={{ color: '#FF3B30', fontSize: 12, fontWeight: 600, marginTop: 2 }}>
                    ⏱ <Countdown expiresAt={hop.expires_at} /> left
                  </div>
                </div>
                {googleMapsUrl && (
                  <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" style={{
                    background: '#00274C', color: '#FFCB05', borderRadius: 10,
                    padding: '7px 12px', fontSize: 12, fontWeight: 700, textDecoration: 'none',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <img src="https://maps.google.com/favicon.ico" alt="" style={{ width: 14, height: 14 }} />
                    Maps
                  </a>
                )}
              </div>

              {/* Stop list — scrollable */}
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', marginBottom: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {hop.stops.map((stop, i) => {
                    const done = !!stop.checked_in_at;
                    const isCurrent = !done && hop.stops.slice(0, i).every(s => !!s.checked_in_at);
                    const isLocked = !done && !isCurrent;
                    return (
                      <div key={stop.id} style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                        {/* Line + number */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: done ? '#22c55e' : isCurrent ? '#FFCB05' : '#e8e8e8',
                            border: `3px solid ${done ? '#16a34a' : isCurrent ? '#00274C' : '#ddd'}`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, fontWeight: 800,
                            color: done ? '#fff' : isCurrent ? '#00274C' : '#bbb',
                            flexShrink: 0,
                          }}>
                            {done ? '✓' : i + 1}
                          </div>
                          {i < hop.stops.length - 1 && (
                            <div style={{ width: 2, flex: 1, minHeight: 12, background: done ? '#22c55e' : '#e8e8e8', margin: '2px 0' }} />
                          )}
                        </div>

                        {/* Info + button */}
                        <div style={{
                          flex: 1, paddingBottom: i < hop.stops.length - 1 ? 14 : 0,
                          opacity: isLocked ? 0.4 : 1,
                        }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: '#00274C' }}>{stop.name}</div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 1 }}>{stop.category}</div>
                          {isCurrent && (
                            <button
                              onClick={() => completeStop(stop.id)}
                              disabled={completing === stop.id}
                              style={{
                                marginTop: 8, background: '#00274C', color: '#FFCB05',
                                border: 'none', borderRadius: 10, padding: '8px 16px',
                                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              }}
                            >
                              {completing === stop.id ? 'Verifying...' : '📍 Complete Stop'}
                            </button>
                          )}
                          {done && (
                            <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, marginTop: 4 }}>Chowed ✓</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Failed Hop — pinned at bottom */}
              <div style={{ flexShrink: 0, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <button onClick={failHop} style={{
                  background: 'none', border: '1.5px solid #FF3B30',
                  color: '#FF3B30', borderRadius: 12, padding: '10px 0',
                  fontWeight: 700, fontSize: 13, cursor: 'pointer', width: '100%',
                }}>
                  Failed Hop
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile search results — fixed, grows upward from just above the input */}
      {isMobile && searchFocused && searchResults.length > 0 && (
        <div style={{
          position: 'fixed', left: 0, right: 0, zIndex: 600,
          bottom: 'calc(64px + env(safe-area-inset-bottom, 0px) + 90px)',
          maxHeight: '45vh', overflowY: 'auto',
          background: '#fff',
          borderTop: '1px solid #f0f0f0',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        }}>
          {searchResults.map(spot => (
            <div key={spot.id} onMouseDown={() => addStop(spot)} style={{
              padding: '12px 16px', borderBottom: '1px solid #f0f0f0', cursor: 'pointer',
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#00274C' }}>{spot.name}</div>
              <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{spot.address}</div>
            </div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: isMobile ? 80 : 32, left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#FF3B30' : '#00274C',
          color: toast.type === 'error' ? '#fff' : '#FFCB05',
          borderRadius: 14, padding: '12px 24px',
          fontWeight: 700, fontSize: 14, zIndex: 200,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          animation: 'panelSlideUp 0.3s cubic-bezier(0.22,1,0.36,1) both',
          whiteSpace: 'nowrap',
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

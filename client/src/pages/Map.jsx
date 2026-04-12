import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import BASE from '../api';
import { IoMap, IoTrophy, IoBeer, IoPerson, IoLogoGithub } from 'react-icons/io5';
import logo from '../assets/logo.png';
import 'mapbox-gl/dist/mapbox-gl.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const ANN_ARBOR = { lng: -83.7430, lat: 42.2808 };
const WALK_THRESHOLD_MILES = 0.5;

function buildPinImage() {
  return new Promise((resolve) => {
    const W = 112, H = 144;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const cx = W / 2, cy = W / 2, r = W / 2 - 6;

    ctx.beginPath();
    ctx.moveTo(cx, H - 4);
    ctx.bezierCurveTo(cx - r * 0.35, H - r * 0.65, cx - r - 2, cy + r * 0.45, cx - r - 2, cy);
    ctx.arc(cx, cy, r + 2, Math.PI, 0);
    ctx.bezierCurveTo(cx + r + 2, cy + r * 0.45, cx + r * 0.35, H - r * 0.65, cx, H - 4);
    ctx.fillStyle = '#00274C';
    ctx.fill();
    ctx.strokeStyle = '#FFCB05';
    ctx.lineWidth = 6;
    ctx.stroke();

    const img = new Image();
    img.onload = () => {
      const maxSize = (r + 2) * 2.2;
      const aspect = img.naturalWidth / img.naturalHeight;
      const drawW = aspect >= 1 ? maxSize : maxSize * aspect;
      const drawH = aspect >= 1 ? maxSize / aspect : maxSize;
      ctx.drawImage(img, cx - drawW / 2, cy - drawH / 2, drawW, drawH);
      resolve(ctx.getImageData(0, 0, W, H));
    };
    img.src = logo;
  });
}

export default function Map() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const userLocationRef = useRef(null);
  const activePopupRef = useRef(null);
  const routeAnimRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [mode, setMode] = useState('all');
  const [userLocation, setUserLocation] = useState(null);
  const [directionsInfo, setDirectionsInfo] = useState(null);
  const [checkinState, setCheckinState] = useState(null);
  // checkinState shapes:
  // null
  // { step: 'photo', spotId, spotName }
  // { step: 'submitting' }
  // { step: 'success', spotName, points }
  // { step: 'error', message }
  const [checkinPhoto, setCheckinPhoto] = useState(null);   // File object
  const [checkinPreview, setCheckinPreview] = useState(null); // object URL for preview
  const tokenRef = useRef(null);
  const [showAddSpot, setShowAddSpot] = useState(false);
  const [newSpot, setNewSpot] = useState({ name: '', address: '', category: '', lat: null, lng: null, honeypot: '' });
  const [submitStatus, setSubmitStatus] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [editModal, setEditModal] = useState(null); // { spotId, spotName, spotCategory }
  const [editForm, setEditForm] = useState({ name: '', category: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editStatus, setEditStatus] = useState('');

  const placeSearchRef = useRef(null);
  const autocompleteRef = useRef(null);
  const addressInputRef = useRef(null);
  const addressAutocompleteRef = useRef(null);
  const checkinSubmittingRef = useRef(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const { token, user } = useAuth();

  const SUGGESTION_KEY = `suggestion_log_${user?.id}`;
  const ONE_DAY = 24 * 60 * 60 * 1000;
  const EDIT_LOG_KEY = `edit_log_${user?.id}`;
  const ONE_HOUR = 60 * 60 * 1000;
  const getEditLog = () => {
    try {
      const raw = localStorage.getItem(EDIT_LOG_KEY);
      return (raw ? JSON.parse(raw) : []).filter(t => Date.now() - t < ONE_HOUR);
    } catch { return []; }
  };

  // Keep refs in sync
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Load Google Places autocomplete when suggestion modal opens
  useEffect(() => {
    if (!showAddSpot) return;
    const initAutocomplete = () => {
      if (!placeSearchRef.current || autocompleteRef.current) return;
      const ac = new window.google.maps.places.Autocomplete(placeSearchRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['name', 'formatted_address', 'geometry'],
        types: ['establishment'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry) return;
        setNewSpot(prev => ({
          ...prev,
          name: place.name || prev.name,
          address: place.formatted_address || prev.address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }));
      });
      autocompleteRef.current = ac;
    };

    if (window.google?.maps?.places) {
      initAutocomplete();
    } else {
      const existing = document.getElementById('google-places-script');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'google-places-script';
        script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_PLACES_API_KEY}&libraries=places`;
        script.async = true;
        script.onload = initAutocomplete;
        document.head.appendChild(script);
      } else {
        existing.addEventListener('load', initAutocomplete);
      }
    }
    return () => { autocompleteRef.current = null; };
  }, [showAddSpot]);

  // Init address autocomplete for manual entry mode
  useEffect(() => {
    if (!manualEntry || !showAddSpot) return;
    const init = () => {
      if (!addressInputRef.current || addressAutocompleteRef.current) return;
      const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'geometry'],
        types: ['address'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        if (!place.geometry) return;
        setNewSpot(prev => ({
          ...prev,
          address: place.formatted_address || prev.address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        }));
      });
      addressAutocompleteRef.current = ac;
    };
    if (window.google?.maps?.places) {
      init();
    }
    return () => { addressAutocompleteRef.current = null; };
  }, [manualEntry, showAddSpot]);

  const getSuggestionLog = () => {
    try {
      const raw = localStorage.getItem(SUGGESTION_KEY);
      const log = raw ? JSON.parse(raw) : [];
      return log.filter(t => Date.now() - t < ONE_DAY);
    } catch {
      return [];
    }
  };

  const CUISINE_CATEGORIES = [
    'American', 'Burgers', 'Pizza', 'Italian', 'Mexican', 'Latin American',
    'Chinese', 'Japanese', 'Sushi', 'Korean', 'Thai', 'Vietnamese', 'Indian',
    'Mediterranean', 'Middle Eastern', 'Greek', 'BBQ', 'Seafood',
    'Vegan', 'Café', 'Bakery', 'Brunch', 'Bar & Grill', 'Fast Food', 'Dorm DHalls', 'Other'
  ];

  const clearRoute = () => {
    if (routeAnimRef.current) {
      cancelAnimationFrame(routeAnimRef.current);
      routeAnimRef.current = null;
    }
    if (map.current?.getSource('route')) {
      map.current.getSource('route').setData({ type: 'FeatureCollection', features: [] });
    }
    setDirectionsInfo(null);
  };

  // Attach directions handler to window so popup HTML can call it
  useEffect(() => {
    window.handleGetDirections = async (spotLng, spotLat, spotName) => {
      // Close the popup card so only the route is shown
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }

      const loc = userLocationRef.current;
      if (!loc) {
        alert('Location not available. Enable location access and try again.');
        return;
      }

      try {
        // Always get walking route first (draws red line on map)
        const walkRes = await fetch(
          `https://api.mapbox.com/directions/v5/mapbox/walking/${loc.lng},${loc.lat};${spotLng},${spotLat}?geometries=geojson&steps=true&access_token=${mapboxgl.accessToken}`
        );
        const walkData = await walkRes.json();
        const walkRoute = walkData.routes?.[0];
        if (!walkRoute) return;

        const distanceMiles = (walkRoute.distance / 1609.34).toFixed(1);
        const walkMinutes = Math.ceil(walkRoute.duration / 60);

        const walkSteps = (walkRoute.legs?.[0]?.steps || []).map(s => ({
          instruction: s.maneuver.instruction,
          modifier: s.maneuver.modifier || s.maneuver.type,
          distanceFt: Math.round(s.distance * 3.28084),
        }));

        // Animate the route line drawing in with sub-point interpolation
        const coords = walkRoute.geometry.coordinates;
        const duration = 2200;
        const start = performance.now();
        const drawRoute = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const t = eased * (coords.length - 1);
          const i = Math.floor(t);
          const frac = t - i;
          const partial = coords.slice(0, i + 1);
          if (i < coords.length - 1) {
            const a = coords[i], b = coords[i + 1];
            partial.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
          }
          map.current.getSource('route').setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: partial },
          });
          if (progress < 1) {
            routeAnimRef.current = requestAnimationFrame(drawRoute);
          } else {
            routeAnimRef.current = null;
          }
        };
        map.current.getSource('route').setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [coords[0], coords[0]] },
        });
        routeAnimRef.current = requestAnimationFrame(drawRoute);

        const bounds = new mapboxgl.LngLatBounds()
          .extend([loc.lng, loc.lat])
          .extend([spotLng, spotLat]);
        map.current.fitBounds(bounds, { padding: 80 });

        // If far enough, also fetch real MBus/transit route
        let transitSteps = null;
        if (parseFloat(distanceMiles) >= WALK_THRESHOLD_MILES) {
          try {
            const transitRes = await axios.get(`${BASE}/api/directions`, {
              params: { originLat: loc.lat, originLng: loc.lng, destLat: spotLat, destLng: spotLng },
              headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            });
            transitSteps = transitRes.data;
          } catch {
            // transit unavailable — still show walking info
          }
        }

        setDirectionsInfo({ spotName, distanceMiles, walkMinutes, walkSteps, spotLat, spotLng, transitSteps });
      } catch (err) {
        console.error('Directions error:', err);
      }
    };

    return () => { delete window.handleGetDirections; };
  }, []);

  // Step 1: check visit status, then show photo step or go straight to GPS
  useEffect(() => {
    window.handleCheckin = async (spotId, spotName) => {
      setCheckinPhoto(null);
      setCheckinPreview(null);
      setCheckinState({ step: 'submitting' });
      try {
        const { data } = await axios.get(`${BASE}/api/checkins/status/${spotId}`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
        if (!data.canCheckin) {
          setCheckinState({ step: 'error', message: `Come back in ${data.hoursLeft} hour${data.hoursLeft !== 1 ? 's' : ''} to Double Chud.` });
          return;
        }
        if (data.isFirstVisit) {
          // First visit — require photo
          setCheckinState({ step: 'photo', spotId, spotName, isFirstVisit: true });
        } else {
          // Double Chud — skip photo, go straight to GPS check
          setCheckinState({ step: 'photo', spotId, spotName, isFirstVisit: false });
        }
      } catch {
        setCheckinState({ step: 'error', message: 'Could not verify check-in status.' });
      }
    };
    return () => { delete window.handleCheckin; };
  }, []);

  useEffect(() => {
    window.handleSuggestEdit = (spotId, spotName, spotCategory) => {
      setEditForm({ name: spotName, category: spotCategory || '' });
      setEditStatus('');
      setEditModal({ spotId, spotName, spotCategory });
    };
    return () => { delete window.handleSuggestEdit; };
  }, []);

  const compressImage = (file, maxWidth = 1000, quality = 0.8) =>
    new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = URL.createObjectURL(file);
    });

  // Step 2: user confirmed — upload photo if first visit, then verify GPS + post check-in
  const submitCheckin = async () => {
    if (checkinSubmittingRef.current) return;
    const { spotId, spotName, isFirstVisit } = checkinState;
    if (isFirstVisit && !checkinPhoto) return;

    checkinSubmittingRef.current = true;
    setCheckinState({ step: 'submitting' });

    try {
      let photoUrl = null;

      if (isFirstVisit) {
        // Compress and upload photo to Cloudinary
        const compressed = await compressImage(checkinPhoto);
        const formData = new FormData();
        formData.append('file', compressed);
        formData.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
        const cloudRes = await fetch(
          `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: formData }
        );
        const cloudData = await cloudRes.json();
        if (!cloudData.secure_url) throw new Error('Photo upload failed');
        photoUrl = cloudData.secure_url;
      }

      // Get fresh GPS — try high accuracy first, fall back to last known location
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve,
          () => {
            // High accuracy timed out — use cached location if available
            const fallback = userLocationRef.current;
            if (fallback) resolve({ coords: { latitude: fallback.lat, longitude: fallback.lng } });
            else reject(new Error('Location unavailable. Make sure location is enabled.'));
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
        );
      });

      // Post check-in
      const res = await axios.post(
        `${BASE}/api/checkins`,
        { spot_id: spotId, user_lat: pos.coords.latitude, user_lng: pos.coords.longitude, photo_url: photoUrl },
        { headers: { Authorization: `Bearer ${tokenRef.current}` } }
      );

      setCheckinPhoto(null);
      setCheckinPreview(null);
      setCheckinState({ step: 'success', spotName, points: res.data.pointsEarned, isDoubleChud: res.data.isDoubleChud });
      setTimeout(() => setCheckinState(null), 3000);
    } catch (err) {
      const raw = err.response?.data?.error || err.message || 'Check-in failed.';
      const msg = raw.includes('Location unavailable')
        ? 'Location unavailable. Go to your phone Settings → Privacy → Location Services and make sure your browser has location access, then try again.'
        : raw;
      setCheckinState({ step: 'error', message: msg });
    } finally {
      checkinSubmittingRef.current = false;
    }
  };

  const handleAddSpot = async (e) => {
    e.preventDefault();
    const log = getSuggestionLog();
    if (log.length >= 2) {
      const oldest = Math.min(...log);
      const hoursLeft = Math.ceil((ONE_DAY - (Date.now() - oldest)) / 3600000);
      setSubmitStatus(`Limit reached. Try again in ${hoursLeft}h.`);
      return;
    }
    if (!newSpot.lat || !newSpot.lng) {
      setSubmitStatus(manualEntry
        ? 'Please select an address from the dropdown to confirm the location.'
        : 'Please select a restaurant from the search dropdown.');
      return;
    }
    if (manualEntry && !newSpot.name) {
      setSubmitStatus('Please enter the restaurant name.');
      return;
    }
    setSubmitting(true);
    setSubmitStatus(manualEntry ? 'Verifying restaurant...' : 'Submitting...');
    try {
      await axios.post(`${BASE}/api/spots/suggest`, { ...newSpot, honeypot: newSpot.honeypot || '', manual: manualEntry }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const updated = [...log, Date.now()];
      localStorage.setItem(SUGGESTION_KEY, JSON.stringify(updated));
      setSubmitStatus('Thanks! We\'ll review and add it soon.');
      setNewSpot({ name: '', address: '', category: '', lat: null, lng: null, honeypot: '' });
      setManualEntry(false);
      setTimeout(() => { setShowAddSpot(false); setSubmitStatus(''); }, 2000);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit. Try again.';
      setSubmitStatus(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    const log = getEditLog();
    if (log.length >= 5) {
      setEditStatus('Limit reached (5/hour). Try again later.');
      return;
    }
    setEditSubmitting(true);
    setEditStatus('');
    try {
      await axios.patch(`${BASE}/api/spots/${editModal.spotId}/edit`,
        { category: editForm.category },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = [...log, Date.now()];
      localStorage.setItem(EDIT_LOG_KEY, JSON.stringify(updated));
      setEditModal(null);
      setEditStatus('');
      loadSpots();
    } catch (err) {
      setEditStatus(err.response?.data?.error || 'Failed to update. Try again.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Init map once
  useEffect(() => {
    if (map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/ssawhney/cmnuodf9w007p01s7awrha0jw/draft',
      center: [ANN_ARBOR.lng, ANN_ARBOR.lat],
      zoom: 14,
      maxBounds: [[-83.90, 42.18], [-83.55, 42.42]],
    });

    map.current.addControl(new mapboxgl.NavigationControl());

    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    });
    map.current.addControl(geolocate);

    map.current.on('load', async () => {
      geolocate.trigger();

      const pinImageData = await buildPinImage();
      map.current.addImage('spot-pin', pinImageData);

      // Walking route source + layer (drawn below pins)
      map.current.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.current.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#FF3B30', 'line-width': 5, 'line-opacity': 0.9 },
      });

      // Spots source + symbol layer
      map.current.addSource('spots', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.current.addLayer({
        id: 'spots-layer',
        type: 'symbol',
        source: 'spots',
        layout: {
          'icon-image': 'spot-pin',
          'icon-size': 0.32,
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
        },
      });

      // Popup on pin click
      map.current.on('click', 'spots-layer', (e) => {
        const p = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates.slice();

        activePopupRef.current = new mapboxgl.Popup({ offset: 25, maxWidth: '280px', className: 'chud-popup' })
          .setLngLat(coords)
          .setHTML(`
            <div style="background:#00274C;color:white;border-radius:16px;padding:16px;font-family:system-ui,sans-serif;min-width:220px;">
              <div style="font-size:18px;font-weight:800;color:#FFCB05;margin-bottom:4px;">${p.name}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:10px;">${p.address}</div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                ${p.category ? `<span style="background:rgba(255,203,5,0.15);color:#FFCB05;font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;border:1px solid rgba(255,203,5,0.3);">${p.category}</span>` : ''}
                ${p.rating ? `<span style="font-size:13px;color:white;">⭐ ${p.rating}</span>` : ''}
              </div>
              <button onclick="window.handleGetDirections(${coords[0]}, ${coords[1]}, '${p.name.replace(/'/g, "\\'")}')" style="
                width:100%;padding:10px;background:rgba(255,203,5,0.15);color:#FFCB05;
                border:1px solid rgba(255,203,5,0.4);border-radius:10px;font-weight:700;
                font-size:14px;cursor:pointer;margin-bottom:8px;
              ">Get Directions</button>
              <button onclick="window.handleCheckin && window.handleCheckin(${p.id}, '${p.name.replace(/'/g, "\\'")}')" style="
                width:100%;padding:10px;background:#FFCB05;color:#00274C;
                border:none;border-radius:10px;font-weight:800;font-size:14px;cursor:pointer;margin-bottom:8px;
              ">Check In</button>
              <button onclick="window.handleSuggestEdit && window.handleSuggestEdit(${p.id}, '${p.name.replace(/'/g, "\\'")}', '${(p.category || '').replace(/'/g, "\\'")}')" style="
                width:100%;padding:8px;background:none;color:rgba(255,255,255,0.4);
                border:1px solid rgba(255,255,255,0.15);border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;
              ">Edit</button>
            </div>
          `)
          .addTo(map.current);
      });

      map.current.on('mouseenter', 'spots-layer', () => { map.current.getCanvas().style.cursor = 'pointer'; });
      map.current.on('mouseleave', 'spots-layer', () => { map.current.getCanvas().style.cursor = ''; });

      setMapReady(true);
    });

    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationDenied(false);
      },
      () => setLocationDenied(true)
    );
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    loadSpots();
  }, [mapReady, mode, userLocation]);

  // Handle viewport + zoom lock when switching modes
  useEffect(() => {
    if (!mapReady) return;

    const center = userLocation
      ? [userLocation.lng, userLocation.lat]
      : [ANN_ARBOR.lng, ANN_ARBOR.lat];

    if (mode === 'nearby') {
      map.current.setMinZoom(14.5);
      map.current.flyTo({ center, zoom: 15.5, duration: 800 });
    } else {
      map.current.setMinZoom(null);
      map.current.flyTo({ center, zoom: 14, duration: 800 });
    }
  }, [mode, mapReady]);

  const loadSpots = async () => {
    try {
      let res;
      if (mode === 'nearby' && !userLocation) {
        // Location not available yet — clear pins rather than show all
        map.current.getSource('spots').setData({ type: 'FeatureCollection', features: [] });
        return;
      } else if (mode === 'nearby' && userLocation) {
        res = await axios.get(`${BASE}/api/spots/nearby`, {
          params: { lat: userLocation.lat, lng: userLocation.lng, radius: 0.5 },
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        res = await axios.get(`${BASE}/api/spots`);
      }

      map.current.getSource('spots').setData({
        type: 'FeatureCollection',
        features: res.data.map(spot => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [spot.lng, spot.lat] },
          properties: {
            id: spot.id,
            name: spot.name,
            address: spot.address,
            category: spot.category || '',
            rating: spot.rating || null,
          },
        })),
      });
    } catch (err) {
      console.error('Failed to load spots', err);
    }
  };

  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative' }}>

      {/* Left nav sidebar */}
      <div className="profile-sidebar" style={{
        position: 'absolute', left: 0, top: 0, height: '100%', width: 72,
        background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(8px)',
        zIndex: 10, display: 'flex', flexDirection: 'column',
        alignItems: 'center', paddingTop: 24, gap: 8,
      }}>
        <img src={logo} alt="A2 Chuds" style={{ width: 68, marginBottom: 16 }} />
        {[
          { label: <IoMap size={22} />, page: 'map', title: 'Map' },
          { label: <IoTrophy size={22} />, page: 'leaderboard', title: 'Leaderboard' },
          { label: <IoBeer size={22} />, page: 'hops', title: 'Hops' },
          { label: <IoPerson size={22} />, page: 'profile', title: 'Profile' },
        ].map(item => (
          <a key={item.page} href={`/${item.page === 'map' ? '' : item.page}`} style={{
            width: 48, height: 48, borderRadius: 12,
            background: item.page === 'map' ? 'rgba(0,39,76,0.1)' : 'transparent',
            border: item.page === 'map' ? '1px solid #00274C' : '1px solid transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', textDecoration: 'none',
            color: '#00274C', fontSize: 20,
          }} title={item.title}>
            {item.label}
          </a>
        ))}
        <a href="https://github.com/SandeepSawhney2015/A2Chuds" target="_blank" rel="noopener noreferrer"
          style={{
            marginTop: 'auto', marginBottom: 16,
            width: 48, height: 48, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: '#00274C', opacity: 0.4,
            border: '1px solid transparent',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = 'rgba(0,39,76,0.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = 0.4; e.currentTarget.style.background = 'transparent'; }}
          title="GitHub"
        >
          <IoLogoGithub size={22} />
        </a>
      </div>

      {/* Top toggle */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, background: 'rgba(255,255,255,0.9)', borderRadius: 24, padding: '4px',
        display: 'flex', boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}>
        <button onClick={() => setMode('all')} style={{
          padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: mode === 'all' ? '#00274C' : 'transparent',
          color: mode === 'all' ? 'white' : '#333', fontWeight: 600,
        }}>All A2</button>
        <button onClick={() => setMode('nearby')} style={{
          padding: '8px 20px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: mode === 'nearby' ? '#00274C' : 'transparent',
          color: mode === 'nearby' ? 'white' : '#333', fontWeight: 600,
        }}>Near Me</button>
      </div>

      {/* Location denied banner */}
      {locationDenied && mode === 'nearby' && (
        <div style={{
          position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
          zIndex: 15, background: '#00274C', borderRadius: 14, padding: '12px 18px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', fontFamily: 'system-ui, sans-serif',
          maxWidth: 320, textAlign: 'center',
        }}>
          <div style={{ color: '#FFCB05', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Location access required</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
            Go to Settings → Privacy → Location Services and allow location for your browser, then reload the page.
          </div>
        </div>
      )}

      {/* Add Spot button */}
      <button onClick={() => setShowAddSpot(true)} className="add-spot-btn" style={{
        position: 'absolute', right: 16, bottom: 32, zIndex: 10,
        width: 52, height: 52, borderRadius: '50%',
        background: '#FFCB05', border: '3px solid #00274C',
        color: '#00274C', fontSize: 28, fontWeight: 900,
        cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }} title="Suggest a spot">+</button>

      {/* Directions panel */}
      {directionsInfo && (
        <div className="directions-panel" style={{
          position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, background: '#00274C', borderRadius: 20,
          padding: '16px 20px', boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          minWidth: 320, maxWidth: 420, maxHeight: '60vh', overflowY: 'auto',
          fontFamily: 'system-ui, sans-serif',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
            <div>
              <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 16 }}>{directionsInfo.spotName}</div>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 }}>
                {directionsInfo.distanceMiles} mi · {directionsInfo.walkMinutes} min walk
              </div>
            </div>
            <button onClick={clearRoute} style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: '0 0 0 12px',
            }}>✕</button>
          </div>

          {/* Walking summary */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.07)', borderRadius: 12 }}>
            <span style={{ fontSize: 22 }}>🚶</span>
            <div>
              <div style={{ color: 'white', fontWeight: 700, fontSize: 14 }}>{directionsInfo.walkMinutes} min walk</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{directionsInfo.distanceMiles} mi</div>
            </div>
          </div>

          {/* Transit section (if applicable) */}
          {directionsInfo.transitSteps && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                🚌 MBus / The Ride · {directionsInfo.transitSteps.duration}
              </div>
              {directionsInfo.transitSteps.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: step.mode === 'TRANSIT' ? '#FFCB05' : 'rgba(255,255,255,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                  }}>
                    {step.mode === 'TRANSIT' ? '🚌' : '🚶'}
                  </div>
                  <div style={{ flex: 1 }}>
                    {step.mode === 'TRANSIT' && step.transit ? (
                      <>
                        <div style={{ color: '#FFCB05', fontWeight: 700, fontSize: 13 }}>
                          Route {step.transit.lineName} — {step.transit.lineFullName}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>
                          Board at {step.transit.departureStop}
                          {step.transit.departureTime && ` · departs ${step.transit.departureTime}`}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                          Exit at {step.transit.arrivalStop} · {step.transit.numStops} stop{step.transit.numStops !== 1 ? 's' : ''}
                        </div>
                      </>
                    ) : (
                      <div style={{ color: 'white', fontSize: 13 }}>
                        {step.instruction || `Walk ${step.duration}`}
                        <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 6 }}>{step.duration}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Open in Maps buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lng}&destination=${directionsInfo.spotLat},${directionsInfo.spotLng}&travelmode=walking`}
              target="_blank" rel="noopener noreferrer"
              style={{
                flex: 1, padding: '9px 0', borderRadius: 10, textAlign: 'center',
                background: 'rgba(255,255,255,0.12)', color: 'white',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
              }}
            >Walk</a>
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lng}&destination=${directionsInfo.spotLat},${directionsInfo.spotLng}&travelmode=transit`}
              target="_blank" rel="noopener noreferrer"
              style={{
                flex: 1, padding: '9px 0', borderRadius: 10, textAlign: 'center',
                background: '#FFCB05', color: '#00274C',
                fontSize: 13, fontWeight: 700, textDecoration: 'none',
              }}
            >MBus / The Ride</a>
          </div>
        </div>
      )}

      {/* Check-in overlay */}
      {checkinState && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 30,
          background: 'rgba(0,0,0,0.65)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#00274C', borderRadius: 24, padding: 28,
            textAlign: 'center', width: 320, boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            fontFamily: 'system-ui, sans-serif',
          }}>

            {checkinState.step === 'photo' && (
              <>
                <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
                  {checkinState.isFirstVisit ? 'Check In' : 'Double Chud'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 20 }}>
                  {checkinState.spotName}
                </div>

                {checkinState.isFirstVisit ? (
                  /* First visit — require photo */
                  <label style={{ cursor: 'pointer', display: 'block' }}>
                    <div style={{
                      width: '100%', height: 180, borderRadius: 14,
                      background: checkinPreview ? 'transparent' : 'rgba(255,255,255,0.08)',
                      border: checkinPreview ? 'none' : '2px dashed rgba(255,203,5,0.4)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      overflow: 'hidden', marginBottom: 16,
                    }}>
                      {checkinPreview
                        ? <img src={checkinPreview} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 14 }} />
                        : <div>
                            <div style={{ fontSize: 36 }}>📷</div>
                            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 8 }}>Tap to take a photo</div>
                          </div>
                      }
                    </div>
                    <input
                      type="file" accept="image/*" capture="environment"
                      style={{ display: 'none' }}
                      onChange={e => {
                        const file = e.target.files[0];
                        if (!file) return;
                        setCheckinPhoto(file);
                        setCheckinPreview(URL.createObjectURL(file));
                      }}
                    />
                  </label>
                ) : (
                  /* Double Chud — no photo needed */
                  <div style={{
                    width: '100%', height: 120, borderRadius: 14, marginBottom: 16,
                    background: 'rgba(255,203,5,0.08)', border: '1px solid rgba(255,203,5,0.2)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                    <div style={{ fontSize: 36 }}>🔄</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>+3 pts · no photo needed</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setCheckinState(null); setCheckinPhoto(null); setCheckinPreview(null); }} style={{
                    flex: 1, padding: 10, background: 'rgba(255,255,255,0.12)', color: 'white',
                    border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14,
                  }}>Cancel</button>
                  <button
                    onClick={submitCheckin}
                    disabled={checkinState.isFirstVisit && !checkinPhoto}
                    style={{
                      flex: 2, padding: 10,
                      background: (checkinState.isFirstVisit && !checkinPhoto) ? 'rgba(255,203,5,0.3)' : '#FFCB05',
                      color: '#00274C', border: 'none', borderRadius: 10,
                      fontWeight: 800, cursor: (checkinState.isFirstVisit && !checkinPhoto) ? 'not-allowed' : 'pointer', fontSize: 14,
                    }}
                  >
                    {checkinState.isFirstVisit && !checkinPhoto ? 'Take a photo first' : 'Check In'}
                  </button>
                </div>
              </>
            )}

            {checkinState.step === 'submitting' && (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📍</div>
                <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 18 }}>Verifying...</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 8 }}>
                  Uploading photo and confirming your location
                </div>
              </>
            )}

            {checkinState.step === 'success' && (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>
                  {checkinState.isDoubleChud ? '🔄' : '✅'}
                </div>
                <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 20 }}>
                  {checkinState.isDoubleChud ? 'Double Chud!' : 'Checked in!'}
                </div>
                <div style={{ color: 'white', fontSize: 15, marginTop: 6 }}>{checkinState.spotName}</div>
                {checkinState.isDoubleChud && (
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
                    Return visit — fewer points
                  </div>
                )}
                <div style={{ color: '#FFCB05', fontSize: 32, fontWeight: 900, marginTop: 12 }}>
                  +{checkinState.points} pts
                </div>
              </>
            )}

            {checkinState.step === 'error' && (
              <>
                <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
                <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 18 }}>Can't check in</div>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 8 }}>
                  {checkinState.message}
                </div>
                <button onClick={() => setCheckinState(null)} style={{
                  marginTop: 20, padding: '10px 24px', background: '#FFCB05',
                  color: '#00274C', border: 'none', borderRadius: 10,
                  fontWeight: 800, cursor: 'pointer', fontSize: 14,
                }}>OK</button>
              </>
            )}

          </div>
        </div>
      )}

      {/* Edit spot modal */}
      {editModal && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 25,
          background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#00274C', borderRadius: 20, padding: 24,
            width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 18, marginBottom: 4 }}>Edit Cuisine</div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 16 }}>{editModal.spotName}</div>

            <form onSubmit={handleEditSubmit}>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Cuisine</div>
              <select
                value={editForm.category}
                onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', marginBottom: 16, fontSize: 14, boxSizing: 'border-box' }}
              >
                <option value="">Select cuisine...</option>
                {CUISINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>

              {editStatus && (
                <div style={{ color: '#FFCB05', fontSize: 13, marginBottom: 10 }}>{editStatus}</div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={editSubmitting || getEditLog().length >= 5} style={{
                  flex: 2, padding: 10,
                  background: (editSubmitting || getEditLog().length >= 5) ? 'rgba(255,203,5,0.4)' : '#FFCB05',
                  color: '#00274C', border: 'none', borderRadius: 10, fontWeight: 800,
                  cursor: (editSubmitting || getEditLog().length >= 5) ? 'not-allowed' : 'pointer', fontSize: 14,
                }}>{editSubmitting ? 'Saving...' : 'Save'}</button>
                <button type="button" onClick={() => setEditModal(null)} style={{
                  flex: 1, padding: 10, background: 'rgba(255,255,255,0.15)', color: 'white',
                  border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer', fontSize: 14,
                }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Spot modal */}
      {showAddSpot && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#00274C', borderRadius: 20, padding: 28,
            width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <h2 style={{ color: '#FFCB05', marginBottom: 16, fontWeight: 800 }}>Suggest a Spot</h2>
            <form onSubmit={handleAddSpot}>
              <input type="text" name="honeypot" tabIndex={-1} autoComplete="off"
                value={newSpot.honeypot}
                onChange={e => setNewSpot({ ...newSpot, honeypot: e.target.value })}
                style={{ display: 'none' }}
              />

              {!manualEntry ? (
                <>
                  {/* Google Places search */}
                  <input
                    ref={placeSearchRef}
                    type="text"
                    placeholder="Search for a restaurant..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }}
                  />

                  {/* Auto-filled name + address preview */}
                  {newSpot.name && (
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                      <div style={{ color: '#FFCB05', fontWeight: 700, fontSize: 13 }}>{newSpot.name}</div>
                      <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 }}>{newSpot.address}</div>
                    </div>
                  )}

                  <button type="button" onClick={() => { setManualEntry(true); setNewSpot(prev => ({ ...prev, name: '', address: '', lat: null, lng: null })); }} style={{
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                    fontSize: 12, cursor: 'pointer', marginBottom: 10, padding: 0, textDecoration: 'underline',
                  }}>Can't find it? Enter manually</button>
                </>
              ) : (
                <>
                  <input
                    type="text" placeholder="Restaurant name" required
                    value={newSpot.name}
                    onChange={e => setNewSpot({ ...newSpot, name: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', marginBottom: 10, fontSize: 14, boxSizing: 'border-box' }}
                  />
                  <input
                    ref={addressInputRef}
                    type="text" placeholder="Start typing the address..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', marginBottom: 4, fontSize: 14, boxSizing: 'border-box' }}
                  />
                  {newSpot.address && (
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginBottom: 10 }}>✓ {newSpot.address}</div>
                  )}
                  <button type="button" onClick={() => { setManualEntry(false); setNewSpot(prev => ({ ...prev, name: '', address: '', lat: null, lng: null })); }} style={{
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
                    fontSize: 12, cursor: 'pointer', marginBottom: 10, padding: 0, textDecoration: 'underline',
                  }}>← Back to search</button>
                </>
              )}

              <select
                required
                value={newSpot.category}
                onChange={e => setNewSpot({ ...newSpot, category: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', marginBottom: 16, fontSize: 14, boxSizing: 'border-box' }}
              >
                <option value="">Select cuisine...</option>
                {CUISINE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {submitStatus && <p style={{ color: '#FFCB05', fontSize: 13, marginBottom: 10 }}>{submitStatus}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" disabled={submitting || getSuggestionLog().length >= 2} style={{
                  flex: 1, padding: 10,
                  background: submitting || getSuggestionLog().length >= 2 ? 'rgba(255,203,5,0.4)' : '#FFCB05',
                  color: '#00274C', border: 'none', borderRadius: 10, fontWeight: 800,
                  cursor: submitting || getSuggestionLog().length >= 2 ? 'not-allowed' : 'pointer',
                }}>{submitting ? 'Submitting...' : 'Submit'}</button>
                <button type="button" onClick={() => setShowAddSpot(false)} style={{
                  flex: 1, padding: 10, background: 'rgba(255,255,255,0.15)', color: 'white',
                  border: 'none', borderRadius: 10, fontWeight: 600, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div ref={mapContainer} style={{ height: '100%', width: '100%' }} />
    </div>
  );
}

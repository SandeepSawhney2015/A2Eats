import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useAuth } from '../context/AuthContext';
import BASE from '../api';
import { IoMap, IoTrophy, IoBeer, IoPerson, IoLogoGithub } from 'react-icons/io5';
import logo from '../assets/logo.png';

const CUISINE_COLORS = [
  '#FFCB05', '#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4',
  '#DDA0DD', '#F7DC6F', '#98D8C8', '#BB8FCE', '#F8C471',
  '#82E0AA', '#F1948A', '#85C1E9', '#FAD7A0', '#A9CCE3',
];

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return width;
}

const NAV = [
  { label: <IoMap size={22} />, page: 'map', title: 'Map' },
  { label: <IoTrophy size={22} />, page: 'leaderboard', title: 'Leaderboard' },
  { label: <IoBeer size={22} />, page: 'hops', title: 'Hops' },
  { label: <IoPerson size={22} />, page: 'profile', title: 'Profile' },
];

export default function Profile() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileRef = useRef(null);
  const width = useWindowWidth();
  const isMobile = width < 768;

  const fetchProfile = () => {
    axios.get(`${BASE}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => setData(res.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProfile(); }, [token]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      // Compress
      const compressed = await new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 400 / img.width);
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(resolve, 'image/jpeg', 0.85);
        };
        img.src = URL.createObjectURL(file);
      });

      // Upload to Cloudinary
      const form = new FormData();
      form.append('file', compressed);
      form.append('upload_preset', import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${import.meta.env.VITE_CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: form }
      );
      const cloudData = await cloudRes.json();
      if (!cloudData.secure_url) throw new Error('Upload failed');

      // Save to backend
      await axios.patch(`${BASE}/api/profile/photo`,
        { photo_url: cloudData.secure_url },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchProfile();
    } catch (err) {
      console.error('Photo upload failed', err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#00274C' }}>
      Loading...
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh', background: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>

      {/* Sidebar (desktop only) */}
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
              background: item.page === 'profile' ? 'rgba(0,39,76,0.1)' : 'transparent',
              border: item.page === 'profile' ? '1px solid #00274C' : '1px solid transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', color: '#00274C',
            }} title={item.title}>
              {item.label}
            </a>
          ))}
          <a href="https://github.com/SandeepSawhney2015/A2Eats" target="_blank" rel="noopener noreferrer"
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

      {/* Main content */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isMobile ? '20px 16px 80px' : '32px 32px 32px 24px',
      }}>
        {!data ? (
          <div style={{ color: '#999', textAlign: 'center', marginTop: 60 }}>Could not load profile.</div>
        ) : (
          <>
            {/* Profile card */}
            <div style={{
              background: '#00274C', borderRadius: 24, padding: isMobile ? '20px 20px' : 28,
              marginBottom: 24, boxShadow: '0 4px 20px rgba(0,39,76,0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 16 : 24, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>

                {/* Avatar — tap to upload */}
                <div style={{ position: 'relative', flexShrink: 0 }} onClick={() => fileRef.current?.click()}>
                  {data.user.profile_photo ? (
                    <img src={data.user.profile_photo} alt="avatar" style={{
                      width: isMobile ? 72 : 80, height: isMobile ? 72 : 80,
                      borderRadius: '50%', objectFit: 'cover',
                      border: '3px solid #FFCB05', cursor: 'pointer',
                      opacity: uploadingPhoto ? 0.5 : 1,
                    }} />
                  ) : (
                    <div style={{
                      width: isMobile ? 72 : 80, height: isMobile ? 72 : 80, borderRadius: '50%',
                      background: '#FFCB05', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: isMobile ? 26 : 30, fontWeight: 900, color: '#00274C',
                      cursor: 'pointer', border: '3px solid rgba(255,255,255,0.2)',
                      opacity: uploadingPhoto ? 0.5 : 1,
                    }}>
                      {data.user.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 24, height: 24, borderRadius: '50%',
                    background: '#FFCB05', border: '2px solid #00274C',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, cursor: 'pointer',
                  }}>📷</div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
                </div>

                {/* Name + email */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#FFCB05', fontWeight: 900, fontSize: isMobile ? 20 : 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {data.user.name}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {data.user.email}
                  </div>
                </div>

                {/* Stats */}
                <div style={{ display: 'flex', gap: 16, marginLeft: isMobile ? 'auto' : 0 }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#FFCB05', fontWeight: 900, fontSize: isMobile ? 22 : 26 }}>
                      {Number(data.user.chud_points).toLocaleString()}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Chow Pts
                    </div>
                  </div>
                  <div style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#FFCB05', fontWeight: 900, fontSize: isMobile ? 22 : 26 }}>
                      {ordinal(parseInt(data.user.rank))}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      in A2
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid: pie + recent chows */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 20,
            }}>

              {/* Your Eats */}
              <div style={{ background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ color: '#00274C', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Your Eats</div>
                {data.cuisineBreakdown.length === 0 ? (
                  <div style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>No check-ins yet — go eat something!</div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart margin={{ top: 16, right: 16, bottom: 0, left: 16 }}>
                      <Pie data={data.cuisineBreakdown} cx="50%" cy="48%" outerRadius={80} dataKey="value"
                        animationBegin={400} animationDuration={400}
                        label={({ cx, cy, midAngle, outerRadius, percent, startAngle }) => {
                          if (percent <= 0.07) return null;
                          const R = Math.PI / 180;
                          const r = outerRadius + 20;
                          const x = cx + r * Math.cos(-midAngle * R);
                          const y = cy + r * Math.sin(-midAngle * R);
                          const delay = ((400 + (startAngle / 360) * 400) / 1000).toFixed(2);
                          return (
                            <text key={startAngle} x={x} y={y} textAnchor="middle" dominantBaseline="central"
                              style={{ fontSize: 11, fontWeight: 700, fill: '#555', opacity: 0,
                                animation: `labelFadeIn 0.2s ease forwards ${delay}s` }}>
                              {`${(percent * 100).toFixed(0)}%`}
                            </text>
                          );
                        }}
                        labelLine={false}>
                        {data.cuisineBreakdown.map((_, i) => (
                          <Cell key={i} fill={CUISINE_COLORS[i % CUISINE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value, name) => [`${value} visit${value !== 1 ? 's' : ''}`, name]} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Recent Chows */}
              <div style={{ background: 'white', borderRadius: 20, padding: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ color: '#00274C', fontWeight: 800, fontSize: 16, marginBottom: 16 }}>Recent Chows</div>
                {data.recentCheckins.length === 0 ? (
                  <div style={{ color: '#999', fontSize: 14, textAlign: 'center', padding: '32px 0' }}>No check-ins yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {data.recentCheckins.map(ci => (
                      <div key={ci.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        {ci.photo_url ? (
                          <img src={ci.photo_url} alt={ci.spot_name} style={{ width: 60, height: 60, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 60, height: 60, borderRadius: 12, flexShrink: 0, background: 'rgba(0,39,76,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔄</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 14, color: '#00274C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ci.spot_name}
                          </div>
                          {ci.category && (
                            <div style={{ display: 'inline-block', marginTop: 3, background: 'rgba(0,39,76,0.07)', color: '#00274C', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20 }}>
                              {ci.category}
                            </div>
                          )}
                          <div style={{ color: '#aaa', fontSize: 12, marginTop: 3 }}>{timeAgo(ci.created_at)}</div>
                        </div>
                        <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 14, background: '#00274C', padding: '4px 10px', borderRadius: 10, flexShrink: 0 }}>
                          +{ci.points_earned}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Logout */}
            <button
              onClick={() => { logout(); navigate('/login'); }}
              onMouseEnter={e => { e.currentTarget.style.background = '#FF3B30'; e.currentTarget.style.borderColor = '#FF3B30'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#e0e0e0'; e.currentTarget.style.color = '#999'; }}
              style={{
                marginTop: 32, width: '100%', padding: '12px 0',
                background: 'none', border: '1.5px solid #e0e0e0',
                borderRadius: 14, color: '#999', fontWeight: 700,
                fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              Log out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

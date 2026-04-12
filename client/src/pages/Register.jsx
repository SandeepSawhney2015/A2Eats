import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import BASE from '../api';
import logo from '../assets/logo.png';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const resetIOSZoom = () => {
    const meta = document.querySelector('meta[name=viewport]');
    if (meta) {
      meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.endsWith('@umich.edu')) {
      setError('Must use a @umich.edu email');
      return;
    }
    setLoading(true);
    try {
      const res = await axios.post(`${BASE}/api/auth/register`, { email, password });
      resetIOSZoom();
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#ffffff',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 24px 48px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Logo */}
      <img src={logo} alt="A2 Chuds" style={{ width: 100, marginBottom: 8 }} />
      <div style={{ color: '#00274C', fontWeight: 900, fontSize: 26, marginBottom: 4 }}>A2 Chuds</div>
      <div style={{ color: 'rgba(0,39,76,0.4)', fontSize: 13, marginBottom: 36 }}>Discover Ann Arbor, one chud at a time.</div>

      {/* Card */}
      <div style={{
        background: '#00274C',
        borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 380,
        boxShadow: '0 8px 32px rgba(0,39,76,0.18)',
      }}>
        <div style={{ color: '#FFCB05', fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Create account</div>
        {email.includes('@') && (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 16 }}>
            Username: <span style={{ color: '#FFCB05', fontWeight: 700 }}>{email.split('@')[0]}</span>
          </div>
        )}
        {!email.includes('@') && <div style={{ marginBottom: 20 }} />}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="uniqname@umich.edu"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{
              display: 'block', width: '100%', marginBottom: 12,
              padding: '12px 14px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.1)', color: '#fff',
              fontSize: 16, outline: 'none', boxSizing: 'border-box',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{
              display: 'block', width: '100%', marginBottom: 20,
              padding: '12px 14px', borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.1)', color: '#fff',
              fontSize: 16, outline: 'none', boxSizing: 'border-box',
            }}
          />
          {error && (
            <div style={{
              background: 'rgba(255,59,48,0.15)', border: '1px solid rgba(255,59,48,0.4)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 16,
              color: '#FF6B6B', fontSize: 13,
            }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
              background: loading ? 'rgba(255,203,5,0.5)' : '#FFCB05',
              color: '#00274C', fontWeight: 800, fontSize: 16,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >{loading ? 'Creating account...' : 'Create account'}</button>
        </form>
      </div>

      <p style={{ marginTop: 24, color: 'rgba(0,39,76,0.4)', fontSize: 13 }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: '#00274C', fontWeight: 700, textDecoration: 'none' }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

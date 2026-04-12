import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import BASE from '../api';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.endsWith('@umich.edu')) {
      setError('Must use a @umich.edu email');
      return;
    }
    try {
      const res = await axios.post(`${BASE}/api/auth/register`, { email, password });
      login(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '100px auto', padding: 24 }}>
      <h1>A2 Chuds</h1>
      <h2>Register</h2>
      {email.includes('@') && (
        <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>
          Your username will be <strong>{email.split('@')[0]}</strong>
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <div>
          <input
            type="email"
            placeholder="uniqname@umich.edu"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8 }}
          />
        </div>
        <div>
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8 }}
          />
        </div>
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" style={{ width: '100%', padding: 10 }}>Create Account</button>
      </form>
      <p style={{ marginTop: 16 }}>Already have an account? <Link to="/login">Login</Link></p>
    </div>
  );
}

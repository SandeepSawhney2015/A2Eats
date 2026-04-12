import logo from '../assets/logo.png';

export default function Leaderboard() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#00274C',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif',
      padding: 24,
    }}>
      <img src={logo} alt="A2 Chuds" style={{ width: 110, marginBottom: 24, opacity: 0.9 }} />
      <div style={{ color: '#FFCB05', fontWeight: 900, fontSize: 28, marginBottom: 8 }}>Leaderboard</div>
      <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>Work in progress 🚧</div>
    </div>
  );
}

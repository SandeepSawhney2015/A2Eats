import { IoMap, IoTrophy, IoBeer, IoPerson } from 'react-icons/io5';
import logo from '../assets/logo.png';

const NAV = [
  { label: <IoMap size={22} />, page: 'map', title: 'Map' },
  { label: <IoTrophy size={22} />, page: 'leaderboard', title: 'Leaderboard' },
  { label: <IoBeer size={22} />, page: 'hops', title: 'Hops' },
  { label: <IoPerson size={22} />, page: 'profile', title: 'Profile' },
];

export default function Leaderboard() {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#00274C', fontFamily: 'system-ui, sans-serif' }}>

      {/* Desktop sidebar */}
      <div className="profile-sidebar" style={{
        width: 72, flexShrink: 0, background: 'rgba(0,0,0,0.2)',
        borderRight: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24, gap: 8,
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <img src={logo} alt="A2 Chuds" style={{ width: 48, marginBottom: 16 }} />
        {NAV.map(item => (
          <a key={item.page} href={`/${item.page === 'map' ? '' : item.page}`} style={{
            width: 48, height: 48, borderRadius: 12,
            background: item.page === 'leaderboard' ? 'rgba(255,203,5,0.15)' : 'transparent',
            border: item.page === 'leaderboard' ? '1px solid rgba(255,203,5,0.4)' : '1px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: item.page === 'leaderboard' ? '#FFCB05' : 'rgba(255,255,255,0.4)',
          }} title={item.title}>
            {item.label}
          </a>
        ))}
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 24px 100px',
      }}>
        <img src={logo} alt="A2 Chuds" style={{ width: 100, marginBottom: 24, opacity: 0.9 }} />
        <div style={{ color: '#FFCB05', fontWeight: 900, fontSize: 28, marginBottom: 8 }}>Leaderboard</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>Work in progress 🚧</div>
      </div>

    </div>
  );
}

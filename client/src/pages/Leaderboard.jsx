import { IoMap, IoTrophy, IoBeer, IoPerson, IoLogoGithub } from 'react-icons/io5';
import logo from '../assets/logo.png';

const NAV = [
  { label: <IoMap size={22} />, page: 'map', title: 'Map' },
  { label: <IoTrophy size={22} />, page: 'leaderboard', title: 'Leaderboard' },
  { label: <IoBeer size={22} />, page: 'hops', title: 'Hops' },
  { label: <IoPerson size={22} />, page: 'profile', title: 'Profile' },
];

export default function Leaderboard() {
  return (
    <div style={{ display: 'flex', minHeight: '100dvh', background: '#f5f5f5', fontFamily: 'system-ui, sans-serif' }}>

      {/* Desktop sidebar — matches Map */}
      <div className="profile-sidebar" style={{
        width: 72, flexShrink: 0,
        background: 'rgba(255,255,255,0.9)', backdropFilter: 'blur(8px)',
        borderRight: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24, gap: 8,
        position: 'sticky', top: 0, height: '100vh',
      }}>
        <img src={logo} alt="A2 Chuds" style={{ width: 68, marginBottom: 16 }} />
        {NAV.map(item => (
          <a key={item.page} href={`/${item.page === 'map' ? '' : item.page}`} style={{
            width: 48, height: 48, borderRadius: 12,
            background: item.page === 'leaderboard' ? 'rgba(0,39,76,0.1)' : 'transparent',
            border: item.page === 'leaderboard' ? '1px solid #00274C' : '1px solid transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', color: '#00274C',
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

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px 24px 100px',
      }}>
        <img src={logo} alt="A2 Chuds" style={{ width: 100, marginBottom: 24 }} />
        <div style={{ color: '#00274C', fontWeight: 900, fontSize: 28, marginBottom: 8 }}>Leaderboard</div>
        <div style={{ color: '#999', fontSize: 15 }}>Work in progress 🚧</div>
      </div>

    </div>
  );
}

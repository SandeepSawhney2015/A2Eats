import { useLocation } from 'react-router-dom';
import { IoMap, IoTrophy, IoBeer, IoPerson } from 'react-icons/io5';

const NAV = [
  { label: <IoMap size={22} />, path: '/', title: 'Map' },
  { label: <IoTrophy size={22} />, path: '/leaderboard', title: 'Leaderboard' },
  { label: <IoBeer size={22} />, path: '/hops', title: 'Hops' },
  { label: <IoPerson size={22} />, path: '/profile', title: 'Profile' },
];

export default function BottomNav() {
  const location = useLocation();

  return (
    <nav className="bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 64, zIndex: 1000,
      background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)',
      borderTop: '1px solid rgba(0,0,0,0.08)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-around',
    }}>
      {NAV.map(item => {
        const active = location.pathname === item.path;
        return (
          <a key={item.path} href={item.path} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: active ? '#00274C' : '#999',
            textDecoration: 'none', fontSize: 10, fontWeight: 600, gap: 3,
            padding: '8px 16px',
          }}>
            {item.label}
            <span>{item.title}</span>
          </a>
        );
      })}
    </nav>
  );
}

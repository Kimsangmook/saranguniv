export interface MenuItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
}

export const SIDE_MENU_ITEMS: MenuItem[] = [
  {
    id: 'dashboard',
    label: '대시보드',
    path: '/',
    icon: '📊'
  },
  {
    id: 'attendance',
    label: '출석 관리',
    path: '/token',
    icon: '✅'
  },
  {
    id: 'settings',
    label: '설정',
    path: '/settings',
    icon: '⚙️'
  }
];

export const ROUTES = {
  HOME: '/',
  TOKEN: '/token',
  CHECKING: '/checking',
  SETTINGS: '/settings'
} as const;

export const API_ENDPOINTS = {
  TOKEN: '/api/token',
  ATTENDANCE: '/api/attendance'
} as const; 
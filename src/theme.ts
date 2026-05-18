export const theme = {
  colors: {
    primary: '#2563EB',
    primaryHover: '#1D4ED8',
    primarySoft: '#EFF6FF',
    secondary: '#0EA5E9',
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',
    text: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    divider: '#E2E8F0',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    male: '#2563EB',
    female: '#DB2777',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    '2xl': '24px',
  },
  radius: {
    sm: '10px',
    md: '12px',
    lg: '16px',
    xl: '20px',
    pill: '999px',
  },
  shadow: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.05)',
    sm: '0 4px 12px rgba(15, 23, 42, 0.08)',
    md: '0 12px 30px rgba(15, 23, 42, 0.10)',
    floating: '0 18px 50px rgba(15, 23, 42, 0.16)',
  },
  typography: {
    fontFamily: "'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    number: "'Inter', 'SF Pro Display', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif",
  },
} as const;

export const chartTheme = {
  axis: theme.colors.textTertiary,
  grid: '#EEF2F7',
  tooltipStyle: {
    borderRadius: 14,
    border: `1px solid ${theme.colors.divider}`,
    boxShadow: theme.shadow.md,
    color: theme.colors.text,
    fontSize: 12,
    background: 'rgba(255, 255, 255, 0.96)',
  },
  cursor: { fill: 'rgba(37, 99, 235, 0.06)' },
} as const;

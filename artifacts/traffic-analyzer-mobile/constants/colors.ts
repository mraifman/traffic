/**
 * Design tokens derived from the sibling traffic-analyzer web artifact (index.css).
 * Dark-only theme — the web app uses a fixed dark palette.
 */
const colors = {
  dark: {
    // Legacy aliases
    text: '#f5f9fc',
    tint: '#3b82f6',

    background: '#070d1a',       // hsl(222 47% 6%)
    foreground: '#f5f9fc',       // hsl(210 40% 98%)

    card: '#0b1421',             // hsl(222 47% 8%)
    cardForeground: '#f5f9fc',

    primary: '#3b82f6',          // hsl(217 91% 60%)
    primaryForeground: '#070d1a',

    secondary: '#1d2e42',        // hsl(217 32% 17%)
    secondaryForeground: '#f5f9fc',

    muted: '#1d2e42',
    mutedForeground: '#8fa3b8',  // hsl(215 20.2% 65.1%)

    accent: '#1d2e42',
    accentForeground: '#f5f9fc',

    destructive: '#b91c1c',
    destructiveForeground: '#f5f9fc',

    border: '#1d2e42',
    input: '#1d2e42',
  },

  // Vehicle class colors — match the web app overlay palette
  vehicles: {
    cars: '#3b82f6',
    pedestrians: '#22c55e',
    bikes: '#f59e0b',
    motorcycles: '#a855f7',
    trucks: '#f97316',
    buses: '#ef4444',
  },

  radius: 4, // 0.25rem from web app
};

export default colors;

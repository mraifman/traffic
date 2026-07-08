import React from 'react';
import { Link, useLocation } from 'wouter';
import { Activity, LayoutDashboard, Settings, Video, FileVideo, HardDrive } from 'lucide-react';

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: '/', label: 'Source', icon: Video },
    { href: '/analyze', label: 'Analysis', icon: Activity },
    { href: '/sessions', label: 'Sessions', icon: HardDrive },
    { href: '/setup', label: 'Setup', icon: Settings },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans">
      <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <span className="font-semibold tracking-wide text-sm">TRAFFIC ANALYZER</span>
        </div>
        
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive 
                    ? 'bg-secondary text-primary' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </main>
    </div>
  );
}

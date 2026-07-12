import React from 'react';
import { Link, MousePointerClick } from 'lucide-react';

interface StatsGridProps {
  totalLinks: number;
  totalClicks: number;
}

export const StatsGrid: React.FC<StatsGridProps> = ({ totalLinks, totalClicks }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Total Links Card */}
      <div className="translucent-surface interactive-card rounded-2xl p-6 flex items-center justify-between shadow-2xl animate-enter" style={{ animationDelay: '0ms' }}>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Links</p>
          <h3 className="text-3xl font-bold text-gray-100 font-sans tracking-tight">
            {totalLinks.toLocaleString()}
          </h3>
        </div>
        <div className="p-3 bg-purple-500/10 border border-purple-500/20 text-purple-400 rounded-lg">
          <Link size={24} />
        </div>
      </div>

      {/* Total Clicks Card */}
      <div className="translucent-surface interactive-card rounded-2xl p-6 flex items-center justify-between shadow-2xl animate-enter" style={{ animationDelay: '50ms' }}>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total Clicks</p>
          <h3 className="text-3xl font-bold text-gray-100 font-sans tracking-tight">
            {totalClicks.toLocaleString()}
          </h3>
        </div>
        <div className="p-3 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-lg">
          <MousePointerClick size={24} />
        </div>
      </div>
    </div>
  );
};

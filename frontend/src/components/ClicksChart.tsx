import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import type { ChartOptions } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
  Legend
);

interface ClickData {
  date: string;
  count: number;
}

interface ClicksChartProps {
  data: ClickData[];
}

export const ClicksChart: React.FC<ClicksChartProps> = ({ data }) => {
  const chartData = {
    labels: data.map((d) => d.date),
    datasets: [
      {
        fill: true,
        label: 'Clicks',
        data: data.map((d) => d.count),
        borderColor: '#a855f7', // Purple primary
        backgroundColor: 'rgba(168, 85, 247, 0.08)',
        borderWidth: 2,
        pointBackgroundColor: '#a855f7',
        pointHoverRadius: 6,
        tension: 0.3,
      },
    ],
  };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(22, 23, 29, 0.9)',
        titleColor: '#e5e7eb',
        bodyColor: '#a855f7',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 10,
        cornerRadius: 6,
      },
    },
    scales: {
      x: {
        grid: {
          display: false,
        },
        ticks: {
          color: '#9ca3af',
          font: { size: 10, family: 'monospace' },
        },
      },
      y: {
        grid: {
          color: '#2e303a',
        },
        ticks: {
          color: '#9ca3af',
          font: { size: 10, family: 'monospace' },
          stepSize: 1,
        },
        min: 0,
      },
    },
  };

  return (
    <div className="translucent-surface interactive-card rounded-2xl p-6 shadow-2xl animate-enter" style={{ animationDelay: '100ms' }}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-6">
        Clicks History (Last 14 Days)
      </h3>
      <div className="h-64">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

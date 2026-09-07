import { useState } from 'react';
import { HiArrowUp, HiArrowDown } from 'react-icons/hi';
import AnimatedCounter from './AnimatedCounter';
import Sparkline from './Sparkline';

export default function StatCard({
  title,
  value,
  valueSuffix,
  icon: Icon,
  change,
  changeType,
  subtitle,
  gradient = ['#3B82F6', '#1D4ED8'],
  sparklineData,
  delay = 0,
  onCardClick = null,
  bgColor = 'bg-white',
  isVisible = true,
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={`${bgColor} rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{ transitionDelay: `${delay}ms` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onCardClick}
    >
      <div className="relative overflow-hidden">
        <div
          className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 blur-3xl transition-all duration-500"
          style={{
            background: gradient[0],
            transform: isHovered ? 'scale(1.5)' : 'scale(1)'
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div
              className="rounded-lg p-2 transition-all duration-300"
              style={{ background: gradient[0] }}
            >
              <Icon className="text-white text-lg" />
            </div>
            <p className="text-base font-bold text-gray-800">{title}</p>
          </div>

          <div className="ml-10">
            <p className="text-4xl font-bold text-gray-900 mb-2">
              <AnimatedCounter value={value} />
              {valueSuffix ? <span>{valueSuffix}</span> : null}
            </p>
            {subtitle && (
              <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
            )}
            {change !== undefined && (
              <div className={`flex items-center gap-1 ${changeType === 'up' ? 'text-[#F5C200]' : 'text-[#8B8680]'}`}>
                {changeType === 'up' ? (
                  <HiArrowUp className="text-sm" />
                ) : (
                  <HiArrowDown className="text-sm" />
                )}
                <span className="text-sm font-semibold">{Math.abs(change)}%</span>
                <span className="text-sm text-gray-500 ml-1">จากเมื่อวาน</span>
              </div>
            )}
          </div>

          {sparklineData && (
            <div className="mt-4 h-12">
              <Sparkline
                data={sparklineData}
                color={gradient[0]}
                height={48}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

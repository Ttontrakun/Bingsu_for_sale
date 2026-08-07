import ntLogoMark from '../assets/images/nt-logo-mark.svg';

const DEFAULT_BAR =
  'relative z-30 flex h-[55px] shrink-0 items-center justify-start bg-[#FFD100] px-4 shadow-sm md:px-6';
const DEFAULT_LOGO = 'h-9 w-auto max-w-[240px] object-contain object-left';

/** แถบแบรนด์ NT สีเหลืองด้านบน */
function NtBrandBar({
  logoSrc = ntLogoMark,
  className = DEFAULT_BAR,
  logoClassName = DEFAULT_LOGO,
}) {
  return (
    <header className={className}>
      <a
        href="https://ntplc.co.th/home"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center hover:opacity-90 transition-opacity"
      >
        <img
          src={logoSrc}
          alt="nt National Telecom"
          className={logoClassName}
        />
      </a>
    </header>
  );
}

export default NtBrandBar;

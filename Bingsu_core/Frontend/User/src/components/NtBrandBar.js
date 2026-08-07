import ntLogoMark from '../assets/images/nt-logo-mark.svg';

const DEFAULT_BAR =
  'relative z-20 flex h-16 shrink-0 items-center bg-[#FFD100] px-5 shadow-sm md:h-[4.5rem] md:px-7';
const DEFAULT_LOGO = 'h-11 w-auto object-contain md:h-12';

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

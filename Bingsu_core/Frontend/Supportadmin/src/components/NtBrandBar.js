import ntLogoMark from '../assets/images/nt-logo-mark.svg';

/** แถบแบรนด์ NT สีเหลืองด้านบน */
function NtBrandBar() {
  return (
    <header className="relative z-30 flex h-16 shrink-0 items-center bg-[#FFD100] px-5 shadow-sm md:h-[4.5rem] md:px-7">
      <a
        href="https://ntplc.co.th/home"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center hover:opacity-90 transition-opacity"
      >
        <img
          src={ntLogoMark}
          alt="nt National Telecom"
          className="h-11 w-auto object-contain md:h-12"
        />
      </a>
    </header>
  );
}

export default NtBrandBar;

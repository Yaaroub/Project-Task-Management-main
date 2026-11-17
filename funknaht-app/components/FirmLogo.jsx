export default function FirmLogo({ logo, logoWidth = 120, logoStyle = {}, alt = "Firmenlogo" }) {
  const { zoom = 100, x = 0, y = 0, angle = 0, background = "transparent", mono = false } = logoStyle;
  return <span style={{ display: "inline-block", width: logoWidth, maxWidth: "100%", overflow: "hidden", lineHeight: 0, background, verticalAlign: "middle" }}>
    <img src={logo} alt={alt} style={{ width: "100%", height: "auto", filter: mono ? "grayscale(1)" : undefined,
      transform: `translate(${x}%, ${y}%) rotate(${angle}deg) scale(${zoom / 100})` }} />
  </span>;
}

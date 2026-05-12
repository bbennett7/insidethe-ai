import { ImageResponse } from 'next/og';

export const contentType = 'image/png';
export const size = { width: 1200, height: 630 };

async function loadFonts() {
  // Old Android UA — forces Google Fonts to serve TTF; Satori only supports TTF/OTF
  const css = await fetch(
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Newsreader:ital,wght@1,300&display=swap',
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; U; Android 2.2; en-us; Nexus One Build/FRF91) AppleWebKit/533.1 (KHTML, like Gecko) Version/4.0 Mobile Safari/533.1',
      },
    }
  ).then((r) => r.text());

  function extractUrl(family: string, weight: number, italic = false): string {
    const blocks = css.split('@font-face');
    const block = blocks.find(
      (b) =>
        b.includes(`font-family: '${family}'`) &&
        b.includes(`font-weight: ${weight}`) &&
        (!italic || b.includes('font-style: italic'))
    );
    if (!block)
      throw new Error(`No @font-face block for ${family} ${weight}${italic ? ' italic' : ''}`);
    const match = block.match(/url\(([^)]+)\)\s*format\('(?:truetype|opentype)'\)/);
    if (!match) throw new Error(`No TTF URL in block for ${family} ${weight}`);
    return match[1];
  }

  const [mono400, mono700, newsreader] = await Promise.all([
    fetch(extractUrl('JetBrains Mono', 400)).then((r) => r.arrayBuffer()),
    fetch(extractUrl('JetBrains Mono', 700)).then((r) => r.arrayBuffer()),
    fetch(extractUrl('Newsreader', 300, true)).then((r) => r.arrayBuffer()),
  ]);

  return { mono400, mono700, newsreader };
}

// Matches the mobile mock grid exactly: spacing=34, no wave, same void/ring params
function buildLensGrid(W: number, H: number): string {
  const cx = W / 2;
  const cy = H / 2;
  const spacing = 34;
  const lensR = Math.min(W, H) * 0.22;
  const lensStrength = lensR * lensR * 1.1;

  function lensPoint(x: number, y: number): [number, number] {
    const dx = x - cx;
    const dy = y - cy;
    const dist2 = dx * dx + dy * dy;
    if (dist2 < 4) return [cx, cy];
    const pull = lensStrength / (dist2 + lensR * lensR * 0.12);
    return [+(x - dx * pull).toFixed(1), +(y - dy * pull).toFixed(1)];
  }

  const parts: string[] = [];
  const step = 10;

  for (let gx = cx % spacing; gx <= W + spacing; gx += spacing) {
    let first = true;
    for (let gy = -spacing; gy <= H + spacing; gy += step) {
      const [px, py] = lensPoint(gx, gy);
      parts.push(`${first ? 'M' : 'L'}${px} ${py}`);
      first = false;
    }
  }

  for (let gy = cy % spacing; gy <= H + spacing; gy += spacing) {
    let first = true;
    for (let gx = -spacing; gx <= W + spacing; gx += step) {
      const [px, py] = lensPoint(gx, gy);
      parts.push(`${first ? 'M' : 'L'}${px} ${py}`);
      first = false;
    }
  }

  return parts.join(' ');
}

const TOKENS = [
  { text: 'in', id: '2294', accent: false },
  { text: 'side', id: '3349', accent: false },
  { text: 'the', id: '1820', accent: false },
  { text: '.ai', id: '13 / 1872', accent: true },
] as const;

export default async function OGImage() {
  const { mono400, mono700, newsreader } = await loadFonts();

  const W = 1200;
  const H = 630;
  const gridPath = buildLensGrid(W, H);

  return new ImageResponse(
    <div
      style={{
        width: W,
        height: H,
        display: 'flex',
        background: '#0a0a0a',
        position: 'relative',
      }}
    >
      {/* Lensed grid */}
      <div style={{ display: 'flex', position: 'absolute', top: 0, left: 0, width: W, height: H }}>
        <svg width={W} height={H} aria-hidden="true">
          <path d={gridPath} stroke="rgba(255,255,255,0.13)" strokeWidth="0.9" fill="none" />
        </svg>
      </div>

      {/* Void overlay — matches mobile mock: voidR=lensR*0.56, outer=voidR*2.6 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: H,
          background:
            'radial-gradient(circle 202px at 50% 50%, rgba(10,10,10,1) 0%, rgba(10,10,10,1) 38%, rgba(10,10,10,0.55) 72%, rgba(10,10,10,0) 100%)',
        }}
      />

      {/* Acid ring glow — matches mobile mock: inner=voidR*0.78, outer=voidR*1.9 */}
      <div
        style={{
          display: 'flex',
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: H,
          background:
            'radial-gradient(circle 147px at 50% 50%, transparent 0%, transparent 41%, rgba(196,255,61,0.06) 62%, rgba(196,255,61,0.025) 79%, transparent 100%)',
        }}
      />

      {/* Centred content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          position: 'relative',
        }}
      >
        {/* Inner column — paddingTop leaves room for floating token IDs */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 48,
          }}
        >
          {/* Token row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {TOKENS.map(({ text, id, accent }) => (
              <div key={text} style={{ display: 'flex', position: 'relative' }}>
                {/* Token ID floating above */}
                <div
                  style={{
                    display: 'flex',
                    position: 'absolute',
                    top: -38,
                    left: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono',
                      fontWeight: 400,
                      fontSize: 21,
                      color: '#c4ff3d',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {id}
                  </span>
                </div>
                {/* Token chip */}
                <div
                  style={{
                    display: 'flex',
                    fontFamily: 'JetBrains Mono',
                    fontWeight: accent ? 700 : 400,
                    fontSize: 104,
                    color: accent ? '#0a0a0a' : '#f5f5f0',
                    background: accent ? '#c4ff3d' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${accent ? '#c4ff3d' : 'rgba(255,255,255,0.12)'}`,
                    borderRadius: 3,
                    padding: '22px 36px',
                    letterSpacing: '0.02em',
                  }}
                >
                  {text}
                </div>
              </div>
            ))}
          </div>

          {/* Subtitle */}
          <div style={{ display: 'flex', marginTop: 28, gap: 8 }}>
            <span
              style={{
                fontFamily: 'Newsreader',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 42,
                color: '#f5f5f0',
                letterSpacing: '0.03em',
              }}
            >
              Interactive
            </span>
            <span
              style={{
                fontFamily: 'Newsreader',
                fontStyle: 'italic',
                fontWeight: 300,
                fontSize: 42,
                color: '#c4ff3d',
                letterSpacing: '0.03em',
              }}
            >
              AI Visualization
            </span>
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'JetBrains Mono', data: mono400, style: 'normal', weight: 400 },
        { name: 'JetBrains Mono', data: mono700, style: 'normal', weight: 700 },
        { name: 'Newsreader', data: newsreader, style: 'italic', weight: 300 },
      ],
    }
  );
}

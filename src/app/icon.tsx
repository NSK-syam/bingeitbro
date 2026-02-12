import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Generates /icon.png (used by <link rel="icon"> via metadata and by crawlers).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 56,
          background: '#0A0A0C',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 18,
            borderRadius: 44,
            background: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 18,
            borderRadius: 44,
            background:
              'radial-gradient(circle at 30% 20%, rgba(255,215,154,0.85) 0%, rgba(10,10,12,0) 70%)',
            opacity: 0.9,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 54,
            left: 36,
            right: 36,
            display: 'flex',
            justifyContent: 'space-between',
            opacity: 0.9,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`l-${i}`}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: '#0A0A0C',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`r-${i}`}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  background: '#0A0A0C',
                }}
              />
            ))}
          </div>
        </div>
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            fontSize: 84,
            fontWeight: 800,
            color: '#0A0A0C',
            letterSpacing: 6,
            fontFamily: 'Trebuchet MS, Arial Black, Arial, sans-serif',
            marginTop: 10,
          }}
        >
          BiB
        </div>
      </div>
    ),
    {
      width: 256,
      height: 256,
    }
  );
}


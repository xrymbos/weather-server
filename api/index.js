const axios = require('axios');
const { createCanvas, registerFont } = require('canvas');
const path = require('path');
const fs = require('fs');

// Register bundled font(s) so canvas can render text on systems without
// system fonts (e.g. Vercel serverless).  Any .ttf placed in fonts/ will
// be picked up automatically.
const fontDir = path.join(__dirname, 'fonts');
if (fs.existsSync(fontDir)) {
  for (const f of fs.readdirSync(fontDir)) {
    if (f.endsWith('.ttf') || f.endsWith('.otf')) {
      registerFont(path.join(fontDir, f), { family: 'Noto Sans' });
    }
  }
}

/**
 * Convert an RGBA canvas to a 24-bit BMP buffer.
 * Canvas uses RGBA (4 bytes/pixel, row top-to-bottom).
 * BMP 24-bit uses BGR (3 bytes/pixel, row bottom-to-top) with row padding to 4 bytes.
 */
function canvasToBmp24(canvas) {
  const { width, height } = canvas;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data; // RGBA, top-to-bottom

  const rowSize = (width * 3 + 3) & ~3; // each row padded to 4-byte boundary
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);
  let o = 0;

  // --- BITMAPFILEHEADER (14 bytes) ---
  buf.write('BM', o, 'ascii'); o += 2;
  buf.writeUInt32LE(fileSize, o); o += 4;
  o += 4; // reserved
  buf.writeUInt32LE(54, o); o += 4; // pixel data offset

  // --- BITMAPINFOHEADER (40 bytes) ---
  buf.writeUInt32LE(40, o); o += 4;   // header size
  buf.writeInt32LE(width, o); o += 4;
  buf.writeInt32LE(height, o); o += 4; // positive = bottom-up
  buf.writeUInt16LE(1, o); o += 2;    // color planes
  buf.writeUInt16LE(24, o); o += 2;   // bits per pixel
  buf.writeUInt32LE(0, o); o += 4;    // no compression
  buf.writeUInt32LE(pixelDataSize, o); o += 4;
  buf.writeInt32LE(2835, o); o += 4;  // horizontal resolution (72 DPI)
  buf.writeInt32LE(2835, o); o += 4;  // vertical resolution
  o += 4; // colors in palette
  o += 4; // important colors

  // --- Pixel data (bottom-up, BGR) ---
  const rowPad = rowSize - width * 3;
  const padBytes = Buffer.alloc(rowPad);

  for (let y = height - 1; y >= 0; y--) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      const p = rowStart + x * 4;
      buf[o++] = pixels[p + 2]; // B
      buf[o++] = pixels[p + 1]; // G
      buf[o++] = pixels[p];     // R
    }
    if (rowPad) padBytes.copy(buf, o, 0, rowPad);
    o += rowPad;
  }

  return buf;
}

module.exports = async function handler(req, res) {
  try {
    // 1. Fetch Current + Forecast
    const [obsRes, forecastRes] = await Promise.all([
      axios.get('http://www.bom.gov.au/fwo/IDN60901/IDN60901.94768.json', { headers: { 'User-Agent': 'Mozilla/5.0' } }),
      axios.get('https://api.weather.bom.gov.au/v1/locations/r3gx2f/forecasts/daily')
    ]);

    const current = obsRes.data.observations.data[0];
    const dailyForecasts = forecastRes.data.data;
    const todayForecast = dailyForecasts[0];

    // 2. Setup Canvas
    const canvas = createCanvas(480, 800);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 480, 800);
    ctx.fillStyle = '#000000';

    // --- TOP SECTION: Current Weather ---
    ctx.font = '24px "Noto Sans"';
    ctx.fillText('SYDNEY, NSW', 40, 60);

    ctx.font = 'bold 120px "Noto Sans"';
    ctx.fillText(`${Math.round(current.air_temp)}°`, 35, 200);

    ctx.font = '28px "Noto Sans"';
    ctx.fillText(todayForecast.short_text || 'Clear', 40, 250);

    ctx.font = 'bold 24px "Noto Sans"';
    const hi = todayForecast.temp_max || '--';
    const lo = todayForecast.temp_min || (dailyForecasts[1] ? dailyForecasts[1].temp_min : '--');
    ctx.fillText(`L: ${lo}°  H: ${hi}°`, 40, 290);

    // --- MIDDLE SECTION: Details ---
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, 330); ctx.lineTo(440, 330); ctx.stroke();

    const drawDetail = (label, value, y) => {
      ctx.font = '20px "Noto Sans"';
      ctx.fillText(label, 40, y);
      ctx.textAlign = 'right';
      ctx.fillText(value, 440, y);
      ctx.textAlign = 'left';
    };

    drawDetail('Humidity', `${current.rel_hum}%`, 370);
    drawDetail('Wind', `${current.wind_spd_kmh} km/h ${current.wind_dir}`, 410);
    drawDetail('Rain Chance', `${todayForecast.rain.chance}%`, 450);

    // --- BOTTOM SECTION: Weekly Forecast ---
    ctx.beginPath(); ctx.moveTo(40, 490); ctx.lineTo(440, 490); ctx.stroke();

    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    for (let i = 1; i <= 4; i++) {
        const f = dailyForecasts[i];
        if (!f) break;

        const y = 500 + (i * 60);
        const date = new Date(f.date);
        const dayLabel = days[date.getDay()];

        ctx.font = 'bold 24px "Noto Sans"';
        ctx.fillText(dayLabel, 40, y);

        ctx.textAlign = 'right';
        ctx.font = '24px "Noto Sans"';
        const range = `${f.temp_max || '--'}° / ${f.temp_min || '--'}°`;
        ctx.fillText(range, 440, y);
        ctx.textAlign = 'left';
    }

    // Footer
    const now = new Date();
    ctx.font = '16px "Noto Sans"';
    const updateStr = `Updated: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    ctx.fillText(updateStr, 40, 770);

    // 3. Return as 24-bit BMP response
    const buffer = canvasToBmp24(canvas);
    res.setHeader('Content-Type', 'image/bmp');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(buffer);

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
};

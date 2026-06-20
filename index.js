const axios = require('axios');
const { createCanvas } = require('canvas');
const fs = require('fs');

async function generateDashboard() {
  try {
    console.log('Fetching weather data...');
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
    ctx.font = '24px sans-serif';
    ctx.fillText('SYDNEY, NSW', 40, 60);

    ctx.font = 'bold 120px sans-serif';
    ctx.fillText(`${Math.round(current.air_temp)}°`, 35, 200);

    ctx.font = '28px sans-serif';
    ctx.fillText(todayForecast.short_text || 'Clear', 40, 250);
    
    ctx.font = 'bold 24px sans-serif';
    // Use temp_max from today, and find min from tomorrow if today's is null
    const hi = todayForecast.temp_max || '--';
    const lo = todayForecast.temp_min || (dailyForecasts[1] ? dailyForecasts[1].temp_min : '--');
    ctx.fillText(`L: ${lo}°  H: ${hi}°`, 40, 290);

    // --- MIDDLE SECTION: Details ---
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, 330); ctx.lineTo(440, 330); ctx.stroke();

    const drawDetail = (label, value, y) => {
      ctx.font = '20px sans-serif';
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
        
        ctx.font = 'bold 24px sans-serif';
        ctx.fillText(dayLabel, 40, y);
        
        ctx.textAlign = 'right';
        ctx.font = '24px sans-serif';
        const range = `${f.temp_max || '--'}° / ${f.temp_min || '--'}°`;
        ctx.fillText(range, 440, y);
        ctx.textAlign = 'left';
    }

    // Footer
    const now = new Date();
    ctx.font = '16px sans-serif';
    const updateStr = `Updated: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
    ctx.fillText(updateStr, 40, 770);

    // 3. Save to File
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync('dashboard.png', buffer);
    console.log('Dashboard generated: dashboard.png');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

generateDashboard();

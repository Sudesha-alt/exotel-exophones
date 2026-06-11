const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXOTEL_SID = process.env.EXOTEL_SID;
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;

const getUrl = () =>
  `https://${EXOTEL_API_KEY}:${EXOTEL_API_TOKEN}@api.in.exotel.com/v2_beta/Accounts/${EXOTEL_SID}/AvailablePhoneNumbers/IN/Mobile`;

app.get('/debug', async (req, res) => {
  try {
    const response = await axios.get(getUrl(), {
      params: { InRegion: 'MP', PageSize: 50 }
    });
    return res.json({ total: response.data.length, numbers: response.data });
  } catch (err) {
    return res.json({ error: err.message, details: err.response?.data });
  }
});

app.post('/exophones', async (req, res) => {
  try {
    const count = parseInt(req.body.count) || 10;

    const response = await axios.get(getUrl(), {
      params: { InRegion: 'MP', PageSize: 50 }
    });

    const allNumbers = response.data || [];

    if (allNumbers.length === 0) {
      return res.json({ text: '⚠️ No Madhya Pradesh numbers available in Exotel.' });
    }

    // Shuffle and pick random
    const shuffled = allNumbers.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    const lines = selected.map((p, i) =>
      `${i + 1}. ${p.friendly_name || 'N/A'} — ${p.phone_number}`
    ).join('\n');

    return res.json({
      text: `📞 Exophones — Madhya Pradesh (${selected.length} random numbers)\n\n${lines}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({ text: `❌ Error: ${err.message}` });
  }
});

app.get('/', (req, res) => res.send('Exophones service running ✅'));

app.listen(process.env.PORT || 3000, () => console.log('Server running'));

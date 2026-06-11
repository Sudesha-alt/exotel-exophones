const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXOTEL_SID = process.env.EXOTEL_SID;
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;

const BASE_URL = `https://api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}/IncomingPhoneNumbers.json`;

app.get('/debug', async (req, res) => {
  try {
    const response = await axios.get(BASE_URL, {
      auth: {
        username: EXOTEL_API_KEY,
        password: EXOTEL_API_TOKEN
      }
    });

    const allPhones = response.data?.TwilioResponse?.IncomingPhoneNumbers || [];

    // Return all phones with every field visible
    return res.json({ total: allPhones.length, phones: allPhones });

  } catch (err) {
    return res.json({
      error: err.message,
      status: err.response?.status,
      details: err.response?.data
    });
  }
});

app.get('/envcheck', (req, res) => {
  res.json({
    sid_set: !!EXOTEL_SID,
    key_set: !!EXOTEL_API_KEY,
    token_set: !!EXOTEL_API_TOKEN,
    sid_length: EXOTEL_SID?.length,
    key_length: EXOTEL_API_KEY?.length,
    token_length: EXOTEL_API_TOKEN?.length
  });
});

app.post('/exophones', async (req, res) => {
  try {
    const count = parseInt(req.body.count) || 10;

    const response = await axios.get(BASE_URL, {
      auth: {
        username: EXOTEL_API_KEY,
        password: EXOTEL_API_TOKEN
      }
    });

    const allPhones = response.data?.TwilioResponse?.IncomingPhoneNumbers || [];

    if (allPhones.length === 0) {
      return res.json({ text: '⚠️ No exophones found in your Exotel account.' });
    }

    const shuffled = allPhones.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    const lines = selected.map((p, i) =>
      `${i + 1}. ${p.FriendlyName || 'N/A'} — ${p.PhoneNumber}`
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

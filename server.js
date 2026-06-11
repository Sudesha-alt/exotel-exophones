const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXOTEL_SID = process.env.EXOTEL_SID;
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;

app.get('/debug', async (req, res) => {
  try {
    const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/IncomingPhoneNumbers.json`;

    const response = await axios.get(url, {
      auth: {
        username: EXOTEL_API_KEY,
        password: EXOTEL_API_TOKEN
      }
    });

    const allPhones = response.data?.TwilioResponse?.IncomingPhoneNumbers || [];

    const mapped = allPhones.map(p => ({
      FriendlyName: p.FriendlyName,
      PhoneNumber: p.PhoneNumber,
      Region: p.Region,
      Circle: p.Circle,
      Type: p.Type
    }));

    return res.json({ total: mapped.length, phones: mapped });

  } catch (err) {
    return res.json({ error: err.message });
  }
});

app.post('/exophones', async (req, res) => {
  try {
    const count = parseInt(req.body.count) || 10;

    const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/IncomingPhoneNumbers.json`;

    const response = await axios.get(url, {
      auth: {
        username: EXOTEL_API_KEY,
        password: EXOTEL_API_TOKEN
      }
    });

    const allPhones = response.data?.TwilioResponse?.IncomingPhoneNumbers || [];

    if (allPhones.length === 0) {
      return res.json({ text: '⚠️ No exophones found in your Exotel account.' });
    }

    // Shuffle and pick random numbers
    const shuffled = allPhones.sort(() => Math.random() - 0.5);
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

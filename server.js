const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXOTEL_SID = process.env.EXOTEL_SID;
const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;

app.post('/exophones', async (req, res) => {
  try {
    const region = (req.body.region || 'madhya pradesh').toLowerCase();
    const count = parseInt(req.body.count) || 10;
    const status = (req.body.status || 'active').toLowerCase();

    // Fetch all exophones from Exotel
    const url = `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/IncomingPhoneNumbers.json`;

    const response = await axios.get(url, {
      auth: {
        username: EXOTEL_API_KEY,
        password: EXOTEL_API_TOKEN
      }
    });

    const allPhones = response.data?.TwilioResponse?.IncomingPhoneNumbers || [];

    // Filter by region
    const filtered = allPhones.filter(p => {
      const r = (p.Region || '').toLowerCase();
      return r.includes(region);
    });

    if (filtered.length === 0) {
      return res.json({ text: `⚠️ No exophones found for region: ${region}` });
    }

    // Shuffle and pick random numbers
    const shuffled = filtered.sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    // Format message
    const lines = selected.map((p, i) =>
      `${i + 1}. *${p.FriendlyName || 'N/A'}* — \`${p.PhoneNumber}\``
    ).join('\n');

    const message = {
      text: `📞 *Exophones — ${region.toUpperCase()} (${selected.length} random numbers)*\n\n${lines}`
    };

    return res.json(message);

  } catch (err) {
    console.error(err.message);
    return res.json({ text: `❌ Error: ${err.message}` });
  }
});

app.get('/', (req, res) => res.send('Exophones service running ✅'));

app.listen(process.env.PORT || 3000, () => console.log('Server running'));
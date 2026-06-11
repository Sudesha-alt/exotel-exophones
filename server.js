const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;

const AVAILABLE_URL = `https://api.exotel.com/v2_beta/Accounts/convin3/AvailablePhoneNumbers/IN/Landline`;
const INCOMING_URL = `https://api.exotel.com/v2_beta/Accounts/convin3/IncomingPhoneNumbers`;

app.get('/debug', async (req, res) => {
  try {
    const response = await axios.get(AVAILABLE_URL, {
      auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
      params: { InRegion: 'MP', PageSize: 50 }
    });
    return res.json({ total: response.data.length, numbers: response.data });
  } catch (err) {
    return res.json({ error: err.message, status: err.response?.status, details: err.response?.data });
  }
});

app.get('/envcheck', (req, res) => {
  res.json({
    key_set: !!EXOTEL_API_KEY,
    token_set: !!EXOTEL_API_TOKEN,
    key_length: EXOTEL_API_KEY?.length,
    token_length: EXOTEL_API_TOKEN?.length
  });
});

app.post('/exophones', async (req, res) => {
  try {
    const count = parseInt(req.body.count) || 10;

    const response = await axios.get(AVAILABLE_URL, {
      auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
      params: { InRegion: 'MP', PageSize: 50 }
    });

    const allNumbers = response.data || [];

    if (allNumbers.length === 0) {
      return res.json({ text: '⚠️ No Madhya Pradesh Landline numbers available.' });
    }

    const shuffled = allNumbers.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    const lines = selected.map((p, i) =>
      `${i + 1}. ${p.friendly_name || 'N/A'} — ${p.phone_number}`
    ).join('\n');

    return res.json({
      text: `📞 Exophones — Madhya Pradesh Landline (${selected.length} random numbers)\n\n${lines}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({ text: `❌ Error: ${err.message}` });
  }
});

app.post('/purchase', async (req, res) => {
  try {
    const phoneNumber = req.body.phone_number;
    const flowSid = req.body.flowsid;

    if (!phoneNumber) {
      return res.json({ text: '⚠️ Please provide a phone number to purchase.' });
    }

    // Step 1 — Purchase the number
    const purchaseParams = new URLSearchParams();
    purchaseParams.append('PhoneNumber', phoneNumber);

    const purchaseResponse = await axios.post(
      INCOMING_URL,
      purchaseParams,
      {
        auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const purchasedNumber = purchaseResponse.data;
    const exophoneSid = purchasedNumber.sid;

    // Step 2 — Assign flow if flowsid provided
    if (flowSid && exophoneSid) {
      const assignParams = new URLSearchParams();
      assignParams.append('VoiceUrl', `https://my.exotel.com/convin3/exoml/start_voice/${flowSid}`);

      await axios.put(
        `${INCOMING_URL}/${exophoneSid}`,
        assignParams,
        {
          auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );
    }

    return res.json({
      text: `✅ Number Purchased & Flow Assigned!\n\n📞 Number: ${purchasedNumber.phone_number}\n🏷️ Name: ${purchasedNumber.friendly_name}\n🔗 Voice URL: https://my.exotel.com/convin3/exoml/start_voice/${flowSid}\n💰 Rental: ₹${purchasedNumber.rental_price}/month\n📋 SID: ${exophoneSid}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({
      text: `❌ Failed: ${JSON.stringify(err.response?.data)}`
    });
  }
});

app.post('/assign', async (req, res) => {
  try {
    const phoneNumber = req.body.phone;
    const flowSid = req.body.flowsid;

    if (!phoneNumber || !flowSid) {
      return res.json({ text: '⚠️ Please provide both phone number and flow SID.' });
    }

    // Step 1 — Find ExoPhone SID by phone number
    const listResponse = await axios.get(INCOMING_URL, {
      auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN }
    });

    const allNumbers = listResponse.data?.incoming_phone_numbers || [];
    const matched = allNumbers.find(p => 
      p.phone_number === phoneNumber || 
      p.phone_number === `+91${phoneNumber}` ||
      p.friendly_name === phoneNumber
    );

    if (!matched) {
      return res.json({ text: `⚠️ No ExoPhone found for number: ${phoneNumber}` });
    }

    const exophoneSid = matched.sid;

    // Step 2 — Assign flow
    const assignParams = new URLSearchParams();
    assignParams.append('VoiceUrl', `https://my.exotel.com/convin3/exoml/start_voice/${flowSid}`);

    const response = await axios.put(
      `${INCOMING_URL}/${exophoneSid}`,
      assignParams,
      {
        auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const data = response.data;

    return res.json({
      text: `✅ Flow Assigned!\n\n📞 Number: ${data.phone_number}\n🏷️ Name: ${data.friendly_name}\n🔗 Voice URL: ${data.voice_url}\n📋 SID: ${exophoneSid}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({
      text: `❌ Assign failed: ${JSON.stringify(err.response?.data)}`
    });
  }
});
app.get('/', (req, res) => res.send('Exophones service running ✅'));

app.listen(process.env.PORT || 3000, () => console.log('Server running'));

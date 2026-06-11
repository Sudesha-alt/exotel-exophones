const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;

const getBaseUrl = () =>
  `https://api.exotel.com/v2_beta/Accounts/convin3/AvailablePhoneNumbers/IN/Landline`;

app.get('/debug', async (req, res) => {
  try {
    const response = await axios.get(getBaseUrl(), {
      auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
      params: { InRegion: 'MP', PageSize: 50 }
    });
    return res.json({ total: response.data.length, numbers: response.data });
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
    key_set: !!EXOTEL_API_KEY,
    token_set: !!EXOTEL_API_TOKEN,
    key_length: EXOTEL_API_KEY?.length,
    token_length: EXOTEL_API_TOKEN?.length
  });
});

app.post('/exophones', async (req, res) => {
  try {
    const count = parseInt(req.body.count) || 10;

    const response = await axios.get(getBaseUrl(), {
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

app.post('/assign', async (req, res) => {
  try {
    const exophoneSid = req.body.sid;
    const voiceUrl = req.body.voiceurl;
    const smsUrl = req.body.smsurl;
    const friendlyName = req.body.friendlyname;

    if (!exophoneSid) {
      return res.json({ text: '⚠️ Please provide the ExoPhone SID.' });
    }

    const params = new URLSearchParams();
    if (voiceUrl) params.append('VoiceUrl', voiceUrl);
    if (smsUrl) params.append('SMSUrl', smsUrl);
    if (friendlyName) params.append('FriendlyName', friendlyName);

    const response = await axios.put(
      `https://api.exotel.com/v2_beta/Accounts/convin3/IncomingPhoneNumbers/${exophoneSid}`,
      params,
      {
        auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const data = response.data;

    return res.json({
      text: `✅ ExoPhone Assigned Successfully!\n\n📞 Number: ${data.phone_number}\n🏷️ Name: ${data.friendly_name}\n🔗 Voice URL: ${data.voice_url || 'N/A'}\n📋 SID: ${data.sid}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({
      text: `❌ Assign failed: ${err.response?.data?.message || err.message}`
    });
  }
});

app.post('/purchase', async (req, res) => {
  try {
    const phoneNumber = req.body.phone_number;
    const flowSid = req.body.flowsid;

    if (!phoneNumber) {
      return res.json({ text: '⚠️ Please provide a phone number to purchase.' });
    }

    const params = new URLSearchParams();
    params.append('PhoneNumber', phoneNumber);
    if (flowSid) {
      params.append('VoiceUrl', `https://my.exotel.com/exoml/start/${flowSid}`);
    }

    const response = await axios.post(
      `https://api.exotel.com/v2_beta/Accounts/convin3/IncomingPhoneNumbers`,
      params,
      {
        auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const data = response.data;

    return res.json({
      text: `✅ Number Purchased & Flow Assigned!\n\n📞 Number: ${data.phone_number}\n🏷️ Name: ${data.friendly_name}\n🔗 Voice URL: ${data.voice_url || 'N/A'}\n💰 Rental: ₹${data.rental_price}/month\n📋 SID: ${data.sid}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({
      text: `❌ Purchase failed: ${err.response?.data?.message || err.message}`
    });
  }
});

app.get('/', (req, res) => res.send('Exophones service running ✅'));

app.listen(process.env.PORT || 3000, () => console.log('Server running'));

const express = require('express');
const axios = require('axios');
const { google } = require('googleapis');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const EXOTEL_API_KEY = process.env.EXOTEL_API_KEY;
const EXOTEL_API_TOKEN = process.env.EXOTEL_API_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const AVAILABLE_URL = `https://api.exotel.com/v2_beta/Accounts/convin3/AvailablePhoneNumbers/IN/Landline`;
const INCOMING_URL = `https://api.exotel.com/v2_beta/Accounts/convin3/IncomingPhoneNumbers`;

// Google Sheets auth
const getSheets = () => {
  const auth = new google.auth.JWT(
    GOOGLE_CLIENT_EMAIL,
    null,
    GOOGLE_PRIVATE_KEY,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return google.sheets({ version: 'v4', auth });
};

// Find row by phone number — returns row index (1-based) or -1
const findRowByPhone = async (sheets, phoneNumber) => {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Sheet1!C:C' // Phone Number column
  });
  const rows = res.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === phoneNumber) {
      return i + 1; // 1-based row index
    }
  }
  return -1;
};

// Add new row to sheet
const addSheetRow = async (sheets, rowData) => {
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Sheet1!A:H',
    valueInputOption: 'RAW',
    resource: { values: [rowData] }
  });
};

// Update existing row
const updateSheetRow = async (sheets, rowIndex, rowData) => {
  await sheets.spreadsheets.values.update({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: `Sheet1!A${rowIndex}:H${rowIndex}`,
    valueInputOption: 'RAW',
    resource: { values: [rowData] }
  });
};

// Delete row by phone number
const deleteSheetRow = async (sheets, rowIndex, sheetGid) => {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: GOOGLE_SHEET_ID,
    resource: {
      requests: [{
        deleteDimension: {
          range: {
            sheetId: sheetGid || 0,
            dimension: 'ROWS',
            startIndex: rowIndex - 1,
            endIndex: rowIndex
          }
        }
      }]
    }
  });
};

// Health check
app.get('/', (req, res) => res.send('Exophones service running ✅'));

// Env check
app.get('/envcheck', (req, res) => {
  res.json({
    key_set: !!EXOTEL_API_KEY,
    token_set: !!EXOTEL_API_TOKEN,
    sheet_id_set: !!GOOGLE_SHEET_ID,
    client_email_set: !!GOOGLE_CLIENT_EMAIL,
    private_key_set: !!GOOGLE_PRIVATE_KEY
  });
});

// Debug — list available MP Landline numbers
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

// Get 10 random MP Landline numbers
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

// Purchase number and assign flow
app.post('/purchase', async (req, res) => {
  try {
    const phoneNumber = req.body.phone_number;
    const flowSid = req.body.flowsid;
    const tenantName = req.body.tenant;
    const doneBy = req.body.done_by || 'Unknown';

    if (!phoneNumber) {
      return res.json({ text: '⚠️ Please provide a phone number to purchase.' });
    }

    // Step 1 — Purchase
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

    // Step 3 — Log to Google Sheet
    try {
      const sheets = getSheets();
      const existingRow = await findRowByPhone(sheets, purchasedNumber.phone_number);
      const rowData = [
        new Date().toISOString(),
        tenantName || 'N/A',
        purchasedNumber.phone_number,
        purchasedNumber.friendly_name,
        flowSid || 'N/A',
        flowSid ? `https://my.exotel.com/convin3/exoml/start_voice/${flowSid}` : 'N/A',
        'PURCHASE',
        doneBy
      ];
      if (existingRow === -1) {
        await addSheetRow(sheets, rowData);
      } else {
        await updateSheetRow(sheets, existingRow, rowData);
      }
    } catch (sheetErr) {
      console.error('Sheet error:', sheetErr.message);
    }

    return res.json({
      text: `✅ Number Purchased & Flow Assigned!\n\n📞 Number: ${purchasedNumber.phone_number}\n🏷️ Tenant: ${tenantName || 'N/A'}\n🏷️ Name: ${purchasedNumber.friendly_name}\n🔗 Voice URL: https://my.exotel.com/convin3/exoml/start_voice/${flowSid || 'N/A'}\n💰 Rental: ₹${purchasedNumber.rental_price}/month\n📋 SID: ${exophoneSid}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({ text: `❌ Failed: ${JSON.stringify(err.response?.data)}` });
  }
});

// Assign flow to existing number
app.post('/assign', async (req, res) => {
  try {
    const phoneNumber = req.body.phone;
    const flowSid = req.body.flowsid;
    const tenantName = req.body.tenant;
    const doneBy = req.body.done_by || 'Unknown';

    if (!phoneNumber || !flowSid) {
      return res.json({ text: '⚠️ Please provide both phone number and flow SID.' });
    }

    // Step 1 — Find ExoPhone SID
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

    // Step 3 — Log to Google Sheet
    try {
      const sheets = getSheets();
      const existingRow = await findRowByPhone(sheets, phoneNumber);
      const rowData = [
        new Date().toISOString(),
        tenantName || 'N/A',
        phoneNumber,
        matched.friendly_name,
        flowSid,
        `https://my.exotel.com/convin3/exoml/start_voice/${flowSid}`,
        'ASSIGN',
        doneBy
      ];
      if (existingRow === -1) {
        await addSheetRow(sheets, rowData);
      } else {
        await updateSheetRow(sheets, existingRow, rowData);
      }
    } catch (sheetErr) {
      console.error('Sheet error:', sheetErr.message);
    }

    return res.json({
      text: `✅ Flow Assigned!\n\n📞 Number: ${data.phone_number}\n🏷️ Tenant: ${tenantName || 'N/A'}\n🏷️ Name: ${data.friendly_name}\n🔗 Voice URL: ${data.voice_url}\n📋 SID: ${exophoneSid}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({ text: `❌ Assign failed: ${JSON.stringify(err.response?.data)}` });
  }
});

// Delete number
app.post('/delete', async (req, res) => {
  try {
    const phoneNumber = req.body.phone;
    const doneBy = req.body.done_by || 'Unknown';

    if (!phoneNumber) {
      return res.json({ text: '⚠️ Please provide a phone number to delete.' });
    }

    // Step 1 — Find ExoPhone SID
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

    // Step 2 — Delete from Exotel
    await axios.delete(
      `${INCOMING_URL}/${exophoneSid}`,
      { auth: { username: EXOTEL_API_KEY, password: EXOTEL_API_TOKEN } }
    );

    // Step 3 — Remove from Google Sheet
    try {
      const sheets = getSheets();
      const existingRow = await findRowByPhone(sheets, phoneNumber);
      if (existingRow !== -1) {
        await deleteSheetRow(sheets, existingRow, 0);
      }
    } catch (sheetErr) {
      console.error('Sheet error:', sheetErr.message);
    }

    return res.json({
      text: `🗑️ ExoPhone Deleted!\n\n📞 Number: ${matched.phone_number}\n🏷️ Name: ${matched.friendly_name}\n📋 SID: ${exophoneSid}\n👤 Done By: ${doneBy}`
    });

  } catch (err) {
    console.error(err.message);
    return res.json({ text: `❌ Delete failed: ${JSON.stringify(err.response?.data)}` });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('Server running'));

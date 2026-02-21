/**
 * Calendar Assistant - Vanilla JavaScript Backend
 * This function handles:
 * 1. Daily/Weekly schedule triggers
 * 2. Incoming WhatsApp messages (webhooks)
 * 3. Google Calendar API integration
 */

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY');
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');

// Helper to format events as requested: "07:00-08:00 workout"
function formatEvent(event) {
  const start = new Date(event.start.dateTime || event.start.date);
  const end = new Date(event.end.dateTime || event.end.date);
  
  const formatTime = (date) => {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return `${formatTime(start)}-${formatTime(end)} ${event.summary}`;
}

// Fetch events from Google Calendar
async function getCalendarEvents(accessToken, timeMin, timeMax) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.items || [];
}

// Send WhatsApp message via Meta/Twilio API
async function sendWhatsAppMessage(to, text) {
  console.log(`Sending to ${to}: ${text}`);
  // Implementation for WhatsApp Business API
  const url = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: text }
    })
  });
}

// Main Handler
export default async function handler(req) {
  const { method } = req;

  // Handle Webhook (Incoming WhatsApp Messages)
  if (method === 'POST') {
    const body = await req.json();
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    
    if (message) {
      const text = message.text.body.toLowerCase();
      const from = message.from;

      if (text === 'daily') {
        // Logic to fetch today's events and send
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }
      
      if (text === 'weekly') {
        // Logic to fetch week's events and send
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      }

      // AI Question handling would go here (e.g., using OpenAI)
    }
  }

  return new Response("Calendar Bot Active", { status: 200 });
}
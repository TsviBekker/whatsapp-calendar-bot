/**
 * Calendar Assistant - Vanilla JavaScript Backend (Deno/Supabase)
 * Handles:
 * 1. Daily/Weekly schedule triggers
 * 2. Incoming WhatsApp messages (webhooks)
 * 3. Google Calendar API integration
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY');
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Helper to format events: "07:00-08:00 workout"
function formatEvent(event: any) {
  const start = new Date(event.start.dateTime || event.start.date);
  const end = new Date(event.end.dateTime || event.end.date);
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return `${formatTime(start)}-${formatTime(end)} ${event.summary}`;
}

// Fetch events from Google Calendar
async function getCalendarEvents(accessToken: string, timeMin: Date, timeMax: Date) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const data = await response.json();
  return data.items || [];
}

// Send WhatsApp message
async function sendWhatsAppMessage(to: string, text: string) {
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

export default async function handler(req: Request) {
  const { method } = req;

  // Handle Webhook (Incoming WhatsApp Messages)
  if (method === 'POST') {
    try {
      const body = await req.json();
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      
      if (message) {
        const text = message.text.body.toLowerCase().trim();
        const from = message.from;

        // Fetch user's Google Token from DB
        const { data: user, error } = await supabase
          .from('profiles')
          .select('google_access_token, whatsapp_number')
          .eq('whatsapp_number', from)
          .single();

        if (error || !user) {
          console.error("User not found or error:", error);
          return new Response("User not found", { status: 404 });
        }

        if (text === 'daily') {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const end = new Date();
          end.setHours(23, 59, 59, 999);
          
          const events = await getCalendarEvents(user.google_access_token, start, end);
          const schedule = events.map(formatEvent).join('\n') || "No events scheduled for today.";
          await sendWhatsAppMessage(from, `📅 Today's Schedule:\n\n${schedule}`);
        }
        
        else if (text === 'weekly') {
          const start = new Date();
          const end = new Date();
          end.setDate(end.getDate() + 7);
          
          const events = await getCalendarEvents(user.google_access_token, start, end);
          const schedule = events.map(formatEvent).join('\n') || "No events scheduled for this week.";
          await sendWhatsAppMessage(from, `🗓️ Weekly Overview:\n\n${schedule}`);
        }

        else {
          // AI Question handling would go here
          await sendWhatsAppMessage(from, "I received your message! I'm still learning how to answer questions about your schedule.");
        }
      }
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    } catch (err) {
      console.error("Error processing request:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  }

  return new Response("Calendar Bot Active", { status: 200 });
}
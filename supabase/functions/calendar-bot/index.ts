import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY');
const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

// Helper to format events
function formatEvent(event: any) {
  const start = new Date(event.start.dateTime || event.start.date);
  const end = new Date(event.end.dateTime || event.end.date);
  const formatTime = (date: Date) => date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatTime(start)}-${formatTime(end)} ${event.summary}`;
}

async function getCalendarEvents(accessToken: string, timeMin: Date, timeMax: Date) {
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime`;
  const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  const data = await response.json();
  return data.items || [];
}

async function sendWhatsAppMessage(to: string, text: string) {
  console.log(`[calendar-bot] Sending message to ${to}`);
  const url = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
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
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("[calendar-bot] Received request", body);

    // Handle direct test trigger from Dashboard
    if (body.action === 'test' && body.userId) {
      const { data: user } = await supabase.from('profiles').select('*').eq('id', body.userId).single();
      if (!user || !user.google_access_token || !user.whatsapp_number) {
        return new Response(JSON.stringify({ error: "Profile incomplete" }), { status: 400, headers: corsHeaders });
      }

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      
      const events = await getCalendarEvents(user.google_access_token, start, end);
      const schedule = events.map(formatEvent).join('\n') || "No events scheduled for today.";
      
      await sendWhatsAppMessage(user.whatsapp_number, `🧪 Test Message\n\n📅 Today's Schedule:\n\n${schedule}`);
      return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
    }

    // Handle WhatsApp Webhook (Incoming messages)
    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (message) {
      const text = message.text.body.toLowerCase().trim();
      const from = message.from;
      const { data: user } = await supabase.from('profiles').select('*').eq('whatsapp_number', from).single();

      if (user && (text === 'daily' || text === 'today')) {
        const start = new Date(); start.setHours(0,0,0,0);
        const end = new Date(); end.setHours(23,59,59,999);
        const events = await getCalendarEvents(user.google_access_token, start, end);
        const schedule = events.map(formatEvent).join('\n') || "No events scheduled.";
        await sendWhatsAppMessage(from, `📅 Today's Schedule:\n\n${schedule}`);
      }
    }

    return new Response(JSON.stringify({ status: 'ok' }), { headers: corsHeaders });
  } catch (err) {
    console.error("[calendar-bot] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});
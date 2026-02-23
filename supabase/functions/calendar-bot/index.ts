import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UnifiedItem {
  title: string;
  start: Date;
  end?: Date;
  type: 'event' | 'task';
  allDay: boolean;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // 1. Handle WhatsApp Webhook Verification (GET)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === 'calendar_bot_secret') {
      console.log("[calendar-bot] Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const body = await req.json();
    console.log("[calendar-bot] Received request body:", JSON.stringify(body, null, 2));

    let action = "";
    let userId = "";
    let targetNumber = "";

    // 2. Handle Incoming WhatsApp Message (Webhook POST)
    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;
      const message = value?.messages?.[0];

      if (!message) return new Response('No message', { status: 200 });

      const from = message.from; // User's phone number
      const text = message.text?.body?.toLowerCase().trim();

      if (text === 'daily' || text === 'weekly') {
        action = text;
        // Find user by phone number
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('whatsapp_number', `%${from}%`)
          .single();
        
        if (!profile) {
          await sendWhatsAppMessage(from, "❌ I couldn't find a profile linked to this number. Please set your number in the dashboard.");
          return new Response('User not found', { status: 200 });
        }
        userId = profile.id;
        targetNumber = from;
      } else {
        await sendWhatsAppMessage(from, "🤖 Hi! Send 'daily' to see today's schedule or 'weekly' for the next 7 days.");
        return new Response('Unknown command', { status: 200 });
      }
    } 
    // 3. Handle Manual Trigger from Dashboard (Direct POST)
    else {
      action = body.action;
      userId = body.userId;
    }

    if (!userId) return new Response('Missing User ID', { status: 400 });

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "User profile not found" }), { status: 404, headers: corsHeaders });
    }

    targetNumber = targetNumber || profile.whatsapp_number?.replace(/\D/g, '');
    if (!targetNumber) {
      return new Response(JSON.stringify({ error: "WhatsApp number not set" }), { status: 400, headers: corsHeaders });
    }

    let messageText = "";

    if (action === 'welcome') {
      messageText = "👋 Welcome! I'm your Calendar Assistant. I'll send your schedule here daily.";
    } else if (action === 'test') {
      messageText = "🚀 Test successful! Your WhatsApp integration is working.";
    } else if (action === 'daily' || action === 'weekly') {
      if (!profile.google_access_token) {
        messageText = "⚠️ Google Account not connected. Please go to the dashboard and connect your account.";
      } else {
        try {
          const items = await fetchAllItems(profile.google_access_token, action);
          messageText = formatUnifiedMessage(items, action);
        } catch (err) {
          console.error("[calendar-bot] Fetch Error:", err.message);
          messageText = "❌ Error fetching your schedule. Your Google session might have expired. Please reconnect in the dashboard.";
        }
      }
    }

    const result = await sendWhatsAppMessage(targetNumber, messageText);
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("[calendar-bot] Global Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})

async function fetchAllItems(token: string, type: 'daily' | 'weekly'): Promise<UnifiedItem[]> {
  const now = new Date();
  const timeMinDate = new Date(now);
  timeMinDate.setUTCHours(0, 0, 0, 0);
  const timeMin = timeMinDate.toISOString();
  
  const timeMaxDate = new Date(timeMinDate);
  if (type === 'daily') {
    timeMaxDate.setUTCDate(timeMaxDate.getUTCDate() + 2);
  } else {
    timeMaxDate.setUTCDate(timeMaxDate.getUTCDate() + 9);
  }
  const timeMax = timeMaxDate.toISOString();

  const [events, tasks] = await Promise.all([
    fetchEventsFromAllCalendars(token, timeMin, timeMax).catch(() => []),
    fetchTasksFromAllLists(token, timeMin, timeMax).catch(() => [])
  ]);

  const allItems = [...events, ...tasks].sort((a, b) => a.start.getTime() - b.start.getTime());
  
  const displayLimit = new Date(now);
  if (type === 'daily') {
    displayLimit.setUTCHours(displayLimit.getUTCHours() + 24);
  } else {
    displayLimit.setUTCDate(displayLimit.getUTCDate() + 7);
  }

  return allItems.filter(item => item.start >= timeMinDate && item.start <= displayLimit);
}

async function fetchEventsFromAllCalendars(token: string, timeMin: string, timeMax: string): Promise<UnifiedItem[]> {
  const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!listRes.ok) return [];
  
  const listData = await listRes.json();
  const calendars = listData.items || [];
  const allEvents: UnifiedItem[] = [];
  
  for (const cal of calendars) {
    try {
      const eventsRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!eventsRes.ok) continue;
      const data = await eventsRes.json();
      (data.items || []).forEach((event: any) => {
        allEvents.push({
          title: event.summary || "(No Title)",
          start: new Date(event.start.dateTime || event.start.date),
          end: event.end ? new Date(event.end.dateTime || event.end.date) : undefined,
          type: 'event',
          allDay: !event.start.dateTime
        });
      });
    } catch (e) { console.error(e); }
  }
  return allEvents;
}

async function fetchTasksFromAllLists(token: string, timeMin: string, timeMax: string): Promise<UnifiedItem[]> {
  const listRes = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!listRes.ok) return [];
  const listData = await listRes.json();
  const taskLists = listData.items || [];
  const allTasks: UnifiedItem[] = [];
  for (const list of taskLists) {
    try {
      const tasksRes = await fetch(`https://www.googleapis.com/tasks/v1/lists/${list.id}/tasks?showCompleted=false`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!tasksRes.ok) continue;
      const data = await tasksRes.json();
      (data.items || []).forEach((task: any) => {
        if (task.due) {
          allTasks.push({
            title: task.title || "(No Title)",
            start: new Date(task.due),
            type: 'task',
            allDay: true
          });
        }
      });
    } catch (e) { console.error(e); }
  }
  return allTasks;
}

function formatUnifiedMessage(items: UnifiedItem[], type: 'daily' | 'weekly') {
  if (items.length === 0) {
    return type === 'daily' 
      ? "📅 You have a clear schedule for the next 24 hours! Enjoy your day. ✨" 
      : "📅 No events or tasks found for the upcoming week.";
  }

  let msg = type === 'daily' ? "📅 *Schedule (Next 24h):*\n\n" : "📅 *Weekly Overview (Next 7d):*\n\n";
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace(/\//g, '.');

  items.forEach((item) => {
    const start = item.start;
    const end = item.end;
    let timeStr = item.allDay ? "All Day" : `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}${end ? ' - ' + end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}`;
    const weekday = start.toLocaleDateString('en-US', { weekday: 'long' });
    const dayMonth = start.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace(/\//g, '.');
    const isToday = dayMonth === todayStr;
    const dateStr = (type === 'weekly' || !isToday) ? `${weekday} ${dayMonth} | ` : "";
    msg += `${item.type === 'task' ? '✅' : '•'} ${dateStr}${timeStr}: ${item.title}\n`;
  });
  return msg;
}

async function sendWhatsAppMessage(to: string, text: string) {
  const key = Deno.env.get('WHATSAPP_API_KEY');
  const id = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const url = `https://graph.facebook.com/v17.0/${id}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } })
  });
  return await res.json();
}
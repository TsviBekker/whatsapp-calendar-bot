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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  // Handle Webhook Verification
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === 'calendar_bot_secret') {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const body = await req.json();
    let action = "";
    let userId = "";
    let targetNumber = "";

    // Handle WhatsApp Webhook
    if (body.object === 'whatsapp_business_account') {
      const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return new Response('No message', { status: 200 });

      const from = message.from;
      const text = message.text?.body?.toLowerCase().trim();

      if (text === 'daily' || text === 'weekly') {
        action = text;
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .ilike('whatsapp_number', `%${from}%`)
          .single();
        
        if (!profile) {
          await sendWhatsAppMessage(from, "❌ Profile not found. Please set your number in the dashboard.");
          return new Response('User not found', { status: 200 });
        }
        userId = profile.id;
        targetNumber = from;
      } else {
        await sendWhatsAppMessage(from, "🤖 Send 'daily' or 'weekly' to see your schedule.");
        return new Response('Unknown command', { status: 200 });
      }
    } else {
      action = body.action;
      userId = body.userId;
    }

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!profile) return new Response('Profile not found', { status: 404, headers: corsHeaders });

    targetNumber = targetNumber || profile.whatsapp_number?.replace(/\D/g, '');
    let messageText = "";

    if (action === 'welcome') messageText = "👋 Welcome! I'm ready.";
    else if (action === 'test') messageText = "🚀 Test successful!";
    else if (action === 'daily' || action === 'weekly') {
      if (!profile.google_access_token) {
        messageText = "⚠️ Google Account not connected.";
      } else {
        try {
          const items = await fetchAllItems(profile.google_access_token, action);
          messageText = formatUnifiedMessage(items, action, profile.timezone || 'Asia/Jerusalem');
        } catch (err) {
          console.error("[calendar-bot] Fetch Error:", err.message);
          messageText = "❌ Your Google session has expired. Please open the dashboard to refresh your connection.";
        }
      }
    }

    await sendWhatsAppMessage(targetNumber, messageText);
    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });

  } catch (error) {
    console.error("[calendar-bot] Global Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
  }
})

async function fetchAllItems(token: string, type: 'daily' | 'weekly'): Promise<UnifiedItem[]> {
  const now = new Date();
  const timeMinDate = new Date(now);
  timeMinDate.setHours(0, 0, 0, 0);
  const timeMin = timeMinDate.toISOString();
  
  const timeMaxDate = new Date(timeMinDate);
  timeMaxDate.setDate(timeMaxDate.getDate() + (type === 'daily' ? 2 : 9));
  const timeMax = timeMaxDate.toISOString();

  const [events, tasks] = await Promise.all([
    fetchEventsFromAllCalendars(token, timeMin, timeMax),
    fetchTasksFromAllLists(token)
  ]);

  const allItems = [...events, ...tasks].sort((a, b) => a.start.getTime() - b.start.getTime());
  
  const displayLimit = new Date(now);
  if (type === 'daily') displayLimit.setHours(displayLimit.getHours() + 24);
  else displayLimit.setDate(displayLimit.getDate() + 7);

  return allItems.filter(item => item.start >= timeMinDate && item.start <= displayLimit);
}

async function fetchEventsFromAllCalendars(token: string, timeMin: string, timeMax: string): Promise<UnifiedItem[]> {
  const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!listRes.ok) throw new Error("Google API Error");
  
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
    } catch (e) { console.error("[calendar-bot] Calendar fetch error:", e); }
  }
  return allEvents;
}

async function fetchTasksFromAllLists(token: string): Promise<UnifiedItem[]> {
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
    } catch (e) { console.error("[calendar-bot] Task fetch error:", e); }
  }
  return allTasks;
}

function formatUnifiedMessage(items: UnifiedItem[], type: 'daily' | 'weekly', timezone: string) {
  if (items.length === 0) return "📅 No events found for this period.";
  
  let msg = type === 'daily' ? "📅 *Today's Schedule:*\n\n" : "📅 *Weekly Overview:*\n\n";
  let lastDay = "";

  items.forEach((item) => {
    const startStr = item.start.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false,
      timeZone: timezone 
    });
    
    const endStr = item.end ? item.end.toLocaleTimeString('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false,
      timeZone: timezone 
    }) : "";

    const currentDay = item.start.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      day: '2-digit', 
      month: 'short',
      timeZone: timezone 
    });

    // Add separator for weekly view when day changes
    if (type === 'weekly' && lastDay !== "" && lastDay !== currentDay) {
      msg += "------------------\n";
    }
    lastDay = currentDay;

    const timeDisplay = item.allDay ? "All Day" : `${startStr}${endStr ? ' - ' + endStr : ''}`;
    const datePrefix = type === 'weekly' ? `*${currentDay}*\n` : "";
    
    // Only show the day header once in weekly view
    const showHeader = type === 'weekly' && msg.indexOf(`*${currentDay}*`) === -1;
    
    msg += `${showHeader ? datePrefix : ""}${item.type === 'task' ? '✅' : '•'} ${timeDisplay}: ${item.title}\n`;
  });
  
  return msg;
}

async function sendWhatsAppMessage(to: string, text: string) {
  const key = Deno.env.get('WHATSAPP_API_KEY');
  const id = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  await fetch(`https://graph.facebook.com/v17.0/${id}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } })
  });
}
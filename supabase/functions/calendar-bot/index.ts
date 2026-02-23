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

  try {
    const { action, userId } = await req.json();
    console.log(`[calendar-bot] Action: ${action}, User: ${userId}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error("[calendar-bot] Profile error:", profileError);
      return new Response(JSON.stringify({ error: "User profile not found" }), { status: 404, headers: corsHeaders });
    }

    if (!profile.whatsapp_number) {
      return new Response(JSON.stringify({ error: "WhatsApp number not set" }), { status: 400, headers: corsHeaders });
    }

    const cleanNumber = profile.whatsapp_number.replace(/\D/g, '');
    let messageText = "";

    if (action === 'welcome') {
      messageText = "👋 Welcome! I'm your Calendar Assistant. I'll send your schedule here daily.";
    } else if (action === 'test') {
      messageText = "🚀 Test successful! Your WhatsApp integration is working.";
    } else if (action === 'daily' || action === 'weekly') {
      if (!profile.google_access_token) {
        return new Response(JSON.stringify({ error: "Google Account not connected. Please go to the dashboard and connect your account." }), { status: 400, headers: corsHeaders });
      }
      
      try {
        const items = await fetchAllItems(profile.google_access_token, action);
        console.log(`[calendar-bot] Final items count for message: ${items.length}`);
        messageText = formatUnifiedMessage(items, action);
      } catch (err) {
        console.error("[calendar-bot] Fetch Error:", err.message);
        if (err.message.includes("401") || err.message.includes("UNAUTHENTICATED")) {
          return new Response(JSON.stringify({ error: "Google session expired or permissions missing. Please reconnect your Google account in the dashboard." }), { status: 401, headers: corsHeaders });
        }
        throw err;
      }
    }

    const result = await sendWhatsAppMessage(cleanNumber, messageText);
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

  // We use Promise.all but handle individual failures so one API doesn't block the other
  const [events, tasks] = await Promise.all([
    fetchEventsFromAllCalendars(token, timeMin, timeMax).catch(e => {
      console.error("[calendar-bot] Calendar fetch failed:", e);
      return [];
    }),
    fetchTasksFromAllLists(token, timeMin, timeMax).catch(e => {
      console.error("[calendar-bot] Tasks fetch failed:", e);
      return [];
    })
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
  
  if (!listRes.ok) {
    const errText = await listRes.text();
    console.error("[calendar-bot] Calendar list fetch failed:", errText);
    if (listRes.status === 401 || listRes.status === 403) throw new Error(`AUTH_ERROR: ${listRes.status}`);
    return [];
  }
  
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
    } catch (e) {
      console.error(`[calendar-bot] Error processing calendar ${cal.id}:`, e);
    }
  }
  
  return allEvents;
}

async function fetchTasksFromAllLists(token: string, timeMin: string, timeMax: string): Promise<UnifiedItem[]> {
  const listRes = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!listRes.ok) {
    const errText = await listRes.text();
    console.error("[calendar-bot] Task list fetch failed:", errText);
    // If tasks fail due to permissions, we just return empty and let calendar events through
    if (listRes.status === 401 || listRes.status === 403) {
      console.warn("[calendar-bot] Tasks API access denied. Continuing with calendar only.");
      return [];
    }
    return [];
  }
  
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
    } catch (e) {
      console.error(`[calendar-bot] Error processing task list ${list.id}:`, e);
    }
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
    
    let timeStr = "";
    if (item.allDay) {
      timeStr = "All Day";
    } else {
      const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const endStr = end ? end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : "";
      timeStr = endStr ? `${startStr} - ${endStr}` : startStr;
    }
    
    const weekday = start.toLocaleDateString('en-US', { weekday: 'long' });
    const dayMonth = start.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace(/\//g, '.');
    
    const isToday = dayMonth === todayStr;
    const dateStr = (type === 'weekly' || !isToday) ? `${weekday} ${dayMonth} | ` : "";
    const icon = item.type === 'task' ? "✅" : "•";
    
    msg += `${icon} ${dateStr}${timeStr}: ${item.title}\n`;
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
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });
  return await res.json();
}
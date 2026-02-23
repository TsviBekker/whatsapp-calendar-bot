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
          messageText = formatUnifiedMessage(items, action);
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
  const timeMin = new Date(now);
  timeMin.setHours(0, 0, 0, 0); // Start of today
  
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + (type === 'daily' ? 2 : 8));

  const [events, tasks] = await Promise.all([
    fetchEvents(token, timeMin.toISOString(), timeMax.toISOString()),
    fetchTasks(token)
  ]);

  const allItems = [...events, ...tasks].sort((a, b) => a.start.getTime() - b.start.getTime());
  
  const displayLimit = new Date(now);
  if (type === 'daily') displayLimit.setHours(displayLimit.getHours() + 24);
  else displayLimit.setDate(displayLimit.getDate() + 7);

  return allItems.filter(item => item.start >= timeMin && item.start <= displayLimit);
}

async function fetchEvents(token: string, timeMin: string, timeMax: string): Promise<UnifiedItem[]> {
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error("Google API Error");
  const data = await res.json();
  return (data.items || []).map((event: any) => ({
    title: event.summary || "(No Title)",
    start: new Date(event.start.dateTime || event.start.date),
    end: event.end ? new Date(event.end.dateTime || event.end.date) : undefined,
    type: 'event',
    allDay: !event.start.dateTime
  }));
}

async function fetchTasks(token: string): Promise<UnifiedItem[]> {
  const res = await fetch('https://www.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) return [];
  const listData = await res.json();
  const allTasks: UnifiedItem[] = [];
  for (const list of (listData.items || [])) {
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
  }
  return allTasks;
}

function formatUnifiedMessage(items: UnifiedItem[], type: 'daily' | 'weekly') {
  if (items.length === 0) return "📅 No events found for this period.";
  let msg = type === 'daily' ? "📅 *Today's Schedule:*\n\n" : "📅 *Weekly Overview:*\n\n";
  items.forEach((item) => {
    const timeStr = item.allDay ? "All Day" : item.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = type === 'weekly' ? `${item.start.toLocaleDateString('en-US', { weekday: 'short' })} | ` : "";
    msg += `${item.type === 'task' ? '✅' : '•'} ${dateStr}${timeStr}: ${item.title}\n`;
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
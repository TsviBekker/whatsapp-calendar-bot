import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, userId } = await req.json();
    console.log(
      `[calendar-bot] Received request - Action: ${action}, User: ${userId}`,
    );

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const whatsappKey = Deno.env.get("WHATSAPP_API_KEY");
    const whatsappId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");

    // Check for missing environment variables
    if (!whatsappKey || !whatsappId) {
      console.error(
        "[calendar-bot] Missing WhatsApp configuration (API Key or Phone Number ID)",
      );
      return new Response(
        JSON.stringify({
          error: "WhatsApp configuration is missing in Supabase secrets.",
        }),
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl ?? "", supabaseKey ?? "");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error("[calendar-bot] Profile fetch error:", profileError);
      return new Response(JSON.stringify({ error: "User profile not found" }), {
        status: 404,
        headers: corsHeaders,
      });
    }

    if (!profile.whatsapp_number) {
      console.warn("[calendar-bot] WhatsApp number not set for user:", userId);
      return new Response(
        JSON.stringify({ error: "WhatsApp number not set" }),
        { status: 400, headers: corsHeaders },
      );
    }

    console.log(`[calendar-bot] Sending to number: ${profile.whatsapp_number}`);

    let messageText = "";

    if (action === "welcome") {
      messageText =
        "👋 Welcome! I'm your Calendar Assistant. I'll send your schedule here daily.";
    } else if (action === "test") {
      messageText = "🚀 Test successful! Your WhatsApp integration is working.";
    } else if (action === "daily" || action === "weekly") {
      if (!profile.google_access_token) {
        console.warn("[calendar-bot] Google token missing for user:", userId);
        return new Response(
          JSON.stringify({ error: "Google Calendar not connected." }),
          { status: 400, headers: corsHeaders },
        );
      }

      try {
        const events = await fetchCalendarEvents(
          profile.google_access_token,
          action,
        );
        messageText = formatEventsMessage(events, action);
      } catch (err) {
        console.error("[calendar-bot] Calendar Fetch Error:", err.message);
        if (err.message.includes("401")) {
          return new Response(
            JSON.stringify({
              error: "Google session expired. Please reconnect.",
            }),
            { status: 401, headers: corsHeaders },
          );
        }
        throw err;
      }
    }

    console.log(`[calendar-bot] Final message text: ${messageText}`);
    const result = await sendWhatsAppMessage(
      profile.whatsapp_number,
      messageText,
      whatsappKey,
      whatsappId,
    );

    if (result.error) {
      console.error(
        "[calendar-bot] WhatsApp API Error:",
        JSON.stringify(result.error),
      );
      return new Response(
        JSON.stringify({
          error: "WhatsApp API rejected the message",
          details: result.error,
        }),
        { status: 400, headers: corsHeaders },
      );
    }

    console.log(
      "[calendar-bot] Message sent successfully:",
      JSON.stringify(result),
    );
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[calendar-bot] Global Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

async function fetchCalendarEvents(token: string, type: "daily" | "weekly") {
  const now = new Date();
  const timeMin = now.toISOString();
  const end = new Date(now.getTime());

  if (type === "daily") {
    end.setHours(now.getHours() + 24);
  } else {
    end.setDate(now.getDate() + 7);
  }
  const timeMax = end.toISOString();

  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errorData = await res.json();
    throw new Error(
      `Google API Error: ${res.status} - ${errorData.error?.message || "Unknown error"}`,
    );
  }

  const data = await res.json();
  return data.items || [];
}

function formatEventsMessage(events: any[], type: "daily" | "weekly") {
  if (events.length === 0) {
    return type === "daily"
      ? "📅 You have a clear schedule for the next 24 hours! Enjoy your day. ✨"
      : "📅 No events found for the upcoming week.";
  }

  let msg =
    type === "daily"
      ? "📅 *Schedule (Next 24h):*\n\n"
      : "📅 *Weekly Overview (Next 7d):*\n\n";

  events.forEach((event: any) => {
    const start = new Date(event.start.dateTime || event.start.date);
    const timeStr = event.start.dateTime
      ? start.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : "All Day";

    const isTomorrow = start.getDate() !== new Date().getDate();
    const dateStr =
      type === "weekly" || isTomorrow
        ? `${start.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} | `
        : "";
    msg += `• ${dateStr}${timeStr}: ${event.summary}\n`;
  });

  return msg;
}

async function sendWhatsAppMessage(
  to: string,
  text: string,
  key: string,
  id: string,
) {
  const url = `https://graph.facebook.com/v17.0/${id}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  return await res.json();
}

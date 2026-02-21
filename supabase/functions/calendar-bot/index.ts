import { serve } from "https://deno.land/std@0.190.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, userId } = await req.json();
    console.log(`[calendar-bot] Received action: ${action} for user: ${userId}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Fetch user profile to get the WhatsApp number
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('whatsapp_number')
      .eq('id', userId)
      .single();

    if (profileError || !profile?.whatsapp_number) {
      console.error("[calendar-bot] Profile error or no number found", profileError);
      return new Response(JSON.stringify({ error: "No WhatsApp number found for user" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Clean the phone number (remove +, spaces, etc)
    const cleanNumber = profile.whatsapp_number.replace(/\D/g, '');
    
    let messageText = "";
    if (action === 'welcome') {
      messageText = "👋 Welcome to Calendar Bot! I'll send your schedule here every morning at 7:00 AM.";
    } else if (action === 'test') {
      messageText = "🚀 This is a test message from your Calendar Bot! If you see this, your integration is working perfectly.";
    }

    const result = await sendWhatsAppMessage(cleanNumber, messageText);
    console.log("[calendar-bot] WhatsApp API result", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("[calendar-bot] Unexpected error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
})

async function sendWhatsAppMessage(to: string, text: string) {
  const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY');
  const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  
  if (!WHATSAPP_API_KEY || !WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Missing WhatsApp API credentials in Supabase secrets");
  }

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
  
  return await res.json();
}
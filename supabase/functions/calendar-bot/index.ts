// ... existing imports and setup

async function sendWhatsAppMessage(to: string, text: string) {
  const WHATSAPP_API_KEY = Deno.env.get('WHATSAPP_API_KEY');
  const WHATSAPP_PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  
  const url = `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${WHATSAPP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: to, // The user's phone number
      type: "text",
      text: { body: text }
    })
  });
  
  return await res.json();
}

// ... rest of the function
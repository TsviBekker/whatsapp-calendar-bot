import React, { useEffect, useState } from 'react';
import { Calendar, MessageSquare, Bell, LogOut, ExternalLink, Loader2, Send, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/AuthProvider';
import { showSuccess, showError } from '@/utils/toast';

const Dashboard = () => {
  const { user, session } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  useEffect(() => {
    const handleOAuthTokens = async () => {
      if (session?.provider_token && user) {
        const { error } = await supabase
          .from('profiles')
          .upsert({ 
            id: user.id, 
            google_access_token: session.provider_token,
            google_refresh_token: session.provider_refresh_token,
            updated_at: new Date().toISOString()
          });
        
        if (!error) {
          setIsConnected(true);
          showSuccess("Google Calendar connected!");
        }
      }
    };
    handleOAuthTokens();
  }, [session, user]);

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setWhatsappNumber(data.whatsapp_number || "");
        setIsConnected(!!data.google_access_token);
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'https://www.googleapis.com/auth/calendar.readonly',
          redirectTo: window.location.origin + '/dashboard',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      });
      if (error) throw error;
    } catch (error) {
      showError("Failed to connect Google Calendar.");
    }
  };

  const saveWhatsappNumber = async () => {
    if (!whatsappNumber || whatsappNumber.length < 8) {
      showError("Please enter a valid number with country code.");
      return;
    }
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({ 
          id: user?.id, 
          whatsapp_number: whatsappNumber,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      
      showSuccess("Destination updated!");
      
      await supabase.functions.invoke('calendar-bot', {
        body: { action: 'welcome', userId: user?.id }
      });
      
    } catch (error) {
      showError("Failed to update profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!isConnected || !whatsappNumber) {
      showError("Please connect Google and set your destination number first.");
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('calendar-bot', {
        body: { action: 'test', userId: user?.id }
      });

      if (error) throw error;
      showSuccess("Test message sent!");
    } catch (error) {
      showError("Failed to send test message.");
    } finally {
      setTesting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Calendar Assistant</h1>
            <p className="text-slate-500">Logged in as {user?.email}</p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={isConnected && whatsappNumber ? "default" : "secondary"} className="px-3 py-1">
              {isConnected && whatsappNumber ? "Bot Active" : "Setup Incomplete"}
            </Badge>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500 hover:text-red-600">
              <LogOut className="w-4 h-4 mr-2" /> Sign Out
            </Button>
          </div>
        </header>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white border p-1 rounded-xl">
            <TabsTrigger value="overview" className="rounded-lg">Overview</TabsTrigger>
            <TabsTrigger value="settings" className="rounded-lg">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Google Calendar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isConnected ? 'bg-blue-100' : 'bg-slate-100'}`}>
                        <Calendar className={`w-5 h-5 ${isConnected ? 'text-blue-600' : 'text-slate-400'}`} />
                      </div>
                      <span className="font-semibold text-slate-700">{isConnected ? "Connected" : "Not Linked"}</span>
                    </div>
                    <Button variant={isConnected ? "outline" : "default"} size="sm" onClick={handleConnectGoogle}>
                      {isConnected ? "Reconnect" : "Connect"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Destination</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${whatsappNumber ? 'bg-green-100' : 'bg-slate-100'}`}>
                        <Users className={`w-5 h-5 ${whatsappNumber ? 'text-green-600' : 'text-slate-400'}`} />
                      </div>
                      <span className="font-semibold text-slate-700">{whatsappNumber ? "Set" : "Pending"}</span>
                    </div>
                    <Badge variant="outline" className={whatsappNumber ? "text-green-600 border-green-200 bg-green-50" : "text-amber-600 border-amber-200 bg-amber-50"}>
                      {whatsappNumber ? "Ready" : "Action Required"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold text-slate-400 uppercase tracking-widest">Next Update</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <Bell className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">Tomorrow, 07:00</p>
                      <p className="text-xs text-slate-500">Daily Schedule</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Schedule Preview</CardTitle>
                  <CardDescription>This is how your daily message will look.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-slate-900 text-slate-100 p-6 rounded-2xl font-mono text-sm shadow-lg">
                    <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-2">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <p className="text-slate-400 text-xs uppercase tracking-wider">WhatsApp • 07:00 AM</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-blue-400">📅 Today's Schedule:</p>
                      <p>07:00-08:00 workout</p>
                      <p>09:30-11:00 meeting about X at work</p>
                      <p>18:00-21:00 date night with fiance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm flex flex-col justify-center items-center p-8 text-center space-y-4">
                <div className="p-4 bg-blue-50 rounded-full">
                  <Send className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <CardTitle>Test Integration</CardTitle>
                  <CardDescription className="mt-2">
                    Send a real message to your destination right now.
                  </CardDescription>
                </div>
                <Button 
                  onClick={handleSendTest} 
                  disabled={testing || !isConnected || !whatsappNumber}
                  className="w-full max-w-xs rounded-xl h-12"
                >
                  {testing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  {testing ? "Sending..." : "Send Test Message"}
                </Button>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>Set where you want to receive your schedules.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <div className="grid gap-3">
                    <Label htmlFor="whatsapp" className="text-slate-700 font-semibold">Destination WhatsApp Number</Label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Input 
                        id="whatsapp" 
                        placeholder="+1234567890" 
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        className="max-w-sm rounded-xl h-11"
                      />
                      <Button onClick={saveWhatsappNumber} disabled={saving} className="rounded-xl h-11 px-6">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        {saving ? "Saving..." : "Save Destination"}
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">Enter your phone number with country code. You can then forward these messages to your group.</p>
                  </div>
                </div>

                <div className="pt-6 border-t">
                  <Label className="text-base font-semibold text-slate-700 block mb-2">Google Calendar Access</Label>
                  <p className="text-sm text-slate-500 mb-6">We need read-only access to your primary calendar.</p>
                  <Button 
                    variant={isConnected ? "outline" : "default"} 
                    onClick={handleConnectGoogle}
                    className="rounded-xl h-11 px-6"
                  >
                    {isConnected ? "Reconnect Google Account" : "Connect Google Calendar"}
                    <ExternalLink className="ml-2 w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Dashboard;
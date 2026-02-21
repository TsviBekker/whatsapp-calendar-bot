"use client";

import React from 'react';
import { Calendar, MessageSquare, Settings, Bell, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Dashboard = () => {
  const [isConnected, setIsConnected] = React.useState(false);
  const [whatsappNumber, setWhatsappNumber] = React.useState("");

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Calendar Assistant</h1>
            <p className="text-slate-500">Manage your automated WhatsApp schedule updates.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isConnected ? "default" : "secondary"} className="px-3 py-1">
              {isConnected ? "Bot Active" : "Bot Paused"}
            </Badge>
          </div>
        </header>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-white border">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="logs">Activity Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Google Calendar</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <span className="font-semibold">{isConnected ? "Connected" : "Not Linked"}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setIsConnected(!isConnected)}>
                      {isConnected ? "Disconnect" : "Connect"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">WhatsApp Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <MessageSquare className="w-5 h-5 text-green-600" />
                      </div>
                      <span className="font-semibold">{whatsappNumber ? "Configured" : "Pending"}</span>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Ready</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Next Update</CardTitle>
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

            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Schedule Preview</CardTitle>
                <CardDescription>This is how your daily message will look on WhatsApp.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-900 text-slate-100 p-6 rounded-xl font-mono text-sm max-w-md">
                  <p className="text-slate-400 mb-2">WhatsApp Message • 07:00 AM</p>
                  <div className="space-y-1">
                    <p>07:00-08:00 workout</p>
                    <p>09:30-11:00 meeting about X at work</p>
                    <p>18:00-21:00 date night with fiance</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>Configure when and how you receive updates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Daily Schedule</Label>
                      <p className="text-sm text-slate-500">Send a message every morning at 07:00.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Weekly Overview</Label>
                      <p className="text-sm text-slate-500">Send a message every Saturday at 21:00.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label className="text-base">Interactive Chat</Label>
                      <p className="text-sm text-slate-500">Allow asking questions about your schedule via WhatsApp.</p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </div>

                <div className="space-y-4 pt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="whatsapp">WhatsApp Phone Number</Label>
                    <div className="flex gap-2">
                      <Input 
                        id="whatsapp" 
                        placeholder="+1234567890" 
                        value={whatsappNumber}
                        onChange={(e) => setWhatsappNumber(e.target.value)}
                        className="max-w-sm"
                      />
                      <Button>Save Number</Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>History of messages sent and received.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { time: "Today, 07:00", event: "Daily schedule sent", status: "success" },
                    { time: "Yesterday, 22:15", event: "User asked: 'What's my first meeting tomorrow?'", status: "info" },
                    { time: "Yesterday, 07:00", event: "Daily schedule sent", status: "success" },
                    { time: "Sat, 21:00", event: "Weekly overview sent", status: "success" },
                  ].map((log, i) => (
                    <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-blue-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{log.event}</p>
                          <p className="text-xs text-slate-500">{log.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
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
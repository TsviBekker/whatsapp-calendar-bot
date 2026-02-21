import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Calendar, MessageSquare, ArrowRight } from "lucide-react";
import { MadeWithDyad } from "@/components/made-with-dyad";

const Index = () => {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-4xl mx-auto">
        <div className="mb-8 p-3 bg-blue-50 rounded-2xl">
          <Calendar className="w-12 h-12 text-blue-600" />
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6">
          Your Calendar, <span className="text-blue-600">on WhatsApp.</span>
        </h1>
        <p className="text-xl text-slate-600 mb-10 max-w-2xl">
          Get your daily schedule at 7:00 AM, weekly overviews on Saturdays, and chat with your calendar using AI.
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <Button asChild size="lg" className="rounded-full px-8 h-14 text-lg">
            <Link to="/dashboard">
              Get Started <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" className="rounded-full px-8 h-14 text-lg">
            Learn More
          </Button>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          <div className="p-6 rounded-2xl border bg-slate-50/50">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-bold text-lg mb-2">Daily 7:00 AM</h3>
            <p className="text-slate-600">Wake up to your full schedule formatted exactly how you like it.</p>
          </div>
          <div className="p-6 rounded-2xl border bg-slate-50/50">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <MessageSquare className="w-5 h-5 text-green-600" />
            </div>
            <h3 className="font-bold text-lg mb-2">Interactive Chat</h3>
            <p className="text-slate-600">Ask "What's my next meeting?" or "Am I free at 3 PM?" via WhatsApp.</p>
          </div>
          <div className="p-6 rounded-2xl border bg-slate-50/50">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
              <ArrowRight className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-bold text-lg mb-2">Weekly Recap</h3>
            <p className="text-slate-600">Every Saturday at 9:00 PM, get a bird's eye view of your upcoming week.</p>
          </div>
        </div>
      </main>
      <MadeWithDyad />
    </div>
  );
};

export default Index;